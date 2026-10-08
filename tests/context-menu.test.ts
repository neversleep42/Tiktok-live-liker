import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("context menu initialization", () => {
  let installed: () => void;
  let startup: () => void;
  let updateCallback: () => void;
  let createCallback: () => void;
  let lastError: { message: string } | undefined;
  let lastErrorRead: ReturnType<typeof vi.fn<() => { message: string } | undefined>>;
  let update: ReturnType<typeof vi.fn>;
  let create: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.resetModules();
    lastError = undefined;
    lastErrorRead = vi.fn(() => lastError);
    update = vi.fn((_id, _properties, callback) => { updateCallback = callback; });
    create = vi.fn((_properties, callback) => { createCallback = callback; });
    vi.stubGlobal("chrome", {
      runtime: {
        get lastError() { return lastErrorRead(); },
        onInstalled: { addListener: (callback: () => void) => { installed = callback; } },
        onStartup: { addListener: (callback: () => void) => { startup = callback; } },
        onMessage: { addListener: vi.fn() },
      },
      debugger: { onDetach: { addListener: vi.fn() } },
      tabs: {
        onRemoved: { addListener: vi.fn() },
        sendMessage: vi.fn(async () => ({ ok: true })),
      },
      contextMenus: { update, create, onClicked: { addListener: vi.fn() } },
    });
    await import("../src/background/service-worker");
  });

  afterEach(() => { vi.unstubAllGlobals(); });

  it("updates an existing menu on install and startup without creating a duplicate", () => {
    installed();
    expect(update).toHaveBeenCalledWith("lla-use-target", expect.objectContaining({
      title: "♥ Utiliser comme cible LIVE Like",
      documentUrlPatterns: ["https://www.tiktok.com/*"],
    }), expect.any(Function));
    updateCallback();
    startup();
    updateCallback();
    expect(update).toHaveBeenCalledTimes(2);
    expect(create).not.toHaveBeenCalled();
  });

  it("creates a missing menu and reads asynchronous errors inside both callbacks", () => {
    installed();
    lastError = { message: "Cannot find menu item with id lla-use-target" };
    updateCallback();
    expect(lastErrorRead).toHaveBeenCalledOnce();
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ id: "lla-use-target" }), expect.any(Function));
    lastError = undefined;
    createCallback();
    expect(lastErrorRead).toHaveBeenCalledTimes(2);
    startup();
    updateCallback();
    expect(create).toHaveBeenCalledOnce();
  });

  it("coalesces overlapping lifecycle events until creation completes", () => {
    installed();
    startup();
    expect(update).toHaveBeenCalledOnce();
    lastError = { message: "Missing menu" };
    updateCallback();
    installed();
    startup();
    expect(create).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledOnce();
    lastError = undefined;
    createCallback();
    startup();
    expect(update).toHaveBeenCalledTimes(2);
  });

  it("handles a creation failure and allows a subsequent initialization", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    installed();
    lastError = { message: "Missing menu" };
    updateCallback();
    lastError = { message: "Creation failed" };
    createCallback();
    expect(lastErrorRead).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledWith(expect.any(String), "Creation failed");
    lastError = undefined;
    startup();
    updateCallback();
    expect(update).toHaveBeenCalledTimes(2);
  });
});
