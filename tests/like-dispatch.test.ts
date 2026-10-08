import { afterEach, describe, expect, it, vi } from "vitest";
import {
  dispatchLike,
  dispatchLikeThroughPage,
} from "../src/content/like-dispatch";
import { installPageLikeBridge } from "../src/content/page-like-bridge-core";

afterEach(() => document.body.replaceChildren());

describe("real like event dispatch", () => {
  it("clicks a button once instead of toggling it on and off", () => {
    const button = document.createElement("button");
    document.body.append(button);
    let liked = false;
    button.addEventListener("click", () => { liked = !liked; });
    const doubleClick = vi.fn();
    button.addEventListener("dblclick", doubleClick);
    dispatchLike(button);
    expect(liked).toBe(true);
    expect(doubleClick).not.toHaveBeenCalled();
  });

  it("clicks TikTok's current room chat like div exactly once", () => {
    const like = document.createElement("div");
    like.dataset.e2e = "room-chat-like-btn";
    document.body.append(like);
    const click = vi.fn();
    const doubleClick = vi.fn();
    like.addEventListener("click", click);
    like.addEventListener("dblclick", doubleClick);
    dispatchLike(like);
    expect(click).toHaveBeenCalledOnce();
    expect(doubleClick).not.toHaveBeenCalled();
  });

  it("delivers a double-click to a video and bubbles up to its wrapper", () => {
    document.body.innerHTML = '<div><video></video></div>';
    const video = document.querySelector("video")!;
    const handler = vi.fn();
    const wrapperHandler = vi.fn();
    video.addEventListener("dblclick", handler);
    video.parentElement!.addEventListener("dblclick", wrapperHandler);
    dispatchLike(video);
    expect(handler).toHaveBeenCalledOnce();
    expect(wrapperHandler).toHaveBeenCalledOnce();
    expect(handler.mock.lastCall![0]).toMatchObject({ target: video, detail: 2, buttons: 0, isTrusted: false });
  });

  it("releases mouse buttons before dispatching clicks", () => {
    const target = document.createElement("div");
    document.body.append(target);
    const sequence: Array<[string, number, number]> = [];
    for (const type of ["mousedown", "mouseup", "click", "dblclick"]) {
      target.addEventListener(type, (event) => {
        const mouse = event as MouseEvent;
        sequence.push([mouse.type, mouse.buttons, mouse.detail]);
      });
    }
    dispatchLike(target);
    expect(sequence).toEqual([
      ["mousedown", 1, 1], ["mouseup", 0, 1], ["click", 0, 1],
      ["mousedown", 1, 2], ["mouseup", 0, 2], ["click", 0, 2], ["dblclick", 0, 2],
    ]);
  });

  it("dispatches through the TikTok page-world bridge and cleans its markers", () => {
    const removeBridge = installPageLikeBridge();
    const like = document.createElement("div");
    like.dataset.e2e = "room-chat-like-btn";
    document.body.append(like);
    const click = vi.fn();
    like.addEventListener("click", click);

    expect(dispatchLikeThroughPage(like)).toBe(true);
    expect(click).toHaveBeenCalledOnce();
    expect(like.hasAttribute("data-lla-like-target")).toBe(false);
    expect(document.documentElement.hasAttribute("data-lla-like-request")).toBe(false);
    expect(document.documentElement.hasAttribute("data-lla-like-result")).toBe(false);
    removeBridge();
  });

  it("rejects a detached target", () => {
    expect(dispatchLikeThroughPage(document.createElement("div"))).toBe(false);
  });
});
