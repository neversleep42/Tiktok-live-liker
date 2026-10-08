import { describe, expect, it } from "vitest";
import { normalizeSettings } from "../src/shared/settings";

describe("settings migration and cadence", () => {
  it("keeps existing preferences, clamps legacy speed and defaults to manual", () => {
    expect(normalizeSettings({ enabled: false, simulationMode: false, holdIntervalMs: 180 }))
      .toEqual({ enabled: false, simulationMode: false, holdIntervalMs: 180, interactionMode: "manual" });
  });

  it("persists automatic mode independently of simulation", () => {
    expect(normalizeSettings({ interactionMode: "automatic", simulationMode: false, holdIntervalMs: 400 }))
      .toMatchObject({ interactionMode: "automatic", simulationMode: false, holdIntervalMs: 400 });
  });

  it.each([[100, 100], [0, 100], [-20, 100], [10000, 1500], [NaN, 250], [Infinity, 250]])(
    "normalizes interval %s to %s", (input, expected) => {
      expect(normalizeSettings({ holdIntervalMs: input }).holdIntervalMs).toBe(expected);
    },
  );
});
