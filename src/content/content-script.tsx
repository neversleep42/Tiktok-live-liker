import { createRoot, type Root } from "react-dom/client";

import { FloatingController } from "../components/FloatingController";
import { DEFAULT_SETTINGS, SHORTCUT_CODE, STORAGE_KEYS } from "../shared/constants";
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
  getLiveKey,
  type LiveSnapshot,
  isValidInteractionTarget,
  resolveLikeTarget,
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

const counter = new SessionCounter();

function isCurrentLiveContext(): boolean {
  return (
    liveSnapshot.liveDetected &&
    liveSnapshot.liveKey !== null &&
    getLiveKey(window.location.href) === liveSnapshot.liveKey
  );
}

function deriveUiStatus(): UiStatus {
  if (!settings.enabled) return "DISABLED";
  if (!isCurrentLiveContext()) return "NO_LIVE";
  if (interacting) return "ACTIVE";
  if (
    liveSnapshot.targetState !== "READY" ||
    !liveSnapshot.target ||
    !isValidInteractionTarget(liveSnapshot.target)
  ) {
    return "TARGET_MISSING";
  }
  if (settings.simulationMode) return "SIMULATION";
  return "READY";
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

function publishStatus(): void {
  if (disposed) return;
  renderFloating();
  const message: ExtensionMessage = {
    type: "STATUS_CHANGED",
    status: getRuntimeStatus(),
  };
  void chrome.runtime.sendMessage(message).catch(() => undefined);
}

const controller = new InteractionController({
  isEnabled: () => settings.enabled,
  isLiveDetected: isCurrentLiveContext,
  isVisible: () => document.visibilityState === "visible",
  hasFocus: () => document.hasFocus(),
  isSimulationMode: () => settings.simulationMode,
  getTarget: () => {
    const current = resolveLikeTarget();
    return current.state === "READY" && current.target === liveSnapshot.target
      ? current.target
      : null;
  },
  executeReal: (target) => target.click(),
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

  if (contextChanged || !next.liveDetected) {
    controller.stop();
  }

  liveSnapshot = next;
  counter.beginLive(next.liveKey);

  if (next.targetState === "READY") {
    error = null;
  } else if (next.liveDetected && !settings.simulationMode) {
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

  if (!settings.enabled || !liveSnapshot.liveDetected) return;
  if (beginHold("shortcut")) event.preventDefault();
}

function handleKeyUp(event: KeyboardEvent): void {
  if (event.code === SHORTCUT_CODE) {
    endHold("shortcut");
  }
}

function handlePointerEnd(): void {
  endHold("pointer");
}

function handleStorageChange(
  changes: Record<string, chrome.storage.StorageChange>,
  areaName: string,
): void {
  if (areaName !== "local" || !changes[STORAGE_KEYS.settings]) return;

  const next = normalizeSettings(changes[STORAGE_KEYS.settings].newValue);
  const mustStop =
    !next.enabled || next.simulationMode !== settings.simulationMode;
  if (mustStop) controller.stop();
  settings = next;
  if (settings.simulationMode) error = null;
  publishStatus();
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

  return false;
}

function teardown(): void {
  if (disposed) return;
  disposed = true;
  controller.stop();
  detector.stop();
  visibilityController.stop();
  window.removeEventListener("keydown", handleKeyDown, true);
  window.removeEventListener("keyup", handleKeyUp, true);
  window.removeEventListener("pointerup", handlePointerEnd, true);
  window.removeEventListener("pointercancel", handlePointerEnd, true);
  window.removeEventListener("pagehide", handlePageHide);
  window.removeEventListener("pageshow", handlePageShow);
  chrome.storage.onChanged.removeListener(handleStorageChange);
  chrome.runtime.onMessage.removeListener(handleMessage);
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
  window.addEventListener("pagehide", handlePageHide);
  window.addEventListener("pageshow", handlePageShow);
  const loadedSettings = await getSettings();
  if (disposed) return;
  settings = loadedSettings;
  ensureFloatingRoot();

  window.addEventListener("keydown", handleKeyDown, true);
  window.addEventListener("keyup", handleKeyUp, true);
  window.addEventListener("pointerup", handlePointerEnd, true);
  window.addEventListener("pointercancel", handlePointerEnd, true);
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
