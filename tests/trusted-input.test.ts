import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("trusted Chrome input", () => {
  const attach = vi.fn(async (): Promise<void> => undefined);
  const detach = vi.fn(async () => undefined);
  const sendCommand = vi.fn(async (_target: chrome.debugger.Debuggee, _method: string, _params: object) => undefined);

  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    attach.mockClear();
    detach.mockClear();
    sendCommand.mockClear();
    vi.stubGlobal("chrome", {
      debugger: {
        attach,
        detach,
        sendCommand,
        onDetach: { addListener: vi.fn() },
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("sends one browser-level click and reuses the debugger session", async () => {
    const { dispatchTrustedLike } = await import("../src/background/trusted-input");
    await dispatchTrustedLike(42, 120, 240, false);
    await dispatchTrustedLike(42, 120, 240, false);

    expect(attach).toHaveBeenCalledOnce();
    expect(sendCommand).toHaveBeenCalledTimes(6);
    expect(sendCommand.mock.calls.map((call) => call[2])).toEqual([
      expect.objectContaining({ type: "mouseMoved", x: 120, y: 240, pointerType: "pen" }),
      expect.objectContaining({ type: "mousePressed", clickCount: 1 }),
      expect.objectContaining({ type: "mouseReleased", clickCount: 1 }),
      expect.objectContaining({ type: "mouseMoved", x: 120, y: 240, pointerType: "pen" }),
      expect.objectContaining({ type: "mousePressed", clickCount: 1 }),
      expect.objectContaining({ type: "mouseReleased", clickCount: 1 }),
    ]);
  });

  it("sends a complete double-click for a video target", async () => {
    const { dispatchTrustedLike } = await import("../src/background/trusted-input");
    await dispatchTrustedLike(7, 300, 200, true);

    expect(sendCommand.mock.calls.map((call) => call[2])).toEqual([
      expect.objectContaining({ type: "mouseMoved" }),
      expect.objectContaining({ type: "mousePressed", clickCount: 1 }),
      expect.objectContaining({ type: "mouseReleased", clickCount: 1 }),
      expect.objectContaining({ type: "mousePressed", clickCount: 2 }),
      expect.objectContaining({ type: "mouseReleased", clickCount: 2 }),
    ]);
  });

  it("detaches after the idle timeout", async () => {
    const { dispatchTrustedLike } = await import("../src/background/trusted-input");
    await dispatchTrustedLike(9, 10, 20, false);
    await vi.advanceTimersByTimeAsync(2_500);
    await Promise.resolve();
    expect(detach).toHaveBeenCalledWith({ tabId: 9 });
  });

  it("rejects invalid coordinates before attaching", async () => {
    const { dispatchTrustedLike } = await import("../src/background/trusted-input");
    await expect(dispatchTrustedLike(9, -1, 20, false)).rejects.toThrow(
      "INVALID_LIKE_COORDINATES",
    );
    expect(attach).not.toHaveBeenCalled();
  });

  it("cancels pending clicks when stopped during debugger attachment", async () => {
    let finishAttach!: () => void;
    attach.mockImplementationOnce(() => new Promise<void>((resolve) => { finishAttach = resolve; }));
    const { dispatchTrustedLike, releaseTrustedInput } = await import("../src/background/trusted-input");
    const first = dispatchTrustedLike(42, 120, 240, false).catch((e: Error) => e.message);
    const second = dispatchTrustedLike(42, 120, 240, false).catch((e: Error) => e.message);
    await vi.advanceTimersByTimeAsync(1);
    const stopped = releaseTrustedInput(42);
    finishAttach();
    await Promise.all([first, second, stopped]);
    expect(sendCommand).not.toHaveBeenCalled();
    expect(detach).toHaveBeenCalledOnce();
  });
});
