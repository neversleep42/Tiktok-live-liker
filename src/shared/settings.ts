import {
  DEFAULT_SETTINGS,
  MAX_HOLD_INTERVAL_MS,
  MIN_HOLD_INTERVAL_MS,
  STORAGE_KEYS,
} from "./constants";
import type { ExtensionSettings } from "./types";

export function normalizeSettings(value: unknown): ExtensionSettings {
  if (!value || typeof value !== "object") {
    return { ...DEFAULT_SETTINGS };
  }

  const candidate = value as Partial<ExtensionSettings>;

  return {
    enabled:
      typeof candidate.enabled === "boolean"
        ? candidate.enabled
        : DEFAULT_SETTINGS.enabled,
    simulationMode:
      typeof candidate.simulationMode === "boolean"
        ? candidate.simulationMode
        : DEFAULT_SETTINGS.simulationMode,
    holdIntervalMs: normalizeInterval(candidate.holdIntervalMs),
  };
}

function normalizeInterval(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_SETTINGS.holdIntervalMs;
  }
  const rounded = Math.round(value);
  return Math.min(
    MAX_HOLD_INTERVAL_MS,
    Math.max(MIN_HOLD_INTERVAL_MS, rounded),
  );
}

export async function getSettings(): Promise<ExtensionSettings> {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.settings);
  return normalizeSettings(stored[STORAGE_KEYS.settings]);
}

export async function setSettings(
  patch: Partial<ExtensionSettings>,
): Promise<ExtensionSettings> {
  const current = await getSettings();
  const next = normalizeSettings({ ...current, ...patch });
  await chrome.storage.local.set({ [STORAGE_KEYS.settings]: next });
  return next;
}
