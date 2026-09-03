import { describe, expect, it, vi } from "vitest";

import { SessionCounter } from "../src/content/session-counter";

describe("SessionCounter", () => {
  it("starts a zero-count session using the supplied clock", () => {
    const counter = new SessionCounter(() => 1_234);

    expect(counter.getCount()).toBe(0);
    expect(counter.getState()).toEqual({
      interactionCount: 0,
      startedAt: 1_234,
      liveKey: null,
    });
  });

  it("increments exactly once per call", () => {
    const counter = new SessionCounter(() => 100);

    expect(counter.increment()).toBe(1);
    expect(counter.increment()).toBe(2);
    expect(counter.getCount()).toBe(2);
  });

  it("preserves a session when the live key is unchanged", () => {
    const now = vi.fn(() => 100);
    const counter = new SessionCounter(now);
    counter.beginLive("creator");
    counter.increment();

    expect(counter.beginLive("creator")).toEqual({
      interactionCount: 1,
      startedAt: 100,
      liveKey: "creator",
    });
    expect(now).toHaveBeenCalledTimes(2);
  });

  it("resets count and start time when the live identity changes", () => {
    const times = [10, 20, 30];
    const counter = new SessionCounter(() => times.shift() ?? 99);
    counter.beginLive("creator-a");
    counter.increment();

    expect(counter.beginLive("creator-b")).toEqual({
      interactionCount: 0,
      startedAt: 30,
      liveKey: "creator-b",
    });
  });

  it("resets manually while retaining the current live identity", () => {
    const times = [10, 20, 30];
    const counter = new SessionCounter(() => times.shift() ?? 99);
    counter.beginLive("creator");
    counter.increment();

    expect(counter.reset()).toEqual({
      interactionCount: 0,
      startedAt: 30,
      liveKey: "creator",
    });
  });

  it("returns snapshots that cannot mutate internal state", () => {
    const counter = new SessionCounter(() => 10);
    const snapshot = counter.getState();
    snapshot.interactionCount = 50;
    snapshot.liveKey = "tampered";

    expect(counter.getState()).toEqual({
      interactionCount: 0,
      startedAt: 10,
      liveKey: null,
    });
  });
});
