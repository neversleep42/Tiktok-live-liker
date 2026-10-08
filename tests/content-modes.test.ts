import type { ComponentProps, ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FloatingController } from "../src/components/FloatingController";
import { DEFAULT_SETTINGS } from "../src/shared/constants";
import type { ExtensionMessage, ExtensionSettings } from "../src/shared/types";

const ui = vi.hoisted(() => ({ render: vi.fn(), unmount: vi.fn() }));
vi.mock("react-dom/client", () => ({ createRoot: () => ui }));

type Props = ComponentProps<typeof FloatingController>;
const panel = () => (ui.render.mock.lastCall![0] as ReactElement<Props>).props;

describe("manual and automatic content controls", () => {
  let settings: ExtensionSettings;
  let storageListener: (changes: Record<string, chrome.storage.StorageChange>, area: string) => void;
  let messageListener: (message: ExtensionMessage, sender: object, reply: ReturnType<typeof vi.fn>) => void;

  function update(patch: Partial<ExtensionSettings>) {
    settings = { ...settings, ...patch };
    storageListener({ settings: { newValue: settings } }, "local");
  }

  beforeEach(async () => {
    vi.resetModules();
    vi.useFakeTimers();
    settings = { ...DEFAULT_SETTINGS, holdIntervalMs: 650 };
    document.body.innerHTML = '<main data-e2e="live-room"><button data-e2e="live-like-button">Like</button></main>';
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    vi.stubGlobal("chrome", {
      runtime: {
        id: "test-extension",
        sendMessage: vi.fn(async (message: ExtensionMessage) => {
          if (message.type === "SET_SETTINGS") update(message.patch);
          return { ok: true, settings };
        }),
        onMessage: { addListener: vi.fn((fn) => { messageListener = fn; }), removeListener: vi.fn() },
      },
      storage: {
        local: { get: vi.fn(async () => ({ settings })), set: vi.fn(async () => undefined) },
        onChanged: { addListener: vi.fn((fn) => { storageListener = fn; }), removeListener: vi.fn() },
      },
    });
    await import("../src/content/content-script");
    for (let i = 0; i < 8; i++) await Promise.resolve();
  });

  afterEach(() => {
    window.dispatchEvent(new PageTransitionEvent("pagehide"));
    document.body.replaceChildren();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("sends a single manual like and repeats only while held", () => {
    panel().onTrigger();
    expect(panel().count).toBe(1);
    panel().onHoldStart("pointer");
    vi.advanceTimersByTime(1300);
    expect(panel().count).toBe(4);
    panel().onHoldStop("pointer");
    vi.advanceTimersByTime(500);
    expect(panel().count).toBe(4);
    expect(panel().status).toBe("SIMULATION");
  });

  it("starts auto explicitly, survives pointer release, and stops on a second click", () => {
    panel().onModeChange("automatic");
    vi.advanceTimersByTime(500);
    expect(panel().count).toBe(0);
    panel().onToggleAutomatic();
    panel().onHoldStop("pointer");
    window.dispatchEvent(new Event("pointerup"));
    vi.advanceTimersByTime(1300);
    expect(panel().count).toBe(3);
    expect(panel().status).toBe("ACTIVE");
    panel().onToggleAutomatic();
    vi.advanceTimersByTime(500);
    expect(panel().count).toBe(3);
  });

  it("changes cadence without interrupting auto and stops when switching back to manual", () => {
    update({ interactionMode: "automatic" });
    panel().onToggleAutomatic();
    panel().onIntervalChange(400);
    vi.advanceTimersByTime(1000);
    expect(panel().count).toBe(3);
    panel().onModeChange("manual");
    vi.advanceTimersByTime(500);
    expect(panel().count).toBe(3);
    expect(panel().status).toBe("SIMULATION");
  });

  it.each(["blur", "hidden", "disabled", "simulation", "reset", "live removed"])(
    "stops automatic likes on %s without resuming by itself", async (reason) => {
      update({ interactionMode: "automatic" });
      panel().onToggleAutomatic();
      if (reason === "blur") window.dispatchEvent(new Event("blur"));
      if (reason === "hidden") {
        vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
        document.dispatchEvent(new Event("visibilitychange"));
      }
      if (reason === "disabled") update({ enabled: false });
      if (reason === "simulation") update({ simulationMode: false });
      if (reason === "reset") messageListener({ type: "RESET_SESSION" }, {}, vi.fn());
      if (reason === "live removed") {
        document.querySelector("main")!.remove();
        await Promise.resolve();
        vi.advanceTimersByTime(150);
      }
      const reply = vi.fn();
      messageListener({ type: "GET_STATUS" }, {}, reply);
      expect(reply.mock.lastCall![0].status.interacting).toBe(false);
      const stoppedCount = reply.mock.lastCall![0].status.interactionCount;
      window.dispatchEvent(new Event("focus"));
      vi.advanceTimersByTime(500);
      messageListener({ type: "GET_STATUS" }, {}, reply);
      expect(reply.mock.lastCall![0].status.interactionCount).toBe(stoppedCount);
    },
  );

  const sentLikes = () => (vi.mocked(chrome.runtime.sendMessage).mock.calls as unknown as [ExtensionMessage][])
    .map(([message]) => message).filter((message) => message.type === "DISPATCH_TRUSTED_LIKE");

  it("dispatches one browser request per attempt after simulation is disabled", async () => {
    update({ interactionMode: "automatic", holdIntervalMs: 400 });
    panel().onToggleAutomatic();
    vi.advanceTimersByTime(800);
    expect(sentLikes()).toHaveLength(0);
    update({ simulationMode: false });
    panel().onToggleAutomatic();
    await vi.advanceTimersByTimeAsync(800);
    expect(sentLikes()).toHaveLength(3);
    expect(sentLikes()[0]).toMatchObject({ doubleClick: false });
  });

  it("targets the video child even when its room and player containers are visible", async () => {
    document.body.querySelector("main")!.innerHTML = '<div data-e2e="live-room-player"><video></video></div>';
    for (const element of document.querySelectorAll("main, main *")) {
      vi.spyOn(element, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, right: 640, bottom: 360, width: 640, height: 360 } as DOMRect);
    }
    update({ interactionMode: "automatic", simulationMode: false });
    await vi.advanceTimersByTimeAsync(150);
    panel().onTrigger();
    await vi.advanceTimersByTimeAsync(0);
    expect(sentLikes()).toEqual([{ type: "DISPATCH_TRUSTED_LIKE", x: 320, y: 180, doubleClick: true }]);
    expect(panel().count).toBe(1);
  });

  it("does not count clicks on an empty room as attempted likes", () => {
    const room = document.querySelector("main")!;
    room.replaceChildren();
    vi.spyOn(room, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, right: 640, bottom: 360, width: 640, height: 360 } as DOMRect);
    update({ simulationMode: false });
    panel().onTrigger();
    expect(panel().status).toBe("TARGET_MISSING");
    expect(panel().count).toBe(0);
  });

  it("uses a non-button area selected by right click in automatic mode", () => {
    const area = document.createElement("div");
    document.querySelector("main")!.append(area);
    vi.spyOn(area, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, right: 640, bottom: 360, width: 640, height: 360 } as DOMRect);
    area.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX: 123, clientY: 45 }));
    const reply = vi.fn();
    messageListener({ type: "USE_CONTEXT_TARGET" }, {}, reply);
    expect(reply).toHaveBeenCalledWith({ ok: true });
    update({ simulationMode: false, interactionMode: "automatic" });
    panel().onToggleAutomatic();
    expect(sentLikes()).toEqual([{ type: "DISPATCH_TRUSTED_LIKE", x: 123, y: 45, doubleClick: true }]);
  });

  it("uses a visible room like control in real automatic mode", async () => {
    document.body.innerHTML = `
      <main id="tiktok-live-main-container-id">
        <div data-e2e="live-room-content"><video></video></div>
        <div data-e2e="room-chat-like-btn" style="display:none"></div>
        <div data-e2e="room-chat-like-btn"></div>
      </main>
    `;
    update({ interactionMode: "automatic", simulationMode: false, holdIntervalMs: 400 });
    await vi.advanceTimersByTimeAsync(150);
    panel().onToggleAutomatic();
    await vi.advanceTimersByTimeAsync(800);
    expect(sentLikes()).toHaveLength(3);
    expect(sentLikes().every((message) => message.doubleClick === false)).toBe(true);
    expect(panel().count).toBe(3);
  });

  it("does not stop pointer hold when a generated click releases on the like target", async () => {
    update({ simulationMode: false, holdIntervalMs: 100 });
    panel().onHoldStart("pointer", 1);
    document.querySelector("main button")!.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 2, pointerType: "pen" }));
    await vi.advanceTimersByTimeAsync(250);
    expect(sentLikes()).toHaveLength(3);
    expect(panel().status).toBe("ACTIVE");
    document.body.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 1, pointerType: "mouse" }));
    await vi.advanceTimersByTimeAsync(300);
    expect(sentLikes()).toHaveLength(3);
    expect(panel().status).toBe("READY");
  });

  it("lets the panel exit simulation without automatically starting likes", () => {
    panel().onTrigger();
    expect(panel().count).toBe(1);
    panel().onSimulationChange(false);
    expect(panel().simulationMode).toBe(false);
    vi.advanceTimersByTime(500);
    expect(panel().count).toBe(1);
  });
});
