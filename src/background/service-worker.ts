import { getSettings, setSettings } from "../shared/settings";
import type { ExtensionSettings } from "../shared/types";
import type { ExtensionMessage, ExtensionResponse } from "../shared/types";
import {
  dispatchTrustedLike,
  forgetTrustedInput,
  releaseTrustedInput,
} from "./trusted-input";

const CONTEXT_MENU_ID = "lla-use-target";

let settingsMutationQueue: Promise<void> = Promise.resolve();

function enqueueSettingsMutation(
  patch: Partial<ExtensionSettings>,
): Promise<ExtensionSettings> {
  const mutation = settingsMutationQueue.then(() => setSettings(patch));
  settingsMutationQueue = mutation.then(
    () => undefined,
    () => undefined,
  );
  return mutation;
}

let contextMenuPending = false;

function ensureContextMenu(): void {
  if (contextMenuPending) return;
  contextMenuPending = true;
  const properties = {
    title: "♥ Utiliser comme cible LIVE Like",
    contexts: ["all"],
    documentUrlPatterns: ["https://www.tiktok.com/*"],
  } satisfies chrome.contextMenus.UpdateProperties;

  // Chrome conserve les menus entre les redémarrages du service worker.
  // Mettre à jour d'abord ; créer seulement si le menu n'existe pas.
  // lastError doit être lu dans le callback : try/catch ne le capture pas.
  chrome.contextMenus.update(CONTEXT_MENU_ID, properties, () => {
    const updateError = chrome.runtime.lastError;
    if (!updateError) {
      contextMenuPending = false;
      return;
    }

    chrome.contextMenus.create({ ...properties, id: CONTEXT_MENU_ID }, () => {
      contextMenuPending = false;
      const createError = chrome.runtime.lastError;
      if (createError) {
        console.warn("LIVE Like : création du menu impossible.", createError.message);
      }
    });
  });
}

chrome.runtime.onInstalled.addListener(() => {
  ensureContextMenu();
});

chrome.runtime.onStartup?.addListener(() => {
  ensureContextMenu();
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== CONTEXT_MENU_ID || tab?.id === undefined) return;
  void chrome.tabs
    .sendMessage(tab.id, { type: "USE_CONTEXT_TARGET" } satisfies ExtensionMessage)
    .catch(() => undefined);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  forgetTrustedInput(tabId);
});

chrome.runtime.onMessage.addListener(
  (
    message: ExtensionMessage,
    sender,
    sendResponse: (response: ExtensionResponse) => void,
  ) => {
    if (message.type === "GET_SETTINGS") {
      void settingsMutationQueue
        .then(() => getSettings())
        .then((settings) => sendResponse({ ok: true, settings }))
        .catch((error: unknown) =>
          sendResponse({
            ok: false,
            error: error instanceof Error ? error.message : "SETTINGS_READ_FAILED",
          }),
        );
      return true;
    }

    if (message.type === "SET_SETTINGS") {
      void enqueueSettingsMutation(message.patch)
        .then((settings) => sendResponse({ ok: true, settings }))
        .catch((error: unknown) =>
          sendResponse({
            ok: false,
            error: error instanceof Error ? error.message : "SETTINGS_WRITE_FAILED",
          }),
        );
      return true;
    }

    if (message.type === "DISPATCH_TRUSTED_LIKE") {
      const tabId = sender.tab?.id;
      const senderUrl = sender.tab?.url ?? sender.url ?? "";
      if (tabId === undefined || !senderUrl.startsWith("https://www.tiktok.com/")) {
        sendResponse({ ok: false, error: "UNAUTHORIZED_LIKE_SOURCE" });
        return false;
      }
      void dispatchTrustedLike(
        tabId,
        message.x,
        message.y,
        message.doubleClick,
      ).then(
        () => sendResponse({ ok: true }),
        (error: unknown) => sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : "TRUSTED_INPUT_FAILED",
        }),
      );
      return true;
    }

    if (message.type === "RELEASE_TRUSTED_INPUT") {
      const tabId = sender.tab?.id;
      if (tabId === undefined) {
        sendResponse({ ok: false, error: "MISSING_TAB" });
        return false;
      }
      void releaseTrustedInput(tabId).then(
        () => sendResponse({ ok: true }),
        (error: unknown) => sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : "TRUSTED_INPUT_RELEASE_FAILED",
        }),
      );
      return true;
    }

    return false;
  },
);
