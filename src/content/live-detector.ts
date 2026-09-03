import {
  LIKE_TARGET_SELECTORS,
  LIVE_CONTAINER_SELECTORS,
  LIVE_DOM_SELECTORS,
  LIVE_PLAYER_SELECTORS,
  LIVE_RECHECK_DEBOUNCE_MS,
  URL_RECHECK_INTERVAL_MS,
} from "../shared/constants";

export type TargetState = "READY" | "MISSING" | "AMBIGUOUS";

export interface LiveSnapshot {
  liveDetected: boolean;
  liveKey: string | null;
  target: HTMLElement | null;
  targetState: TargetState;
}

const LIVE_PATH_PATTERN = /^\/@([^/]+)\/live\/?$/i;
const RELEVANT_SELECTOR = [
  ...LIVE_DOM_SELECTORS,
  ...LIKE_TARGET_SELECTORS,
].join(", ");

export function getLiveKey(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== "www.tiktok.com") return null;
    const match = parsed.pathname.match(LIVE_PATH_PATTERN);
    return match ? decodeURIComponent(match[1]).toLowerCase() : null;
  } catch {
    return null;
  }
}

export function isTikTokLiveUrl(url: string): boolean {
  return getLiveKey(url) !== null;
}

export function hasLiveDomEvidence(root: ParentNode = document): boolean {
  return findLiveScope(root) !== null;
}

export function findLiveScope(root: ParentNode = document): Element | null {
  const findUnique = (selectors: readonly string[]): Element | null => {
    const selector = selectors.join(", ");
    const matches = [
      ...(root instanceof Element && root.matches(selector) ? [root] : []),
      ...root.querySelectorAll(selector),
    ];
    const outermost = matches.filter(
      (candidate) =>
        !matches.some(
          (other) => other !== candidate && other.contains(candidate),
        ),
    );
    return outermost.length === 1 ? outermost[0] : null;
  };

  const container = findUnique(LIVE_CONTAINER_SELECTORS);
  return container ?? findUnique(LIVE_PLAYER_SELECTORS);
}

function toInteractiveElement(element: Element): HTMLElement | null {
  const interactive = element.matches("button, [role='button']")
    ? element
    : element.closest("button, [role='button']");
  return interactive instanceof HTMLElement ? interactive : null;
}

export function isValidInteractionTarget(element: HTMLElement): boolean {
  if (!element.isConnected) return false;
  if (element.matches(":disabled, [aria-disabled='true'], [hidden]")) return false;
  if (element.closest("[hidden], [inert], [aria-hidden='true']")) return false;

  for (let current: HTMLElement | null = element; current; current = current.parentElement) {
    const style = window.getComputedStyle(current);
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      style.pointerEvents === "none" ||
      style.opacity === "0"
    ) {
      return false;
    }
  }

  const checkVisibility = (
    element as HTMLElement & {
      checkVisibility?: (options?: {
        checkOpacity?: boolean;
        checkVisibilityCSS?: boolean;
      }) => boolean;
    }
  ).checkVisibility;

  if (typeof checkVisibility === "function") {
    if (
      !checkVisibility.call(element, {
        checkOpacity: true,
        checkVisibilityCSS: true,
      })
    ) {
      return false;
    }

    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    if (
      rect.right <= 0 ||
      rect.bottom <= 0 ||
      rect.left >= window.innerWidth ||
      rect.top >= window.innerHeight
    ) {
      return false;
    }

    if (typeof document.elementFromPoint === "function") {
      const hit = document.elementFromPoint(
        rect.left + rect.width / 2,
        rect.top + rect.height / 2,
      );
      if (hit && hit !== element && !element.contains(hit)) return false;
    }
  }

  return true;
}

export function resolveLikeTarget(
  root: ParentNode = document,
): { target: HTMLElement | null; state: TargetState } {
  const candidates = new Set<HTMLElement>();

  const collect = (searchRoot: ParentNode, selectors: readonly string[]) => {
    for (const match of searchRoot.querySelectorAll(selectors.join(", "))) {
      const candidate = toInteractiveElement(match);
      if (candidate && isValidInteractionTarget(candidate)) {
        candidates.add(candidate);
      }
    }
  };

  const liveScope = findLiveScope(root);
  if (!liveScope) return { target: null, state: "MISSING" };
  collect(liveScope, LIKE_TARGET_SELECTORS);

  if (candidates.size === 1) {
    return { target: [...candidates][0], state: "READY" };
  }

  return {
    target: null,
    state: candidates.size > 1 ? "AMBIGUOUS" : "MISSING",
  };
}

