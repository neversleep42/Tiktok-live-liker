import {
  PAGE_LIKE_POINT_ATTRIBUTE,
  PAGE_LIKE_REQUEST_ATTRIBUTE,
  PAGE_LIKE_REQUEST_EVENT,
  PAGE_LIKE_RESULT_ATTRIBUTE,
  PAGE_LIKE_RESULT_EVENT,
  PAGE_LIKE_TARGET_ATTRIBUTE,
} from "../shared/constants";
import { dispatchLike, type LikePoint } from "./like-dispatch";

function readPoint(root: HTMLElement): LikePoint | null {
  const raw = root.getAttribute(PAGE_LIKE_POINT_ATTRIBUTE);
  if (!raw) return null;
  const [x, y] = raw.split(",").map(Number);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

/** Installe le côté MAIN du pont sans dépendre des API chrome. */
export function installPageLikeBridge(): () => void {
  const handleRequest = (): void => {
    const root = document.documentElement;
    const requestId = root?.getAttribute(PAGE_LIKE_REQUEST_ATTRIBUTE);
    if (!root || !requestId) return;

    const target = [...document.querySelectorAll<HTMLElement>(
      `[${PAGE_LIKE_TARGET_ATTRIBUTE}]`,
    )].find(
      (candidate) =>
        candidate.getAttribute(PAGE_LIKE_TARGET_ATTRIBUTE) === requestId,
    );

    let accepted = false;
    if (target?.isConnected) {
      try {
        dispatchLike(target, readPoint(root));
        accepted = true;
      } catch {
        accepted = false;
      }
    }

    root.setAttribute(
      PAGE_LIKE_RESULT_ATTRIBUTE,
      `${requestId}:${accepted ? "ok" : "failed"}`,
    );
    window.dispatchEvent(new Event(PAGE_LIKE_RESULT_EVENT));
  };

  window.addEventListener(PAGE_LIKE_REQUEST_EVENT, handleRequest);
  return () => window.removeEventListener(PAGE_LIKE_REQUEST_EVENT, handleRequest);
}
