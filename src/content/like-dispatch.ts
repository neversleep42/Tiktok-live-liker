import {
  PAGE_LIKE_POINT_ATTRIBUTE,
  PAGE_LIKE_REQUEST_ATTRIBUTE,
  PAGE_LIKE_REQUEST_EVENT,
  PAGE_LIKE_RESULT_ATTRIBUTE,
  PAGE_LIKE_RESULT_EVENT,
  PAGE_LIKE_TARGET_ATTRIBUTE,
} from "../shared/constants";

export interface LikePoint { x: number; y: number }

let dispatchSequence = 0;

export function requiresDoubleClick(target: HTMLElement): boolean {
  return !target.matches(
    "button, [role='button'], [data-e2e='room-chat-like-btn'], [data-e2e='live-like-button'], [data-e2e='live-room-like']",
  );
}

export function resolveLikePoint(
  target: HTMLElement,
  point?: LikePoint | null,
): LikePoint {
  const rect = target.getBoundingClientRect();
  if (
    point &&
    point.x >= rect.left && point.x <= rect.right &&
    point.y >= rect.top && point.y <= rect.bottom &&
    point.x >= 0 && point.x < window.innerWidth &&
    point.y >= 0 && point.y < window.innerHeight
  ) {
    return point;
  }
  return {
    x: (Math.max(0, rect.left) + Math.min(window.innerWidth, rect.right)) / 2,
    y: (Math.max(0, rect.top) + Math.min(window.innerHeight, rect.bottom)) / 2,
  };
}

// Un bouton attend un clic ; la zone vidéo reçoit un double-clic.
// Ces événements restent synthétiques : leur réception n'est pas une
// confirmation de like côté TikTok.
export function dispatchLike(target: HTMLElement, point?: LikePoint | null): void {
  const singleClickTarget = !requiresDoubleClick(target);
  const aim = resolveLikePoint(target, point);
  const base = { bubbles: true, cancelable: true, composed: true,
    clientX: aim.x, clientY: aim.y, button: 0 };
  const clickCycle = (detail: number) => {
    const down = { ...base, detail, buttons: 1 };
    const up = { ...base, detail, buttons: 0 };
    if (typeof PointerEvent !== "undefined") {
      try {
        target.dispatchEvent(new PointerEvent("pointerdown", {
          ...down, pointerId: 1, pointerType: "mouse", isPrimary: true,
        }));
      } catch {
        // MouseEvent reste disponible si PointerEvent n'est pas constructible.
      }
    }
    target.dispatchEvent(new MouseEvent("mousedown", down));
    if (typeof PointerEvent !== "undefined") {
      try {
        target.dispatchEvent(new PointerEvent("pointerup", {
          ...up, pointerId: 1, pointerType: "mouse", isPrimary: true,
        }));
      } catch {
        // Continuer avec la souris.
      }
    }
    target.dispatchEvent(new MouseEvent("mouseup", up));
    if (singleClickTarget) target.click();
    else target.dispatchEvent(new MouseEvent("click", up));
  };
  clickCycle(1);
  if (!singleClickTarget) {
    clickCycle(2);
    target.dispatchEvent(new MouseEvent("dblclick", { ...base, buttons: 0, detail: 2 }));
  }
}

/**
 * Demande au script exécuté dans le monde JavaScript de TikTok d'envoyer le
 * clic. L'accusé de réception est synchrone : le compteur n'avance pas si le
 * pont est présent mais n'a pas pu retrouver ou actionner la cible.
 *
 * Le repli isolé conserve le fonctionnement dans les tests et sur un ancien
 * build où le nouveau script MAIN n'aurait pas encore été chargé.
 */
export function dispatchLikeThroughPage(
  target: HTMLElement,
  point?: LikePoint | null,
): boolean {
  const root = document.documentElement;
  if (!root || !target.isConnected) return false;

  dispatchSequence += 1;
  const requestId = `${Date.now().toString(36)}-${dispatchSequence.toString(36)}`;
  let received = false;
  let accepted = false;

  const handleResult = (): void => {
    const result = root.getAttribute(PAGE_LIKE_RESULT_ATTRIBUTE);
    if (!result?.startsWith(`${requestId}:`)) return;
    received = true;
    accepted = result === `${requestId}:ok`;
  };

  target.setAttribute(PAGE_LIKE_TARGET_ATTRIBUTE, requestId);
  root.setAttribute(PAGE_LIKE_REQUEST_ATTRIBUTE, requestId);
  if (point) {
    root.setAttribute(PAGE_LIKE_POINT_ATTRIBUTE, `${point.x},${point.y}`);
  } else {
    root.removeAttribute(PAGE_LIKE_POINT_ATTRIBUTE);
  }
  window.addEventListener(PAGE_LIKE_RESULT_EVENT, handleResult);

  try {
    window.dispatchEvent(new Event(PAGE_LIKE_REQUEST_EVENT));
  } finally {
    window.removeEventListener(PAGE_LIKE_RESULT_EVENT, handleResult);
    target.removeAttribute(PAGE_LIKE_TARGET_ATTRIBUTE);
    root.removeAttribute(PAGE_LIKE_REQUEST_ATTRIBUTE);
    root.removeAttribute(PAGE_LIKE_POINT_ATTRIBUTE);
    root.removeAttribute(PAGE_LIKE_RESULT_ATTRIBUTE);
  }

  if (received) return accepted;
  dispatchLike(target, point);
  return true;
}
