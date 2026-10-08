import { createRoot, type Root } from "react-dom/client";

import { FloatingController } from "../components/FloatingController";
import {
  DEFAULT_SETTINGS,
  DOM_LIVE_KEY,
  LIVE_LIKE_TARGET_SELECTORS,
  SHORTCUT_CODE,
  STORAGE_KEYS,
} from "../shared/constants";
import { getSettings, normalizeSettings } from "../shared/settings";
import type {
  ExtensionMessage,
  ExtensionResponse,
  ExtensionSettings,
  InteractionError,
  RuntimeStatus,
  UiStatus,
} from "../shared/types";
import floatingStyles from "./floating.css?inline";
import { InteractionController } from "./interaction-controller";
import {
  requiresDoubleClick,
  resolveLikePoint,
  type LikePoint,
} from "./like-dispatch";
import {
  LiveDetector,
  findLiveScope,
  getLiveKey,
  type LiveSnapshot,
  isExcludedTarget,
  isValidInteractionTarget,
  isVisibleElement,
  resolveLikeTarget,
  resolveLivePlayer,
} from "./live-detector";
import { SessionCounter } from "./session-counter";
import { VisibilityController } from "./visibility-controller";

const HOST_ID = "tiktok-live-like-assistant-root";

let settings: ExtensionSettings = { ...DEFAULT_SETTINGS };
let liveSnapshot: LiveSnapshot = {
  liveDetected: false,
  liveKey: null,
  target: null,
  targetState: "MISSING",
};
let interacting = false;
let error: InteractionError | null = null;
let pulseId = 0;
type HoldOwner = "shortcut" | "pointer" | "control" | "automatic";
let holdOwner: HoldOwner | null = null;
let holdPointerId: number | null = null;
let root: Root | null = null;
let host: HTMLDivElement | null = null;
let started = false;
let disposed = false;

// Mode manuel : l'utilisateur force l'activation via popup ou clic droit.
// Prioritaire sur l'auto-détection fragile quand TikTok change son DOM.
let manualLive = false;
let manualLiveUrl: string | null = null;
let manualTarget: HTMLElement | null = null;
let lastContextElement: Element | null = null;
let lastContextPoint: LikePoint | null = null;
let manualPoint: LikePoint | null = null;
let collapsed = false;
// Dernière position réelle du curseur : l'utilisateur vise le cœur du LIVE
// avec sa souris, l'extension clique là où il vise tant qu'il maintient L.
// Ça évite de cliquer un bouton "créatrice / commentaire" détecté au hasard.
let lastMouse: { x: number; y: number } | null = null;
// Scope du layout courant : quand l'hôte change la disposition, le scope
// change et toute cible manuelle issue de l'ancien layout est périmée.
let lastScope: Element | null = null;

const counter = new SessionCounter();

function isCurrentLiveContext(): boolean {
  if (manualLive) return manualLiveUrl === window.location.href;
  if (!liveSnapshot.liveDetected || liveSnapshot.liveKey === null) {
    return false;
  }
  // Cas URL stricte /@pseudo/live : la clé doit encore correspondre.
  // Cas DOM seul (LIVE intégré sans URL /live) : on fait confiance
  // à la preuve DOM déjà validée par le detector.
  if (liveSnapshot.liveKey === DOM_LIVE_KEY) return true;
  return getLiveKey(window.location.href) === liveSnapshot.liveKey;
}

function coerceToInteractive(element: Element): HTMLElement | null {
  if (element.closest("a, input, textarea, select, [contenteditable='true'], [role='textbox']")) return null;
  // Jamais un avatar / profil / follow : likerait la personne, pas le LIVE.
  if (isExcludedTarget(element)) return null;
  if (element instanceof HTMLElement && isValidInteractionTarget(element)) {
    if (element.matches("button, [role='button'], a, input")) return element;
  }
  const interactive = element.closest("button, [role='button'], a");
  if (
    interactive instanceof HTMLElement &&
    isValidInteractionTarget(interactive) &&
    !isExcludedTarget(interactive)
  ) {
    return interactive;
  }
  // Une zone vidéo/overlay est souvent un div sans rôle button.
  const area = element instanceof HTMLElement ? element : element.parentElement;
  return area && isVisibleElement(area) ? area : null;
}

