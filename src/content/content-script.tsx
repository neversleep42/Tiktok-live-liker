import { createRoot, type Root } from "react-dom/client";

import { FloatingController } from "../components/FloatingController";
import {
  DEFAULT_SETTINGS,
  DOM_LIVE_KEY,
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
  LiveDetector,
  findLiveScope,
  getLiveKey,
  type LiveSnapshot,
  isExcludedTarget,
  isValidInteractionTarget,
  isVisibleElement,
  resolveLikeTarget,
  resolveLivePlayer,
  resolveLiveRoomRoot,
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
type HoldOwner = "shortcut" | "pointer" | "control";
let holdOwner: HoldOwner | null = null;
let root: Root | null = null;
let host: HTMLDivElement | null = null;
let started = false;
let disposed = false;

// Mode manuel : l'utilisateur force l'activation via popup ou clic droit.
// Prioritaire sur l'auto-détection fragile quand TikTok change son DOM.
let manualLive = false;
let manualTarget: HTMLElement | null = null;
let lastContextElement: Element | null = null;
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
  if (manualLive) return true;
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
  return null;
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
  // Ne jamais cliquer notre propre panneau flottant.
  if (
    (hit instanceof HTMLElement && hit.id === HOST_ID) ||
    (typeof hit.closest === "function" && hit.closest(`#${HOST_ID}`))
  ) {
    return null;
  }
  const interactive = coerceToInteractive(hit);
  if (interactive) return interactive;
  // Repli : l'élément visé lui-même s'il est visible et hors zone avatar.
  // Le double-clic remonte dans le DOM jusqu'au handler TikTok. Sur une
  // tuile avatar/invité on ne retourne rien : le repli racine prendra le
  // relais pour liker le LIVE, pas la personne.
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
    }
  }
  if (
    manualTarget &&
    isValidInteractionTarget(manualTarget) &&
    !isExcludedTarget(manualTarget)
  ) {
    return manualTarget;
  }
  if (manualTarget && !manualTarget.isConnected) {
    manualTarget = null;
  }
  // Priorité au point visé par l'utilisateur : c'est lui qui choisit
  // la zone du LIVE, pas un sélecteur deviné.
  const aimed = resolveCursorTarget();
  if (aimed) return aimed;
  // Repli insensible au layout : la racine du LIVE (vidéo plein écran
  // comme grille audio d'invités). Le double-clic vise les coordonnées
  // du curseur quand on les connaît.
  const roomRoot = resolveLiveRoomRoot();
  if (roomRoot) return roomRoot;
  // Geste documenté sur PC : double-clic sur la vidéo du LIVE.
  // Le player prime sur tout bouton générique (créatrice, commentaires).
  const player = resolveLivePlayer();
  if (player) return player;
  const current = resolveLikeTarget();
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
      onHoldStart={(source) =>
        beginHold(source === "pointer" ? "pointer" : "control")
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
  // Mode réel : geste documenté TikTok PC = double-clic sur la vidéo du
  // LIVE (il n'y a pas de bouton cœur sur web). On rejoue deux cycles
  // pointer/souris + dblclick. Ça reste synthétique (isTrusted === false) :
  // TikTok peut l'ignorer — limite MV3 assumée, pas de chrome.debugger
  // ni de faux curseur (interdit PRD §5).
  executeReal: (target) => {
    const rect = target.getBoundingClientRect();
    // Quand on connaît le curseur, le double-clic part exactement où
    // l'utilisateur vise dans le LIVE (indépendant du layout). Sinon,
    // centre de la cible.
    const aimAtCursor =
      lastMouse !== null &&
      lastMouse.x >= 0 &&
      lastMouse.y >= 0 &&
      lastMouse.x < window.innerWidth &&
      lastMouse.y < window.innerHeight;
    const clientX = aimAtCursor
      ? (lastMouse as { x: number; y: number }).x
      : rect.left + rect.width / 2;
    const clientY = aimAtCursor
      ? (lastMouse as { x: number; y: number }).y
      : rect.top + rect.height / 2;
    const base = {
      bubbles: true,
      cancelable: true,
      composed: true,
      clientX,
      clientY,
      button: 0,
      buttons: 1,
      detail: 1,
    } as const;
    const clickCycle = (detail: number) => {
      const init = { ...base, detail };
      try {
        target.dispatchEvent(
          new PointerEvent("pointerdown", { ...init, isPrimary: true }),
        );
      } catch {
        // PointerEvent indisponible : on continue avec la souris.
      }
      target.dispatchEvent(new MouseEvent("mousedown", init));
      try {
        target.dispatchEvent(
          new PointerEvent("pointerup", { ...init, isPrimary: true }),
        );
      } catch {
        // Ignore.
      }
      target.dispatchEvent(new MouseEvent("mouseup", init));
      target.dispatchEvent(new MouseEvent("click", init));
    };
    clickCycle(1);
    clickCycle(2);
    target.dispatchEvent(
      new MouseEvent("dblclick", { ...base, detail: 2 }),
    );
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
    if (!next) holdOwner = null;
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

function beginHold(owner: HoldOwner): boolean {
  if (holdOwner !== null) return false;
  holdOwner = owner;
  if (!controller.start()) {
    holdOwner = null;
    return false;
  }
  return true;
}

function endHold(owner: HoldOwner): void {
  if (holdOwner === owner) controller.stop();
}

function handleKeyDown(event: KeyboardEvent): void {
  if (
    !event.isTrusted ||
    event.repeat ||
    event.isComposing ||
    event.code !== SHORTCUT_CODE ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey ||
    isEditableTarget(event.target)
  ) {
    return;
  }

  if (!settings.enabled || !isCurrentLiveContext()) return;
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

function handlePointerEnd(): void {
  endHold("pointer");
}

function handlePointerMove(event: PointerEvent): void {
  if (typeof event.clientX === "number" && typeof event.clientY === "number") {
    lastMouse = { x: event.clientX, y: event.clientY };
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
    next.holdIntervalMs !== settings.holdIntervalMs;
  if (mustStop) controller.stop();
  settings = next;
  controller.setIntervalMs(next.holdIntervalMs);
  if (settings.simulationMode) error = null;
  publishStatus();
}

function handleContextMenu(event: MouseEvent): void {
  lastContextElement =
    event.target instanceof Element ? event.target : null;
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
    error = null;
    counter.beginLive(currentSessionKey());
    publishStatus();
    sendResponse({ ok: true });
    return false;
  }

  if (message.type === "USE_CONTEXT_TARGET") {
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
      manualLive = true;
      error = null;
      counter.beginLive(currentSessionKey());
      publishStatus();
      sendResponse({ ok: true });
    } else {
      // Clic droit hors cible cliquable : on active quand même le LIVE,
      // la cible auto pourra prendre le relais.
      manualLive = true;
      error = null;
      counter.beginLive(currentSessionKey());
      publishStatus();
      sendResponse({ ok: false, error: "INVALID_TARGET" });
    }
    return false;
  }

  if (message.type === "CLEAR_MANUAL") {
    manualLive = false;
    manualTarget = null;
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
