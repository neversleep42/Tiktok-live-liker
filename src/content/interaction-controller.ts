import { HOLD_INTERVAL_MS } from "../shared/constants";
import type { InteractionError } from "../shared/types";
import { isValidInteractionTarget } from "./live-detector";

export type InteractionResult = "simulated" | "dispatched";

export interface InteractionEnvironment {
  isEnabled(): boolean;
  isLiveDetected(): boolean;
  isVisible(): boolean;
  hasFocus(): boolean;
  isSimulationMode(): boolean;
  getTarget(): HTMLElement | null;
  executeReal(target: HTMLElement): void;
  executeSimulation(): void;
  onInteraction(result: InteractionResult): void;
  onInteractingChange(interacting: boolean): void;
  onError(error: InteractionError | null): void;
}

export class InteractionController {
  private active = false;
  private generation = 0;
  private timer: number | null = null;

  constructor(
    private readonly environment: InteractionEnvironment,
    private readonly intervalMs = HOLD_INTERVAL_MS,
  ) {}

  get isInteracting(): boolean {
    return this.active;
  }

  trigger(): boolean {
    if (this.active) return false;
    this.active = true;
    const result = this.attempt();
    this.active = false;
    return result;
  }

  start(): boolean {
    if (this.active) return false;

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

    if (wasActive) {
      this.environment.onInteractingChange(false);
    }
  }

  private scheduleNext(generation: number): void {
    this.timer = window.setTimeout(() => {
      this.timer = null;
      if (!this.active || generation !== this.generation) return;

      if (!this.attempt()) {
        this.stop();
        return;
      }

      this.scheduleNext(generation);
    }, this.intervalMs);
  }

  private attempt(): boolean {
    if (
      !this.active ||
      !this.environment.isEnabled() ||
      !this.environment.isLiveDetected() ||
      !this.environment.isVisible() ||
      !this.environment.hasFocus()
    ) {
      return false;
    }

    const target = this.environment.getTarget();
    if (!target || !isValidInteractionTarget(target)) {
      this.environment.onError("INTERACTION_TARGET_NOT_FOUND");
      return false;
    }

    if (this.environment.isSimulationMode()) {
      this.environment.executeSimulation();
      this.environment.onError(null);
      this.environment.onInteraction("simulated");
      return true;
    }

    this.environment.executeReal(target);
    this.environment.onError(null);
    this.environment.onInteraction("dispatched");
    return true;
  }
}