function resolveCursorTarget(): HTMLElement | null {
  if (!lastMouse || typeof document.elementFromPoint !== "function") {
    return null;
  }
  let hit: Element | null = null;
  try {
    hit = document.elementFromPoint(lastMouse.x, lastMouse.y);
  } catch {
    return null;
  }
  if (!hit) return null;
  const scope = findLiveScope();
  if (!scope || !scope.contains(hit)) return null;
  if (hit.closest("a, input, textarea, select, [contenteditable='true'], [role='textbox'], [data-e2e*='chat'], [data-e2e*='comment']")) return null;
  // Ne jamais cliquer notre propre panneau flottant.
  if (
    (hit instanceof HTMLElement && hit.id === HOST_ID) ||
    (typeof hit.closest === "function" && hit.closest(`#${HOST_ID}`))
  ) {
    return null;
  }
  const interactive = coerceToInteractive(hit);
  if (interactive) {
    if (interactive.matches("button, [role='button']") &&
        !interactive.matches(LIVE_LIKE_TARGET_SELECTORS.join(", ")) &&
        resolveLikeTarget().target !== interactive) return null;
    return interactive;
  }
  // Repli : zone visible visée dans le LIVE, hors avatar/invité.
  if (isExcludedTarget(hit)) return null;
  return hit instanceof HTMLElement && isVisibleElement(hit) ? hit : null;
}

function resolveEffectiveTarget(): HTMLElement | null {
  const scope = findLiveScope();
  if (scope !== lastScope) {
    lastScope = scope;
    // Le layout a changé (ex. passage en grille audio) : la cible manuelle
    // de l'ancien layout est périmée, on l'oublie au lieu de liker au mauvais
    // endroit. Le mode manuel reste actif.
    if (manualTarget && !(scope && scope.contains(manualTarget))) {
      manualTarget = null;
      manualPoint = null;
    }
  }
  if (
    manualTarget &&
    isValidInteractionTarget(manualTarget) &&
    !isExcludedTarget(manualTarget)
  ) {
    return manualTarget;
  }
  if (manualTarget) return null;
  // Priorité au point visé par l'utilisateur : c'est lui qui choisit
  // la zone du LIVE, pas un sélecteur deviné.
  const aimed = settings.interactionMode === "manual" ? resolveCursorTarget() : null;
  if (aimed) return aimed;
  const current = resolveLikeTarget();
  if (current.state === "AMBIGUOUS") return null;
  if (current.target?.matches(LIVE_LIKE_TARGET_SELECTORS.join(", "))) return current.target;
  // Ne jamais cibler la racine générale : ses enfants ne recevraient pas le clic.
  const player = resolveLivePlayer();
  if (player) return player;
  if (current.state === "READY" && current.target) {
    // En mode manuel on accepte toute cible READY, même si le snapshot
    // auto n'a pas encore convergé.
    if (manualLive) return current.target;
    return current.target === liveSnapshot.target ? current.target : null;
  }
  return null;
}

function deriveUiStatus(): UiStatus {
  if (!settings.enabled) return "DISABLED";
  if (!isCurrentLiveContext()) return "NO_LIVE";
  if (interacting) return "ACTIVE";
  // Simulation : le compteur local fonctionne sans cible TikTok.
  if (settings.simulationMode) return "SIMULATION";
  if (!resolveEffectiveTarget()) {
    return "TARGET_MISSING";
  }
  return "READY";
}

function currentSessionKey(): string {
  return getLiveKey(window.location.href) ?? liveSnapshot.liveKey ?? DOM_LIVE_KEY;
}

function getRuntimeStatus(): RuntimeStatus {
  const liveDetected = isCurrentLiveContext();
  return {
    enabled: settings.enabled,
    liveDetected,
    interacting: liveDetected && interacting,
    simulationMode: settings.simulationMode,
    interactionCount: counter.getCount(),
    status: deriveUiStatus(),
    error,
    manualLive,
  };
}

function ensureFloatingRoot(): void {
  if (root && host?.isConnected) return;

  host = document.createElement("div");
  host.id = HOST_ID;
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  const mount = document.createElement("div");
  style.textContent = floatingStyles;
  shadow.append(style, mount);
  document.documentElement.append(host);
  root = createRoot(mount);
}