export function readLiveSnapshot(
  url = window.location.href,
  root: ParentNode = document,
): LiveSnapshot {
  const liveKey = getLiveKey(url);
  if (!liveKey) {
    return {
      liveDetected: false,
      liveKey: null,
      target: null,
      targetState: "MISSING",
    };
  }

  if (!hasLiveDomEvidence(root)) {
    return {
      liveDetected: false,
      liveKey,
      target: null,
      targetState: "MISSING",
    };
  }

  const target = resolveLikeTarget(root);
  return {
    liveDetected: true,
    liveKey,
    target: target.target,
    targetState: target.state,
  };
}

export class LiveDetector {
  private observer: MutationObserver | null = null;
  private debounceTimer: number | null = null;
  private urlTimer: number | null = null;
  private lastSnapshot: LiveSnapshot | null = null;
  private lastLiveScope: Element | null = null;
  private lastUrl = "";
  private readonly navigation = (
    window as Window & { navigation?: EventTarget }
  ).navigation;

  constructor(private readonly onChange: (snapshot: LiveSnapshot) => void) {}

  isLivePage(): boolean {
    return isTikTokLiveUrl(window.location.href);
  }

  start(): void {
    if (this.observer) return;

    this.lastUrl = window.location.href;
    this.evaluate();

    this.observer = new MutationObserver(this.handleMutations);
    this.observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: [
        "aria-disabled",
        "aria-hidden",
        "aria-label",
        "class",
        "data-e2e",
        "disabled",
        "hidden",
        "inert",
        "role",
        "style",
      ],
    });

    window.addEventListener("popstate", this.handleNavigation);
    window.addEventListener("hashchange", this.handleNavigation);
    this.navigation?.addEventListener("navigatesuccess", this.handleNavigation);
    this.urlTimer = window.setInterval(() => {
      if (window.location.href !== this.lastUrl) {
        this.lastUrl = window.location.href;
        this.evaluate();
      }
    }, URL_RECHECK_INTERVAL_MS);
  }

  stop(): void {
    this.observer?.disconnect();
    this.observer = null;

    if (this.debounceTimer !== null) {
      window.clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.urlTimer !== null) {
      window.clearInterval(this.urlTimer);
      this.urlTimer = null;
    }

    window.removeEventListener("popstate", this.handleNavigation);
    window.removeEventListener("hashchange", this.handleNavigation);
    this.navigation?.removeEventListener("navigatesuccess", this.handleNavigation);
  }

  private readonly handleMutations = (records: MutationRecord[]): void => {
    if (!records.some((record) => this.isRelevantMutation(record))) return;

    if (
      this.lastSnapshot?.target &&
      !isValidInteractionTarget(this.lastSnapshot.target)
    ) {
      if (this.debounceTimer !== null) {
        window.clearTimeout(this.debounceTimer);
        this.debounceTimer = null;
      }
      this.evaluate();
      return;
    }

    if (this.debounceTimer !== null) return;
    this.debounceTimer = window.setTimeout(() => {
      this.debounceTimer = null;
      this.evaluate();
    }, LIVE_RECHECK_DEBOUNCE_MS);
  };

  private isRelevantMutation(record: MutationRecord): boolean {
    const target = this.lastSnapshot?.target;
    const mutationTarget =
      record.target instanceof Element ? record.target : record.target.parentElement;

    if (record.type === "attributes" && mutationTarget) {
      if (
        mutationTarget === target ||
        (target &&
          (mutationTarget.contains(target) || target.contains(mutationTarget))) ||
        mutationTarget === this.lastLiveScope ||
        (this.lastLiveScope && mutationTarget.contains(this.lastLiveScope))
      ) {
        return true;
      }
      return mutationTarget.matches(RELEVANT_SELECTOR);
    }

    const changedNodes = [...record.addedNodes, ...record.removedNodes];
    return changedNodes.some((node) => {
      if (!(node instanceof Element)) return false;
      if (
        node === target ||
        (target && node.contains(target)) ||
        node === this.lastLiveScope ||
        (this.lastLiveScope && node.contains(this.lastLiveScope))
      ) {
        return true;
      }
      return node.matches(RELEVANT_SELECTOR) || Boolean(node.querySelector(RELEVANT_SELECTOR));
    });
  }

  private readonly handleNavigation = (): void => {
    this.lastUrl = window.location.href;
    this.evaluate();
  };

  private evaluate(): void {
    const next = readLiveSnapshot();
    this.lastLiveScope = findLiveScope();
    const previous = this.lastSnapshot;
    this.lastSnapshot = next;

    if (
      !previous ||
      previous.liveDetected !== next.liveDetected ||
      previous.liveKey !== next.liveKey ||
      previous.target !== next.target ||
      previous.targetState !== next.targetState
    ) {
      this.onChange(next);
    }
  }
}
