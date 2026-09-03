// @vitest-environment-options { "url": "https://www.tiktok.com/" }

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LiveDetector, type LiveSnapshot } from "../src/content/live-detector";
import {
  LIVE_RECHECK_DEBOUNCE_MS,
  URL_RECHECK_INTERVAL_MS,
} from "../src/shared/constants";

const activeDetectors: LiveDetector[] = [];

function startDetector(onChange = vi.fn<(snapshot: LiveSnapshot) => void>()) {
  const detector = new LiveDetector(onChange);
  activeDetectors.push(detector);
  detector.start();
  return { detector, onChange };
}

async function flushMutationObservers(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("LiveDetector observation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.history.replaceState({}, "", "/@creator/live");
    document.body.replaceChildren();
  });

  afterEach(() => {
    for (const detector of activeDetectors.splice(0)) detector.stop();
    document.body.replaceChildren();
    vi.useRealTimers();
  });

  it("ignores continuous irrelevant mutations without callbacks or visibility work", async () => {
    document.body.innerHTML = `
      <main data-e2e="live-room">
        <button data-e2e="live-like-button"></button>
      </main>
      <section id="unrelated-feed"></section>
    `;
    const getComputedStyle = vi.spyOn(window, "getComputedStyle");
    const { onChange } = startDetector();
    const visibilityChecksAfterStart = getComputedStyle.mock.calls.length;
    const feed = document.querySelector("#unrelated-feed") as HTMLElement;

    for (let index = 0; index < 5; index += 1) {
      const item = document.createElement("span");
      item.textContent = `unrelated ${index}`;
      feed.append(item);
      await flushMutationObservers();
      vi.advanceTimersByTime(LIVE_RECHECK_DEBOUNCE_MS);
    }

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(getComputedStyle).toHaveBeenCalledTimes(visibilityChecksAfterStart);
  });

  it("re-evaluates when a like target is added and removed", async () => {
    document.body.innerHTML = '<main data-e2e="live-room"></main>';
    const liveRoot = document.querySelector("main") as HTMLElement;
    const { onChange } = startDetector();

    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        liveDetected: true,
        liveKey: "creator",
        target: null,
        targetState: "MISSING",
      }),
    );

    const button = document.createElement("button");
    button.dataset.e2e = "live-like-button";
    liveRoot.append(button);
    await flushMutationObservers();
    vi.advanceTimersByTime(LIVE_RECHECK_DEBOUNCE_MS);

    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        liveDetected: true,
        liveKey: "creator",
        target: button,
        targetState: "READY",
      }),
    );

    button.remove();
    await flushMutationObservers();

    expect(onChange).toHaveBeenCalledTimes(3);
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        liveDetected: true,
        liveKey: "creator",
        target: null,
        targetState: "MISSING",
      }),
    );
  });

  it("re-evaluates when an SPA navigation changes the LIVE URL", () => {
    document.body.innerHTML = `
      <main data-e2e="live-room">
        <button data-e2e="live-like-button"></button>
      </main>
    `;
    const { onChange } = startDetector();

    window.history.pushState({}, "", "/@another-creator/live");
    vi.advanceTimersByTime(URL_RECHECK_INTERVAL_MS);

    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        liveDetected: true,
        liveKey: "another-creator",
        targetState: "READY",
      }),
    );
  });

  it("retains the route live key while LIVE DOM evidence is transiently absent", async () => {
    document.body.innerHTML = `
      <main data-e2e="live-room">
        <button data-e2e="live-like-button"></button>
      </main>
    `;
    const liveRoot = document.querySelector("main") as HTMLElement;
    const { onChange } = startDetector();

    liveRoot.remove();
    await flushMutationObservers();

    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenLastCalledWith({
      liveDetected: false,
      liveKey: "creator",
      target: null,
      targetState: "MISSING",
    });

    document.body.append(liveRoot);
    await flushMutationObservers();
    vi.advanceTimersByTime(LIVE_RECHECK_DEBOUNCE_MS);

    expect(onChange).toHaveBeenCalledTimes(3);
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        liveDetected: true,
        liveKey: "creator",
        targetState: "READY",
      }),
    );
  });
});