function renderFloating(): void {
  ensureFloatingRoot();
  if (!host || !root) return;

  const visible = settings.enabled && isCurrentLiveContext();
  host.style.display = visible ? "block" : "none";
  if (!visible) return;

  const status = getRuntimeStatus();
  root.render(
    <FloatingController
      status={status.status}
      count={status.interactionCount}
      simulationMode={status.simulationMode}
      error={status.error}
      pulseId={pulseId}
      collapsed={collapsed}
      interactionMode={settings.interactionMode}
      intervalMs={settings.holdIntervalMs}
      onModeChange={(interactionMode) => saveFloatingSettings({ interactionMode })}
      onIntervalChange={(holdIntervalMs) => saveFloatingSettings({ holdIntervalMs })}
      onToggleAutomatic={toggleAutomatic}
      onSimulationChange={(simulationMode) => saveFloatingSettings({ simulationMode })}
      onToggleCollapse={() => {
        collapsed = !collapsed;
        try {
          const pending = chrome.storage.local.set({
            "lla-collapsed": collapsed,
          }) as unknown as Promise<unknown> | undefined;
          if (pending && typeof pending.catch === "function") {
            pending.catch(() => undefined);
          }
        } catch {
          // Stockage indisponible : on garde l'état en mémoire.
        }
        renderFloating();
      }}
      onTrigger={() => controller.trigger()}
      onHoldStart={(source, pointerId) =>
        beginHold(source === "pointer" ? "pointer" : "control", pointerId)
      }
      onHoldStop={(source) =>
        endHold(source === "pointer" ? "pointer" : "control")
      }
    />,
  );
}

function isContextAlive(): boolean {
  try {
    return !!chrome?.runtime?.id;
  } catch {
    return false;
  }
}

function isContextInvalidated(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return message.includes("Extension context invalidated");
}

function shutdownOnInvalidation(error: unknown): boolean {
  if (isContextInvalidated(error)) {
    teardown();
    return true;
  }
  return false;
}

function publishStatus(): void {
  if (disposed || !isContextAlive()) {
    if (!isContextAlive() && !disposed) teardown();
    return;
  }
  renderFloating();
  const message: ExtensionMessage = {
    type: "STATUS_CHANGED",
    status: getRuntimeStatus(),
  };
  try {
    const pending = chrome.runtime.sendMessage(message) as unknown as
      | Promise<unknown>
      | undefined;
    if (pending && typeof pending.catch === "function") {
      pending.catch((error: unknown) => {
        shutdownOnInvalidation(error);
      });
    }
  } catch (error) {
    shutdownOnInvalidation(error);
  }
}

const controller = new InteractionController({
  isEnabled: () => settings.enabled,
  isLiveDetected: isCurrentLiveContext,
  isVisible: () => document.visibilityState === "visible",
  hasFocus: () => document.hasFocus(),
  isSimulationMode: () => settings.simulationMode,
  getTarget: () => resolveEffectiveTarget(),
  executeReal: (target) => {
    const preferredPoint = target === manualTarget
      ? manualPoint
      : settings.interactionMode === "manual"
        ? lastMouse
        : null;
    const point = resolveLikePoint(target, preferredPoint);
    const message: ExtensionMessage = {
      type: "DISPATCH_TRUSTED_LIKE",
      x: point.x,
      y: point.y,
      doubleClick: requiresDoubleClick(target),
    };
    return chrome.runtime.sendMessage(message).then((response: ExtensionResponse) => {
      return response?.ok === true;
    }).catch((nextError: unknown) => {
      shutdownOnInvalidation(nextError);
      return false;
    });
  },
  executeSimulation: () => {
    pulseId += 1;
  },
  onInteraction: () => {
    counter.increment();
    publishStatus();
  },
  onInteractingChange: (next) => {
    interacting = next;
    if (!next) {
      holdOwner = null;
      holdPointerId = null;
    }
    if (!next && isContextAlive()) {
      void chrome.runtime.sendMessage({
        type: "RELEASE_TRUSTED_INPUT",
      } satisfies ExtensionMessage).catch(() => undefined);
    }
    publishStatus();
  },
  onError: (next) => {
    if (error !== next) {
      error = next;
      publishStatus();
    }
  },
});

const visibilityController = new VisibilityController(
  document,
  window,
  () => controller.stop(),
);

const detector = new LiveDetector((next) => {
  const previous = liveSnapshot;
  if (manualLive && manualLiveUrl !== window.location.href) {
    manualLive = false;
    manualLiveUrl = null;
    manualTarget = null;
    controller.stop();
  }
  const contextChanged =
    previous.liveKey !== next.liveKey || previous.target !== next.target;

  // En mode manuel, les fluctuations de l'auto-détection ne doivent pas
  // couper le maintien ni remettre le compteur à zéro.
  if (!manualLive && (contextChanged || !next.liveDetected)) {
    controller.stop();
  }

  liveSnapshot = next;
  if (!manualLive) {
    counter.beginLive(next.liveKey);
  }

  if (resolveEffectiveTarget()) {
    error = null;
  } else if ((next.liveDetected || manualLive) && !settings.simulationMode) {
    error = "INTERACTION_TARGET_NOT_FOUND";
  }

  publishStatus();
});

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target instanceof HTMLElement && target.isContentEditable) return true;
  return Boolean(
    target.closest(
      "input, textarea, select, [contenteditable]:not([contenteditable='false']), [role='textbox']",
    ),
  );
}

