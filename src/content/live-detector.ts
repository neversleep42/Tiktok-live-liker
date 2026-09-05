import {
  DOM_LIVE_KEY,
  GENERIC_LIKE_TARGET_SELECTORS,
  LIKE_TARGET_SELECTORS,
  LIVE_CONTAINER_SELECTORS,
  LIVE_DOM_SELECTORS,
  LIVE_LIKE_TARGET_SELECTORS,
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

// Zones à ne JAMAIS cliquer : avatars, profils, follows, invités, liens
// vers un compte. En layout audio le LIVE n'est qu'une grille de tuiles ;
// cliquer une tuile likerait la créatrice / l'invité au lieu du LIVE.
export const EXCLUDED_LIKE_ANCESTORS = [
  '[data-e2e*="avatar"]',
  '[data-e2e*="follow"]',
  '[data-e2e*="profile"]',
  '[data-e2e*="guest"]',
  '[data-e2e*="member"]',
  '[data-e2e*="user"]',
  '[data-e2e*="anchor"]',
  '[data-e2e*="host"]',
  'a[href^="/@"]',
] as const;

const EXCLUDED_SELECTOR = EXCLUDED_LIKE_ANCESTORS.join(", ");

export function isExcludedTarget(element: Element): boolean {
  try {
    return (
      (typeof element.matches === "function" &&
        element.matches(EXCLUDED_SELECTOR)) ||
      (typeof element.closest === "function" &&
        element.closest(EXCLUDED_SELECTOR) !== null)
    );
  } catch {
    return false;
  }
}
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

// Racine du LIVE comme cible de repli insensible au layout : le
// double-clic remonte jusqu'au handler TikTok quelle que soit la
// disposition (vidéo plein écran, audio + grille d'invités, etc.).
export function resolveLiveRoomRoot(
  root: ParentNode = document,
): HTMLElement | null {
  const scope = findLiveScope(root);
  return scope instanceof HTMLElement && isVisibleElement(scope)
    ? scope
    : null;
}

// Cible réelle d'un like de LIVE sur PC : il n'y a PAS de bouton cœur
// dédié sur TikTok web (double-clic sur la vidéo = 1 like). On vise donc
// le player / la vidéo du LIVE, jamais un bouton générique qui likerait
// la créatrice ou un commentaire.
// la créatrice ou un commentaire.
export function resolveLivePlayer(
  root: ParentNode = document,
): HTMLElement | null {
  const scope = findLiveScope(root);
  const searchRoots: ParentNode[] = scope ? [scope] : [root];
  for (const searchRoot of searchRoots) {
    const matches = searchRoot.querySelectorAll(
      [...LIVE_PLAYER_SELECTORS, "video"].join(", "),
    );
    for (const match of matches) {
      if (match instanceof HTMLElement && isVisibleElement(match)) {
        return match;
      }
    }
  }
  return null;
}

// Visibilité sans test d'occlusion : la vidéo du LIVE est toujours
// recouverte par l'interface TikTok (overlays), donc elementFromPoint ne
// la retourne jamais. Le double-clic se dispatche directement sur elle.
export function isVisibleElement(element: HTMLElement): boolean {
  if (!element.isConnected) return false;
  if (element.matches(":disabled, [aria-disabled='true'], [hidden]")) {
    return false;
  }
  if (element.closest("[hidden], [inert], [aria-hidden='true']")) {
    return false;
  }

  for (
    let current: HTMLElement | null = element;
    current;
    current = current.parentElement
  ) {
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

  return true;
}

function toInteractiveElement(element: Element): HTMLElement | null {
  // Jamais un avatar / profil / follow : likerait la personne, pas le LIVE.
  if (isExcludedTarget(element)) return null;
  const interactive = element.matches("button, [role='button']")
    ? element
    : element.closest("button, [role='button']");
  if (!(interactive instanceof HTMLElement)) return null;
  return isExcludedTarget(interactive) ? null : interactive;
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
  const collect = (
    searchRoot: ParentNode,
    selectors: readonly string[],
  ): Set<HTMLElement> => {
    const candidates = new Set<HTMLElement>();
    for (const match of searchRoot.querySelectorAll(selectors.join(", "))) {
      const candidate = toInteractiveElement(match);
      if (candidate && isValidInteractionTarget(candidate)) {
        candidates.add(candidate);
      }
    }
    return candidates;
  };

  const liveScope = findLiveScope(root);
  if (!liveScope) return { target: null, state: "MISSING" };

  // Niveau 1 — bouton dédié au LIVE uniquement. C'est lui qui fait monter
  // le compteur du LIVE affiché par TikTok. Les sélecteurs génériques
  // (likes de commentaires, profil créatrice, etc.) sont ignorés ici pour
  // ne jamais liker la créatrice à la place du LIVE.
  const liveCandidates = collect(liveScope, LIVE_LIKE_TARGET_SELECTORS);
  if (liveCandidates.size === 1) {
    return { target: [...liveCandidates][0], state: "READY" };
  }
  if (liveCandidates.size > 1) {
    return { target: null, state: "AMBIGUOUS" };
  }

  // Niveau 2 — repli générique : un seul candidat maximum, sinon on
  // refuse (AMBIGUOUS) plutôt que de cliquer au hasard.
  const genericCandidates = collect(liveScope, GENERIC_LIKE_TARGET_SELECTORS);
  if (genericCandidates.size === 1) {
    return { target: [...genericCandidates][0], state: "READY" };
  }

  return {
    target: null,
    state: genericCandidates.size > 1 ? "AMBIGUOUS" : "MISSING",
  };
}

export function readLiveSnapshot(
  url = window.location.href,
  root: ParentNode = document,
): LiveSnapshot {
  const urlKey = getLiveKey(url);
  const hasEvidence = hasLiveDomEvidence(root);

  // PRD §7/18/30 : le DOM prime. L'URL /@pseudo/live reste un indice,
  // mais un LIVE intégré (feed, overlay) avec preuve DOM est accepté
  // sans exiger l'URL exacte.
  if (!urlKey && !hasEvidence) {
    return {
      liveDetected: false,
      liveKey: null,
      target: null,
      targetState: "MISSING",
    };
  }

  if (urlKey && !hasEvidence) {
    return {
      liveDetected: false,
      liveKey: urlKey,
      target: null,
      targetState: "MISSING",
    };
  }

  const liveKey = urlKey ?? DOM_LIVE_KEY;
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
    return (
      isTikTokLiveUrl(window.location.href) || hasLiveDomEvidence(document)
    );
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
