import { getSettings, setSettings } from "../shared/settings";
import type { ExtensionSettings } from "../shared/types";
import type { ExtensionMessage, ExtensionResponse } from "../shared/types";

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
