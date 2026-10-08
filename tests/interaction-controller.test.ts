import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  InteractionController,
  type InteractionEnvironment,
} from "../src/content/interaction-controller";

interface EnvironmentFlags {
  enabled: boolean;
  liveDetected: boolean;
  visible: boolean;
  focused: boolean;
  simulation: boolean;
  target: HTMLElement | null;
}

function createEnvironment(overrides: Partial<EnvironmentFlags> = {}) {
  const target = document.createElement("button");
  target.dataset.e2e = "live-like-button";
  document.body.append(target);

  const flags: EnvironmentFlags = {
    enabled: true,
    liveDetected: true,
    visible: true,
    focused: true,
    simulation: true,
    target,
    ...overrides,
  };

  const executeReal = vi.fn();
  const executeSimulation = vi.fn();
  const onInteraction = vi.fn();
  const onInteractingChange = vi.fn();
  const onError = vi.fn();
  const getTarget = vi.fn(() => flags.target);

  const environment: InteractionEnvironment = {
    isEnabled: () => flags.enabled,
    isLiveDetected: () => flags.liveDetected,
    isVisible: () => flags.visible,
    hasFocus: () => flags.focused,
    isSimulationMode: () => flags.simulation,
    getTarget,
    executeReal,
    executeSimulation,
    onInteraction,
    onInteractingChange,
    onError,
  };

  return {
    environment,
    flags,
    target,
    executeReal,
    executeSimulation,
    getTarget,
    onInteraction,
    onInteractingChange,
    onError,
  };
}

