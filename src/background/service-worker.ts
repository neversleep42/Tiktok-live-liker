import { getSettings, setSettings } from "../shared/settings";
import type { ExtensionSettings } from "../shared/types";
import type { ExtensionMessage, ExtensionResponse } from "../shared/types";

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

function ensureContextMenu(): void {
  try {
    chrome.contextMenus.create({
      id: CONTEXT_MENU_ID,
      title: "♥ Utiliser comme cible LIVE Like",
      contexts: ["all"],
      documentUrlPatterns: ["https://www.tiktok.com/*"],
    });
  } catch {
    // Menu déjà créé (reload en dev) : on ignore.
  }
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

chrome.runtime.onMessage.addListener(
  (
    message: ExtensionMessage,
    _sender,
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

    return false;
  },
);
