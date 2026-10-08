import type { ExtensionSettings } from "./types";

export const STORAGE_KEYS = {
  settings: "settings",
} as const;

export const HOLD_INTERVAL_MS = 250;
export const MIN_HOLD_INTERVAL_MS = 100;
export const MAX_HOLD_INTERVAL_MS = 1500;
export const DOM_LIVE_KEY = "dom-live";

export const DEFAULT_SETTINGS: ExtensionSettings = {
  interactionMode: "manual",
  enabled: true,
  simulationMode: true,
  holdIntervalMs: HOLD_INTERVAL_MS,
};
export const CADENCE_PRESETS = [
  { label: "Doux", ms: 650 },
  { label: "Normal", ms: 250 },
  { label: "Rapide", ms: 100 },
] as const;
export const LIVE_RECHECK_DEBOUNCE_MS = 120;
export const URL_RECHECK_INTERVAL_MS = 1_000;
export const SHORTCUT_CODE = "KeyL";

// Pont DOM entre le content script isolé et un second content script chargé
// dans le monde MAIN. Les attributs transportent uniquement un identifiant
// éphémère et des coordonnées, puis sont supprimés juste après l'envoi.
export const PAGE_LIKE_REQUEST_EVENT = "lla:page-like-request";
export const PAGE_LIKE_RESULT_EVENT = "lla:page-like-result";
export const PAGE_LIKE_REQUEST_ATTRIBUTE = "data-lla-like-request";
export const PAGE_LIKE_RESULT_ATTRIBUTE = "data-lla-like-result";
export const PAGE_LIKE_TARGET_ATTRIBUTE = "data-lla-like-target";
export const PAGE_LIKE_POINT_ATTRIBUTE = "data-lla-like-point";

export const LIVE_LIKE_TARGET_SELECTORS = [
  '[data-e2e="room-chat-like-btn"]',
  '[data-e2e="live-like-button"]',
  '[data-e2e="live-room-like"]',
] as const;

export const GENERIC_LIKE_TARGET_SELECTORS = [
  '[data-e2e="like-icon"]',
  'button[aria-label="Like"]',
  'button[aria-label="J’aime"]',
  'button[aria-label="J\'aime"]',
  '[role="button"][aria-label="Like"]',
  '[role="button"][aria-label="J’aime"]',
  '[role="button"][aria-label="J\'aime"]',
] as const;

export const LIKE_TARGET_SELECTORS = [
  ...LIVE_LIKE_TARGET_SELECTORS,
  ...GENERIC_LIKE_TARGET_SELECTORS,
] as const;

export const LIVE_CONTAINER_SELECTORS = [
  "#tiktok-live-main-container-id",
  '[data-e2e="live-room-content"]',
  '[data-e2e="live-room"]',
  '[data-e2e="live-room-page"]',
  '[data-e2e="live-room-container"]',
] as const;

export const LIVE_PLAYER_SELECTORS = [
  '[data-e2e="live-room-player"]',
  '[data-e2e="live-player"]',
  '[data-e2e="live-video"]',
] as const;

export const LIVE_DOM_SELECTORS = [
  ...LIVE_CONTAINER_SELECTORS,
  ...LIVE_PLAYER_SELECTORS,
] as const;