describe("InteractionController", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.replaceChildren();
  });

  it("runs one immediate simulation without touching the real target", () => {
    const fixture = createEnvironment();
    const controller = new InteractionController(fixture.environment, 100);

    expect(controller.trigger()).toBe(true);
    expect(fixture.executeSimulation).toHaveBeenCalledOnce();
    expect(fixture.executeReal).not.toHaveBeenCalled();
    expect(fixture.onInteraction).toHaveBeenCalledWith("simulated");
    expect(fixture.onError).toHaveBeenCalledWith(null);
    expect(controller.isInteracting).toBe(false);
  });

  it("waits for browser acknowledgement and never queues overlapping clicks", async () => {
    const fixture = createEnvironment({ simulation: false });
    let finish!: (ok: boolean) => void;
    fixture.executeReal.mockImplementation(() => new Promise<boolean>((resolve) => { finish = resolve; }));
    const controller = new InteractionController(fixture.environment, 100);
    controller.start();
    await vi.advanceTimersByTimeAsync(350);
    expect(fixture.onInteraction).not.toHaveBeenCalled();
    expect(fixture.executeReal).toHaveBeenCalledTimes(1);
    finish(true);
    await vi.advanceTimersByTimeAsync(1);
    expect(fixture.onInteraction).toHaveBeenCalledTimes(1);
    expect(fixture.executeReal).toHaveBeenCalledTimes(2);
    controller.stop();
    finish(true);
    await vi.advanceTimersByTimeAsync(500);
    expect(fixture.onInteraction).toHaveBeenCalledTimes(1);
    expect(fixture.executeReal).toHaveBeenCalledTimes(2);
  });

  it("stops on async failure without counting or retrying", async () => {
    const fixture = createEnvironment({ simulation: false });
    fixture.executeReal.mockImplementation(async () => false);
    const controller = new InteractionController(fixture.environment, 100);
    controller.start();
    await vi.advanceTimersByTimeAsync(1000);
    expect(controller.isInteracting).toBe(false);
    expect(fixture.onInteraction).not.toHaveBeenCalled();
    expect(fixture.executeReal).toHaveBeenCalledTimes(1);
    expect(fixture.onError).toHaveBeenLastCalledWith("INTERACTION_DISPATCH_FAILED");
  });

  it("cancels a pending single click on blur and ignores its late response", async () => {
    const fixture = createEnvironment({ simulation: false });
    let finish!: (ok: boolean) => void;
    fixture.executeReal.mockImplementation(() => new Promise<boolean>((resolve) => { finish = resolve; }));
    const controller = new InteractionController(fixture.environment, 100);
    expect(controller.trigger()).toBe(true);
    expect(controller.trigger()).toBe(false);
    controller.stop();
    expect(fixture.onInteractingChange).toHaveBeenCalledWith(false);
    finish(true);
    await vi.advanceTimersByTimeAsync(500);
    expect(fixture.onInteraction).not.toHaveBeenCalled();
    expect(fixture.executeReal).toHaveBeenCalledTimes(1);
  });

  it("keeps a 100ms start-to-start cadence with 30ms browser latency", async () => {
    const fixture = createEnvironment({ simulation: false });
    fixture.executeReal.mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve(true), 30)));
    const controller = new InteractionController(fixture.environment, 100);
    controller.start();
    await vi.advanceTimersByTimeAsync(999);
    expect(fixture.executeReal).toHaveBeenCalledTimes(10);
    expect(fixture.onInteraction).toHaveBeenCalledTimes(10);
    controller.stop();
  });

  it("dispatches one real interaction to the resolved target", () => {
    const fixture = createEnvironment({ simulation: false });
    const controller = new InteractionController(fixture.environment, 100);

    expect(controller.trigger()).toBe(true);
    expect(fixture.executeReal).toHaveBeenCalledExactlyOnceWith(fixture.target);
    expect(fixture.executeSimulation).not.toHaveBeenCalled();
    expect(fixture.onInteraction).toHaveBeenCalledWith("dispatched");
    expect(fixture.onError).toHaveBeenCalledWith(null);
  });

  it("stops and reports a dispatch failure without counting it", () => {
    const fixture = createEnvironment({ simulation: false });
    fixture.executeReal.mockImplementation(() => { throw new Error("dispatch failed"); });
    const controller = new InteractionController(fixture.environment, 100);

    expect(controller.start()).toBe(false);
    expect(controller.isInteracting).toBe(false);
    expect(fixture.onInteraction).not.toHaveBeenCalled();
    expect(fixture.onError).toHaveBeenCalledWith("INTERACTION_DISPATCH_FAILED");
  });

  it("does not count a dispatch rejected by the page-world bridge", () => {
    const fixture = createEnvironment({ simulation: false });
    fixture.executeReal.mockReturnValue(false);
    const controller = new InteractionController(fixture.environment, 100);

    expect(controller.trigger()).toBe(false);
    expect(fixture.onInteraction).not.toHaveBeenCalled();
    expect(fixture.onError).toHaveBeenLastCalledWith("INTERACTION_DISPATCH_FAILED");
  });

  it("attempts immediately, repeats on one cadence, and stops on request", () => {
    const fixture = createEnvironment();
    const controller = new InteractionController(fixture.environment, 100);

    expect(controller.start()).toBe(true);
    expect(controller.isInteracting).toBe(true);
    expect(fixture.executeSimulation).toHaveBeenCalledTimes(1);
    expect(fixture.onInteractingChange).toHaveBeenCalledWith(true);

    vi.advanceTimersByTime(250);
    expect(fixture.executeSimulation).toHaveBeenCalledTimes(3);
    expect(controller.start()).toBe(false);

    controller.stop();
    expect(controller.isInteracting).toBe(false);
    expect(fixture.onInteractingChange).toHaveBeenLastCalledWith(false);

    vi.advanceTimersByTime(500);
    expect(fixture.executeSimulation).toHaveBeenCalledTimes(3);
  });

  it.each([
    ["disabled", { enabled: false }],
    ["not live", { liveDetected: false }],
    ["document hidden", { visible: false }],
    ["window unfocused", { focused: false }],
  ] satisfies Array<[string, Partial<EnvironmentFlags>]>) (
    "blocks interaction when %s",
    (_description, overrides) => {
      const fixture = createEnvironment(overrides);
      const controller = new InteractionController(fixture.environment, 100);

      expect(controller.trigger()).toBe(false);
      expect(fixture.executeSimulation).not.toHaveBeenCalled();
      expect(fixture.executeReal).not.toHaveBeenCalled();
      expect(fixture.onInteraction).not.toHaveBeenCalled();
    },
  );

  it("stops an active hold when a guard becomes false", () => {
    const fixture = createEnvironment();
    const controller = new InteractionController(fixture.environment, 100);
    controller.start();

    fixture.flags.enabled = false;
    vi.advanceTimersByTime(100);

    expect(controller.isInteracting).toBe(false);
    expect(fixture.executeSimulation).toHaveBeenCalledTimes(1);
    expect(fixture.onInteractingChange).toHaveBeenLastCalledWith(false);
    vi.advanceTimersByTime(500);
    expect(fixture.executeSimulation).toHaveBeenCalledTimes(1);
  });

  it("applies a faster cadence immediately without duplicating timers", () => {
    const fixture = createEnvironment();
    const controller = new InteractionController(fixture.environment, 350);
    controller.start();
    vi.advanceTimersByTime(100);
    controller.setIntervalMs(100);
    vi.advanceTimersByTime(1000);
    expect(fixture.executeSimulation).toHaveBeenCalledTimes(11);
    expect(vi.getTimerCount()).toBe(1);
    controller.stop();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    ["missing", null],
    ["detached", document.createElement("button")],
  ])("reports a %s real target and fails closed", (_description, target) => {
    const fixture = createEnvironment({ simulation: false, target });
    const controller = new InteractionController(fixture.environment, 100);

    expect(controller.trigger()).toBe(false);
    expect(fixture.executeReal).not.toHaveBeenCalled();
    expect(fixture.onInteraction).not.toHaveBeenCalled();
    expect(fixture.onError).toHaveBeenCalledWith(
      "INTERACTION_TARGET_NOT_FOUND",
    );
  });

  it("runs simulation without requiring a real target", () => {
    const fixture = createEnvironment({ simulation: true, target: null });
    const controller = new InteractionController(fixture.environment, 100);

    expect(controller.trigger()).toBe(true);
    expect(fixture.executeSimulation).toHaveBeenCalledOnce();
    expect(fixture.executeReal).not.toHaveBeenCalled();
    expect(fixture.onInteraction).toHaveBeenCalledWith("simulated");
    expect(fixture.onError).toHaveBeenCalledWith(null);
  });

  it("stops a real hold if its target disappears between attempts", () => {
    const fixture = createEnvironment({ simulation: false });
    const controller = new InteractionController(fixture.environment, 100);
    controller.start();
    fixture.target.remove();

    vi.advanceTimersByTime(100);

    expect(fixture.executeReal).toHaveBeenCalledTimes(1);
    expect(fixture.onError).toHaveBeenLastCalledWith(
      "INTERACTION_TARGET_NOT_FOUND",
    );
    expect(controller.isInteracting).toBe(false);
    expect(fixture.onInteractingChange).toHaveBeenLastCalledWith(false);
  });
});
