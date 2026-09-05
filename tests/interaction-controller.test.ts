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

  it("dispatches one real interaction to the resolved target", () => {
    const fixture = createEnvironment({ simulation: false });
    const controller = new InteractionController(fixture.environment, 100);

    expect(controller.trigger()).toBe(true);
    expect(fixture.executeReal).toHaveBeenCalledExactlyOnceWith(fixture.target);
    expect(fixture.executeSimulation).not.toHaveBeenCalled();
    expect(fixture.onInteraction).toHaveBeenCalledWith("dispatched");
    expect(fixture.onError).toHaveBeenCalledWith(null);
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
