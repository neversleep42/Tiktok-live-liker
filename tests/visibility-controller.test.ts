import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  InteractionController,
  type InteractionEnvironment,
} from "../src/content/interaction-controller";
import { VisibilityController } from "../src/content/visibility-controller";

describe("VisibilityController", () => {
  let visibilityState: DocumentVisibilityState;

  beforeEach(() => {
    visibilityState = "visible";
    vi.spyOn(document, "visibilityState", "get").mockImplementation(
      () => visibilityState,
    );
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("reports active only while the document is visible and focused", () => {
    const controller = new VisibilityController(document, window, vi.fn());
    expect(controller.isActive()).toBe(true);

    visibilityState = "hidden";
    expect(controller.isActive()).toBe(false);

    visibilityState = "visible";
    vi.mocked(document.hasFocus).mockReturnValue(false);
    expect(controller.isActive()).toBe(false);
  });

  it("notifies on hidden visibility, blur, and pagehide", () => {
    const onInactive = vi.fn();
    const controller = new VisibilityController(document, window, onInactive);
    controller.start();

    document.dispatchEvent(new Event("visibilitychange"));
    expect(onInactive).not.toHaveBeenCalled();

    visibilityState = "hidden";
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("blur"));
    window.dispatchEvent(new Event("pagehide"));
    expect(onInactive).toHaveBeenCalledTimes(3);
    controller.stop();
  });

  it("does not duplicate listeners and removes them on stop", () => {
    const onInactive = vi.fn();
    const controller = new VisibilityController(document, window, onInactive);
    controller.start();
    controller.start();

    window.dispatchEvent(new Event("blur"));
    expect(onInactive).toHaveBeenCalledOnce();

    controller.stop();
    controller.stop();
    visibilityState = "hidden";
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("blur"));
    window.dispatchEvent(new Event("pagehide"));
    expect(onInactive).toHaveBeenCalledOnce();
  });

  it("stops an active interaction hold as soon as the page becomes hidden", () => {
    vi.useFakeTimers();
    const executeSimulation = vi.fn();
    const target = document.createElement("button");
    document.body.append(target);
    const environment: InteractionEnvironment = {
      isEnabled: () => true,
      isLiveDetected: () => true,
      isVisible: () => visibilityState === "visible",
      hasFocus: () => true,
      isSimulationMode: () => true,
      getTarget: () => target,
      executeReal: vi.fn(),
      executeSimulation,
      onInteraction: vi.fn(),
      onInteractingChange: vi.fn(),
      onError: vi.fn(),
    };
    const interaction = new InteractionController(environment, 100);
    const visibility = new VisibilityController(
      document,
      window,
      () => interaction.stop(),
    );
    visibility.start();
    interaction.start();
    expect(executeSimulation).toHaveBeenCalledOnce();

    visibilityState = "hidden";
    document.dispatchEvent(new Event("visibilitychange"));
    vi.advanceTimersByTime(500);

    expect(interaction.isInteracting).toBe(false);
    expect(executeSimulation).toHaveBeenCalledOnce();
    visibility.stop();
    target.remove();
  });
});
