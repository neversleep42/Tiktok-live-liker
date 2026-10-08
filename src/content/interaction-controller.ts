import { HOLD_INTERVAL_MS, LIVE_PLAYER_SELECTORS } from "../shared/constants";
import type { InteractionError } from "../shared/types";
import { isValidInteractionTarget, isVisibleElement } from "./live-detector";

export type InteractionResult = "simulated" | "dispatched";

export interface InteractionEnvironment {
  isEnabled(): boolean;
  isLiveDetected(): boolean;
  isVisible(): boolean;
  hasFocus(): boolean;
  isSimulationMode(): boolean;
  getTarget(): HTMLElement | null;
  executeReal(target: HTMLElement): boolean | void | Promise<boolean | void>;
  executeSimulation(): void;
  onInteraction(result: InteractionResult): void;
  onInteractingChange(interacting: boolean): void;
  onError(error: InteractionError | null): void;
}

export class InteractionController {
  private active = false;
  private generation = 0;
  private timer: number | null = null;
  private pending = false;
  private lastAttemptAt = 0;

  constructor(
    private readonly environment: InteractionEnvironment,
    private intervalMs = HOLD_INTERVAL_MS,
  ) {}

  setIntervalMs(nextMs: number): void {
    if (Number.isFinite(nextMs) && nextMs > 0) {
      this.intervalMs = Math.round(nextMs);
      if (this.active && this.timer !== null) {
        window.clearTimeout(this.timer);
        this.timer = null;
        this.lastAttemptAt = performance.now();
        this.scheduleNext(this.generation);
      }
    }
  }

  get isInteracting(): boolean {
    return this.active;
  }

  trigger(): boolean {
    if (this.active || this.pending) return false;
    this.generation += 1;
    this.active = true;
    const result = this.attempt();
    this.active = false;
    return result;
  }

  start(): boolean {
    if (this.active || this.pending) return false;

    this.active = true;
    this.generation += 1;
    const generation = this.generation;

    if (!this.attempt()) {
      this.stop();
      return false;
    }

    this.environment.onInteractingChange(true);
    this.scheduleNext(generation);
    return true;
  }

  stop(): void {
    const wasActive = this.active;
    this.active = false;
    this.generation += 1;

    if (this.timer !== null) {
      window.clearTimeout(this.timer);
      this.timer = null;
    }

    if (wasActive || this.pending) {
      this.environment.onInteractingChange(false);
    }
  }

  private scheduleNext(generation: number): void {
    if (this.pending || !this.active || generation !== this.generation) return;
    this.timer = window.setTimeout(() => {
      this.timer = null;
      if (!this.active || generation !== this.generation) return;

      if (!this.attempt()) {
        this.stop();
        return;
      }

      this.scheduleNext(generation);
    }, Math.max(0, this.intervalMs - (performance.now() - this.lastAttemptAt)));
  }

  private attempt(): boolean {
    this.lastAttemptAt = performance.now();
    if (
      !this.active ||
      !this.environment.isEnabled() ||
      !this.environment.isLiveDetected() ||
      !this.environment.isVisible() ||
      !this.environment.hasFocus()
    ) {
      return false;
    }

    // Simulation (PRD §14-15) : feedback local + compteur, sans action
    // TikTok réelle. La cible DOM n'est pas exigée pour que le compteur
    // fonctionne même quand TikTok change son interface.
    if (this.environment.isSimulationMode()) {
      this.environment.executeSimulation();
      this.environment.onError(null);
      this.environment.onInteraction("simulated");
      return true;
    }

    const target = this.environment.getTarget();
    // La vidéo du LIVE est toujours occluse par l'interface TikTok :
    // on la valide sans test d'occlusion, le double-clic part dessus.
    const isLivePlayer =
      target instanceof HTMLVideoElement ||
      (target instanceof HTMLElement &&
        target.matches(LIVE_PLAYER_SELECTORS.join(", ")));
    const targetOk =
      !!target &&
      (isValidInteractionTarget(target) ||
        (isLivePlayer && isVisibleElement(target)));
    if (!target || !targetOk) {
      this.environment.onError("INTERACTION_TARGET_NOT_FOUND");
      return false;
    }

    try {
      const dispatched = this.environment.executeReal(target);
      if (dispatched instanceof Promise) {
        const generation = this.generation;
        this.pending = true;
        void dispatched.then(
          (result) => this.completeAsync(generation, result !== false),
          () => this.completeAsync(generation, false),
        );
        return true;
      }
      if (dispatched === false) {
        this.environment.onError("INTERACTION_DISPATCH_FAILED");
        return false;
      }
    } catch {
      this.environment.onError("INTERACTION_DISPATCH_FAILED");
      return false;
    }
    this.environment.onError(null);
    this.environment.onInteraction("dispatched");
    return true;
  }

  private completeAsync(generation: number, success: boolean): void {
    this.pending = false;
    // A response from a stopped/reset session must not affect the next one.
    if (generation !== this.generation) return;
    if (!success) {
      this.environment.onError("INTERACTION_DISPATCH_FAILED");
      this.stop();
      return;
    }
    this.environment.onError(null);
    this.environment.onInteraction("dispatched");
    this.scheduleNext(generation);
  }
}
