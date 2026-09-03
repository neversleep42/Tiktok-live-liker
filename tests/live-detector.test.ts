import { afterEach, describe, expect, it } from "vitest";

import {
  getLiveKey,
  isTikTokLiveUrl,
  isValidInteractionTarget,
  readLiveSnapshot,
  resolveLikeTarget,
} from "../src/content/live-detector";

describe("TikTok LIVE URL resolution", () => {
  it.each([
    ["https://www.tiktok.com/@Creator/live", "creator"],
    ["https://www.tiktok.com/@Creator/live/", "creator"],
    ["https://www.tiktok.com/@Creator/live?lang=en#player", "creator"],
    ["https://WWW.TIKTOK.COM/@%C3%89lodie/live", "élodie"],
  ])("extracts a normalized live key from %s", (url, expected) => {
    expect(getLiveKey(url)).toBe(expected);
    expect(isTikTokLiveUrl(url)).toBe(true);
  });

  it.each([
    "https://www.tiktok.com/@creator",
    "https://www.tiktok.com/live",
    "https://www.tiktok.com/@creator/live/replay",
    "https://tiktok.com/@creator/live",
    "https://m.tiktok.com/@creator/live",
    "https://www.tiktok.com.evil.example/@creator/live",
    "not a url",
    "https://www.tiktok.com/@%E0%A4%A/live",
  ])("rejects unsupported or malformed URL %s", (url) => {
    expect(getLiveKey(url)).toBeNull();
    expect(isTikTokLiveUrl(url)).toBe(false);
  });
});

describe("like target resolution", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it("resolves one connected, visible, enabled button", () => {
    document.body.innerHTML = `
      <main data-e2e="live-room">
        <button data-e2e="live-like-button" aria-label="Like"></button>
      </main>
    `;
    const button = document.querySelector("button");

    expect(resolveLikeTarget()).toEqual({ target: button, state: "READY" });
    expect(isValidInteractionTarget(button as HTMLElement)).toBe(true);
  });

  it("promotes a matching icon to its interactive ancestor", () => {
    document.body.innerHTML = `
      <main data-e2e="live-room">
        <button id="like-button"><span data-e2e="like-icon"></span></button>
      </main>
    `;

    expect(resolveLikeTarget()).toEqual({
      target: document.querySelector("#like-button"),
      state: "READY",
    });
  });

  it("deduplicates a button matched by more than one selector", () => {
    document.body.innerHTML = `
      <main data-e2e="live-room">
        <button data-e2e="live-like-button" aria-label="Like"></button>
      </main>
    `;

    expect(resolveLikeTarget().state).toBe("READY");
  });

  it("fails closed when more than one valid target is present", () => {
    document.body.innerHTML = `
      <main data-e2e="live-room">
        <button data-e2e="live-like-button"></button>
        <div role="button" aria-label="Like"></div>
      </main>
    `;

    expect(resolveLikeTarget()).toEqual({
      target: null,
      state: "AMBIGUOUS",
    });
  });

  it.each([
    '<button data-e2e="live-like-button" disabled></button>',
    '<button data-e2e="live-like-button" aria-disabled="true"></button>',
    '<button data-e2e="live-like-button" hidden></button>',
    '<button data-e2e="live-like-button" style="display:none"></button>',
    '<button data-e2e="live-like-button" style="visibility:hidden"></button>',
    '<button data-e2e="live-like-button" style="pointer-events:none"></button>',
  ])("ignores an unavailable candidate: %s", (markup) => {
    document.body.innerHTML = `<main data-e2e="live-room">${markup}</main>`;

    expect(resolveLikeTarget()).toEqual({ target: null, state: "MISSING" });
  });

  it("rejects a target after it is detached", () => {
    const liveRoot = document.createElement("main");
    liveRoot.dataset.e2e = "live-room";
    const button = document.createElement("button");
    button.dataset.e2e = "live-like-button";
    liveRoot.append(button);
    document.body.append(liveRoot);
    expect(isValidInteractionTarget(button)).toBe(true);

    button.remove();

    expect(isValidInteractionTarget(button)).toBe(false);
  });

  it("rejects a target hidden by an ancestor", () => {
    document.body.innerHTML = `
      <main data-e2e="live-room">
        <div style="display: none">
          <button data-e2e="live-like-button"></button>
        </div>
      </main>
    `;

    expect(resolveLikeTarget()).toEqual({ target: null, state: "MISSING" });
  });

  it.each([
    ["hidden", "hidden"],
    ["inert", "inert"],
    ['aria-hidden="true"', "aria-hidden"],
  ])("rejects a target inside an ancestor with %s", (attribute) => {
    document.body.innerHTML = `
      <main data-e2e="live-room">
        <div ${attribute}>
          <button data-e2e="live-like-button"></button>
        </div>
      </main>
    `;
    const button = document.querySelector("button") as HTMLElement;

    expect(isValidInteractionTarget(button)).toBe(false);
  });

  it("does not accept a generic like control outside the LIVE root", () => {
    document.body.innerHTML = `
      <main data-e2e="live-room"><video></video></main>
      <button aria-label="Like"></button>
    `;

    expect(resolveLikeTarget()).toEqual({ target: null, state: "MISSING" });
  });

  it("fails closed when two disjoint LIVE roots exist", () => {
    document.body.innerHTML = `
      <main data-e2e="live-room"><button aria-label="Like"></button></main>
      <aside data-e2e="live-room"><button aria-label="Like"></button></aside>
    `;

    expect(resolveLikeTarget()).toEqual({ target: null, state: "MISSING" });
  });
});

describe("live snapshots", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it("does not search for a target outside a supported LIVE URL", () => {
    document.body.innerHTML = '<button data-e2e="live-like-button"></button>';

    expect(readLiveSnapshot("https://www.tiktok.com/@creator")).toEqual({
      liveDetected: false,
      liveKey: null,
      target: null,
      targetState: "MISSING",
    });
  });

  it("does not report a LIVE from the route without matching DOM evidence", () => {
    expect(
      readLiveSnapshot("https://www.tiktok.com/@creator/live"),
    ).toEqual({
      liveDetected: false,
      liveKey: "creator",
      target: null,
      targetState: "MISSING",
    });
  });

  it("accepts a live player root as positive DOM evidence", () => {
    document.body.innerHTML = '<main><video data-e2e="live-video"></video></main>';

    expect(
      readLiveSnapshot("https://www.tiktok.com/@creator/live"),
    ).toMatchObject({
      liveDetected: true,
      liveKey: "creator",
      target: null,
      targetState: "MISSING",
    });
  });

  it("distinguishes a detected LIVE whose target is ambiguous", () => {
    document.body.innerHTML = `
      <main data-e2e="live-room">
        <button data-e2e="live-like-button"></button>
        <button aria-label="Like"></button>
      </main>
    `;

    expect(
      readLiveSnapshot("https://www.tiktok.com/@Creator/live"),
    ).toMatchObject({
      liveDetected: true,
      liveKey: "creator",
      target: null,
      targetState: "AMBIGUOUS",
    });
  });
});