function beginHold(owner: HoldOwner, pointerId?: number): boolean {
  if (owner !== "automatic" && settings.interactionMode !== "manual") return false;
  if (holdOwner !== null) return false;
  holdOwner = owner;
  holdPointerId = owner === "pointer" ? pointerId ?? null : null;
  if (!controller.start()) {
    holdOwner = null;
    holdPointerId = null;
    return false;
  }
  return true;
}

function endHold(owner: HoldOwner): void {
  if (holdOwner === owner) controller.stop();
}

function toggleAutomatic(): void {
  if (settings.interactionMode !== "automatic") return;
  if (controller.isInteracting) controller.stop();
  else beginHold("automatic");
}

function saveFloatingSettings(patch: Partial<ExtensionSettings>): void {
  // Stop immediately when changing mode; persist through the background queue.
  if (patch.interactionMode) controller.stop();
  void chrome.runtime.sendMessage({ type: "SET_SETTINGS", patch } satisfies ExtensionMessage)
    .catch((error: unknown) => shutdownOnInvalidation(error));
}

function handleKeyDown(event: KeyboardEvent): void {
  if (event.isTrusted && event.code === "Escape") {
    controller.stop();
    return;
  }
  if (
    !event.isTrusted ||
    event.repeat ||
    event.isComposing ||
    event.code !== SHORTCUT_CODE ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey ||
    event.composedPath().some((target) => isEditableTarget(target))
  ) {
    return;
  }

  if (!settings.enabled || !isCurrentLiveContext()) return;
  if (settings.interactionMode === "automatic") {
    event.preventDefault();
    toggleAutomatic();
    return;
  }
  if (!beginHold("shortcut")) return;
  // En simulation on bloque pour ne pas polluer la page ; en mode réel on
  // laisse la vraie touche L (trusted) arriver jusqu'à TikTok : c'est elle
  // que les tools GitHub exploitent comme raccourci natif de like.
  if (settings.simulationMode) event.preventDefault();
}

function handleKeyUp(event: KeyboardEvent): void {
  if (event.code === SHORTCUT_CODE) {
    endHold("shortcut");
  }
}

function handlePointerMove(event: PointerEvent): void {
  if (!event.isTrusted) return;
  if (typeof event.clientX === "number" && typeof event.clientY === "number") {
    lastMouse = { x: event.clientX, y: event.clientY };
  }
}

function handlePointerEnd(event: PointerEvent): void {
  if (holdPointerId !== null && event.pointerId === holdPointerId) {
    endHold("pointer");
  }
}

function handleStorageChange(
  changes: Record<string, chrome.storage.StorageChange>,
  areaName: string,
): void {
  if (areaName !== "local" || !changes[STORAGE_KEYS.settings]) return;

  const next = normalizeSettings(changes[STORAGE_KEYS.settings].newValue);
  const mustStop =
    !next.enabled ||
    next.simulationMode !== settings.simulationMode ||
    next.interactionMode !== settings.interactionMode;
  if (mustStop) controller.stop();
  settings = next;
  controller.setIntervalMs(next.holdIntervalMs);
  if (settings.simulationMode) error = null;
  publishStatus();
}

function handleContextMenu(event: MouseEvent): void {
  lastContextElement =
    event.target instanceof Element ? event.target : null;
  lastContextPoint = { x: event.clientX, y: event.clientY };
}

