import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Popup } from "../src/popup/Popup";
import type {
  ExtensionMessage,
  ExtensionResponse,
  RuntimeStatus,
} from "../src/shared/types";

type RuntimeMessageListener = Parameters<
  typeof chrome.runtime.onMessage.addListener
>[0];
type StorageChangeListener = Parameters<
  typeof chrome.storage.onChanged.addListener
>[0];

const INITIAL_STATUS: RuntimeStatus = {
  enabled: true,
  liveDetected: true,
  interacting: false,
  simulationMode: true,
  interactionCount: 3,
  status: "SIMULATION",
  error: null,
};

function installChromeMock(initialStatus: RuntimeStatus) {
  const runtimeListeners = new Set<RuntimeMessageListener>();
  const storageListeners = new Set<StorageChangeListener>();
  const query = vi.fn(async () => [{ id: 17 }]);
  const sendTabMessage = vi.fn(
    async (
      _tabId: number,
      message: ExtensionMessage,
    ): Promise<ExtensionResponse> => {
      if (message.type === "GET_STATUS") {
        return { ok: true, status: initialStatus };
      }
      return { ok: true };
    },
  );

  const chromeMock = {
    tabs: {
      query,
      sendMessage: sendTabMessage,
    },
    runtime: {
      sendMessage: vi.fn(async (): Promise<ExtensionResponse> => ({ ok: true })),
      onMessage: {
        addListener: vi.fn((listener: RuntimeMessageListener) => {
          runtimeListeners.add(listener);
        }),
        removeListener: vi.fn((listener: RuntimeMessageListener) => {
          runtimeListeners.delete(listener);
        }),
      },
    },
    storage: {
      local: {
        get: vi.fn(async () => ({
          settings: {
            enabled: initialStatus.enabled,
            simulationMode: initialStatus.simulationMode,
          },
        })),
      },
      onChanged: {
        addListener: vi.fn((listener: StorageChangeListener) => {
          storageListeners.add(listener);
        }),
        removeListener: vi.fn((listener: StorageChangeListener) => {
          storageListeners.delete(listener);
        }),
      },
    },
  };

  Object.defineProperty(globalThis, "chrome", {
    configurable: true,
    value: chromeMock as unknown as typeof chrome,
  });

  return { query, runtimeListeners, storageListeners };
}

async function flushAsyncWork(): Promise<void> {
  for (let index = 0; index < 6; index += 1) {
    await Promise.resolve();
  }
}

describe("Popup event synchronization", () => {
  let container: HTMLDivElement;
  let root: Root;
  let harness: ReturnType<typeof installChromeMock>;

  beforeEach(async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    harness = installChromeMock(INITIAL_STATUS);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root.render(createElement(Popup));
      await flushAsyncWork();
    });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    document.body.replaceChildren();
    Reflect.deleteProperty(globalThis, "chrome");
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT");
  });

  it("accepts status messages only from the active tab", () => {
    const foreignStatus: RuntimeStatus = {
      ...INITIAL_STATUS,
      interactionCount: 91,
      status: "ACTIVE",
      interacting: true,
    };

    act(() => {
      for (const listener of harness.runtimeListeners) {
        listener(
          { type: "STATUS_CHANGED", status: foreignStatus },
          { tab: { id: 99 } } as chrome.runtime.MessageSender,
          vi.fn(),
        );
      }
    });

    expect(container.querySelector(".status-card strong")?.textContent).toBe(
      "Simulation prête",
    );
    expect(container.querySelector(".counter strong")?.textContent).toBe("3");

    const activeTabStatus: RuntimeStatus = {
      ...INITIAL_STATUS,
      enabled: false,
      simulationMode: false,
      interactionCount: 7,
      status: "DISABLED",
    };
    act(() => {
      for (const listener of harness.runtimeListeners) {
        listener(
          { type: "STATUS_CHANGED", status: activeTabStatus },
          { tab: { id: 17 } } as chrome.runtime.MessageSender,
          vi.fn(),
        );
      }
    });

    expect(container.querySelector(".status-card strong")?.textContent).toBe(
      "Extension désactivée",
    );
    expect(container.querySelector(".counter strong")?.textContent).toBe("7");
    expect(
      [...container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')]
        .map((input) => input.checked),
    ).toEqual([false, false]);
    expect(harness.query).toHaveBeenCalledWith({
      active: true,
      currentWindow: true,
    });
  });

  it("synchronizes switches only from the local settings storage entry", () => {
    const checkboxes = () =>
      [...container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
    const disabledSettings: chrome.storage.StorageChange = {
      oldValue: { enabled: true, simulationMode: true },
      newValue: { enabled: false, simulationMode: false },
    };

    act(() => {
      for (const listener of harness.storageListeners) {
        listener({ settings: disabledSettings }, "sync");
        listener({ unrelated: disabledSettings }, "local");
      }
    });
    expect(checkboxes().map((input) => input.checked)).toEqual([true, true]);

    act(() => {
      for (const listener of harness.storageListeners) {
        listener({ settings: disabledSettings }, "local");
      }
    });
    expect(checkboxes().map((input) => input.checked)).toEqual([false, false]);
  });
});
