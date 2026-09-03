import { DEFAULT_SETTINGS, STORAGE_KEYS } from "./constants";
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
  };
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