function handleMessage(
  message: ExtensionMessage,
  _sender: chrome.runtime.MessageSender,
  sendResponse: (response: ExtensionResponse) => void,
): boolean {
  if (message.type === "GET_STATUS") {
    sendResponse({ ok: true, status: getRuntimeStatus() });
    return false;
  }

  if (message.type === "RESET_SESSION") {
    controller.stop();
    counter.reset();
    publishStatus();
    sendResponse({ ok: true });
    return false;
  }

  if (message.type === "FORCE_LIVE") {
    manualLive = true;
    manualLiveUrl = window.location.href;
    error = null;
    counter.beginLive(currentSessionKey());
    publishStatus();
    sendResponse({ ok: true });
    return false;
  }

  if (message.type === "USE_CONTEXT_TARGET") {
    controller.stop();
    manualTarget = null;
    manualPoint = null;
    manualLiveUrl = window.location.href;
    if (lastContextElement && isExcludedTarget(lastContextElement)) {
      // Clic droit sur un avatar / profil : on refuse pour ne pas liker
      // la personne. Vise la zone du LIVE, pas une tuile.
      manualLive = true;
      error = "INTERACTION_TARGET_NOT_FOUND";
      counter.beginLive(currentSessionKey());
      publishStatus();
      sendResponse({ ok: false, error: "EXCLUDED_TARGET" });
      return false;
    }
    const candidate = lastContextElement
      ? coerceToInteractive(lastContextElement)
      : null;
    if (candidate) {
      manualTarget = candidate;
      manualPoint = lastContextPoint;
      manualLive = true;
      error = null;
      counter.beginLive(currentSessionKey());
      publishStatus();
      sendResponse({ ok: true });
    } else {
      manualLive = true;
      error = "INTERACTION_TARGET_NOT_FOUND";
      counter.beginLive(currentSessionKey());
      publishStatus();
      sendResponse({ ok: false, error: "INVALID_TARGET" });
    }
    return false;
  }

  if (message.type === "CLEAR_MANUAL") {
    manualLive = false;
    manualLiveUrl = null;
    manualTarget = null;
    manualPoint = null;
    controller.stop();
    publishStatus();
    sendResponse({ ok: true });
    return false;
  }

  return false;
}

function teardown(): void {
  if (disposed) return;
  disposed = true;
  try {
    controller.stop();
  } catch {
    // Ignore : contexte déjà invalide.
  }
  try {
    detector.stop();
  } catch {
    // Ignore.
  }
  try {
    visibilityController.stop();
  } catch {
    // Ignore.
  }
  window.removeEventListener("keydown", handleKeyDown, true);
  window.removeEventListener("keyup", handleKeyUp, true);
  window.removeEventListener("pointerup", handlePointerEnd, true);
  window.removeEventListener("pointercancel", handlePointerEnd, true);
  window.removeEventListener("pointermove", handlePointerMove, true);
  window.removeEventListener("contextmenu", handleContextMenu, true);
  window.removeEventListener("pagehide", handlePageHide);
  window.removeEventListener("pageshow", handlePageShow);
  try {
    chrome.storage.onChanged.removeListener(handleStorageChange);
  } catch {
    // Contexte déjà invalide.
  }
  try {
    chrome.runtime.onMessage.removeListener(handleMessage);
  } catch {
    // Contexte déjà invalide.
  }
  root?.unmount();
  root = null;
  host?.remove();
  host = null;
}

function handlePageHide(event: PageTransitionEvent): void {
  controller.stop();
  if (event.persisted) {
    if (started) {
      detector.stop();
      visibilityController.stop();
    }
    return;
  }
  teardown();
}

function handlePageShow(event: PageTransitionEvent): void {
  if (!event.persisted || disposed || !started) return;
  visibilityController.start();
  detector.start();
  publishStatus();
}

async function bootstrap(): Promise<void> {
  if (!isContextAlive()) return;
  window.addEventListener("pagehide", handlePageHide);
  window.addEventListener("pageshow", handlePageShow);
  let loadedSettings;
  try {
    loadedSettings = await getSettings();
  } catch (error) {
    if (shutdownOnInvalidation(error)) return;
    loadedSettings = { ...DEFAULT_SETTINGS };
  }
  if (disposed || !isContextAlive()) return;
  settings = loadedSettings;
  controller.setIntervalMs(settings.holdIntervalMs);
  try {
    const stored = await chrome.storage.local.get("lla-collapsed");
    collapsed = stored["lla-collapsed"] === true;
  } catch {
    collapsed = false;
  }
  ensureFloatingRoot();

  window.addEventListener("keydown", handleKeyDown, true);
  window.addEventListener("keyup", handleKeyUp, true);
  window.addEventListener("pointerup", handlePointerEnd, true);
  window.addEventListener("pointercancel", handlePointerEnd, true);
  window.addEventListener("pointermove", handlePointerMove, true);
  window.addEventListener("contextmenu", handleContextMenu, true);
  chrome.storage.onChanged.addListener(handleStorageChange);
  chrome.runtime.onMessage.addListener(handleMessage);

  visibilityController.start();
  detector.start();
  started = true;
  publishStatus();
}

if (!document.getElementById(HOST_ID)) {
  void bootstrap();
}
