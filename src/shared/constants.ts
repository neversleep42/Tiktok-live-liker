import type { ExtensionSettings } from "./types";

export const STORAGE_KEYS = {
  settings: "settings",
} as const;

export const DEFAULT_SETTINGS: ExtensionSettings = {
  enabled: true,
  simulationMode: true,
};

export const HOLD_INTERVAL_MS = 350;
export const LIVE_RECHECK_DEBOUNCE_MS = 120;
export const URL_RECHECK_INTERVAL_MS = 1_000;
export const SHORTCUT_CODE = "KeyL";

export const LIVE_LIKE_TARGET_SELECTORS = [
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
