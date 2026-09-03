import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { DEFAULT_SETTINGS, STORAGE_KEYS } from "../shared/constants";
import { getSettings, normalizeSettings } from "../shared/settings";
import type {
  ExtensionMessage,
  ExtensionResponse,
  ExtensionSettings,
  RuntimeStatus,
  UiStatus,
} from "../shared/types";

const EMPTY_STATUS: RuntimeStatus = {
  enabled: true,
  liveDetected: false,
  interacting: false,
  simulationMode: true,
  interactionCount: 0,
  status: "NO_LIVE",
  error: null,
};

const STATUS_COPY: Record<UiStatus, { title: string; detail: string }> = {
  DISABLED: {
    title: "Extension désactivée",
    detail: "Activez-la pour retrouver les contrôles sur le LIVE.",
  },
  NO_LIVE: {
    title: "Aucun LIVE détecté",
    detail: "Ouvrez le LIVE d’un créateur dans cet onglet.",
  },
  TARGET_MISSING: {
    title: "LIVE détecté",
    detail: "Le contrôle de like TikTok n’est pas disponible.",
  },
  READY: {
    title: "TikTok LIVE prêt",
    detail: "Maintenez L ou utilisez le contrôle dans la page.",
  },
  ACTIVE: {
    title: "Interaction active",
    detail: "Relâchez la touche ou le bouton pour arrêter.",
  },
  SIMULATION: {
    title: "Simulation prête",
    detail: "Les interactions restent entièrement locales.",
  },
};

async function getActiveTabId(): Promise<number | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return typeof tab?.id === "number" ? tab.id : null;
}

async function requestTabStatus(tabId?: number | null): Promise<RuntimeStatus | null> {
  const resolvedTabId = tabId ?? (await getActiveTabId());
  if (resolvedTabId === null) return null;

  try {
    const response = (await chrome.tabs.sendMessage(resolvedTabId, {
      type: "GET_STATUS",
    } satisfies ExtensionMessage)) as ExtensionResponse;
    return response.ok && "status" in response ? response.status : null;
  } catch {
    return null;
  }
}

async function updateSettings(
  patch: Partial<ExtensionSettings>,
): Promise<ExtensionSettings> {
  const response = (await chrome.runtime.sendMessage({
    type: "SET_SETTINGS",
    patch,
  } satisfies ExtensionMessage)) as ExtensionResponse;

  if (!response.ok || !("settings" in response)) {
    throw new Error(response.ok ? "SETTINGS_RESPONSE_INVALID" : response.error);
  }
  return response.settings;
}

export function Popup() {
  const [settings, setLocalSettings] =
    useState<ExtensionSettings>(DEFAULT_SETTINGS);
  const [status, setStatus] = useState<RuntimeStatus>(EMPTY_STATUS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const activeTabId = useRef<number | null>(null);
  const statusEventVersion = useRef(0);
  const refreshVersion = useRef(0);

  const refresh = useCallback(async () => {
    const version = ++refreshVersion.current;
    const tabId = await getActiveTabId();
    activeTabId.current = tabId;
    const eventVersion = statusEventVersion.current;
    const [nextSettings, tabStatus] = await Promise.all([
      getSettings(),
      requestTabStatus(tabId),
    ]);
    if (version !== refreshVersion.current) return;
    setLocalSettings(nextSettings);
    if (eventVersion === statusEventVersion.current) {
      setStatus(
        tabStatus ?? {
          ...EMPTY_STATUS,
          enabled: nextSettings.enabled,
          simulationMode: nextSettings.simulationMode,
          status: nextSettings.enabled ? "NO_LIVE" : "DISABLED",
        },
      );
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();

    const listener = (
      message: ExtensionMessage,
      sender: chrome.runtime.MessageSender,
    ) => {
      if (
        message.type === "STATUS_CHANGED" &&
        sender.tab?.id === activeTabId.current
      ) {
        statusEventVersion.current += 1;
        setLocalSettings({
          enabled: message.status.enabled,
          simulationMode: message.status.simulationMode,
        });
        setStatus(message.status);
      }
    };
    const storageListener = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string,
    ) => {
      if (areaName === "local" && changes[STORAGE_KEYS.settings]) {
        setLocalSettings(
          normalizeSettings(changes[STORAGE_KEYS.settings].newValue),
        );
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    chrome.storage.onChanged.addListener(storageListener);
    return () => {
      chrome.runtime.onMessage.removeListener(listener);
      chrome.storage.onChanged.removeListener(storageListener);
    };
  }, [refresh]);

  const setSetting = async (patch: Partial<ExtensionSettings>) => {
    setSaving(true);
    setNotice(null);
    try {
      const next = await updateSettings(patch);
      setLocalSettings(next);
      const tabStatus = await requestTabStatus(activeTabId.current);
      if (tabStatus) {
        setStatus(tabStatus);
      } else {
        setStatus((current) => ({
          ...current,
          enabled: next.enabled,
          simulationMode: next.simulationMode,
          status: next.enabled ? "NO_LIVE" : "DISABLED",
        }));
      }
    } catch {
      setNotice("Impossible d’enregistrer ce réglage.");
    } finally {
      setSaving(false);
    }
  };

  const resetSession = async () => {
    const tabId = await getActiveTabId();
    if (tabId === null) return;
    try {
      await chrome.tabs.sendMessage(tabId, {
        type: "RESET_SESSION",
      } satisfies ExtensionMessage);
      setStatus((current) => ({ ...current, interactionCount: 0 }));
      setNotice("Compteur remis à zéro.");
    } catch {
      setNotice("Aucune session active dans cet onglet.");
    }
  };

  const copy = STATUS_COPY[status.status];
  const statusClass = `status-card status-card--${status.status.toLowerCase()}`;
  const formattedCount = useMemo(
    () => status.interactionCount.toLocaleString("fr-FR"),
    [status.interactionCount],
  );

  return (
    <main className={loading ? "popup popup--loading" : "popup"}>
      <header className="topbar">
        <div className="brand-mark" aria-hidden="true">
          L
        </div>
        <div className="brand-copy">
          <strong>LIVE Like</strong>
          <span>Assistant local</span>
        </div>
        <span className="version">v0.1</span>
      </header>

      <section className={statusClass} aria-live="polite">
        <div className="status-icon" aria-hidden="true">
          <span />
        </div>
        <div>
          <strong>{loading ? "Vérification…" : copy.title}</strong>
          <p>{loading ? "Lecture de l’onglet actif." : copy.detail}</p>
        </div>
      </section>

      <section className="counter" aria-label="Compteur de session">
        <div>
          <span>Interactions envoyées</span>
          <strong>{formattedCount}</strong>
        </div>
        <button type="button" onClick={() => void resetSession()}>
          Réinitialiser
        </button>
      </section>

      <section className="settings" aria-label="Réglages">
        <label className="setting-row">
          <span>
            <strong>Extension</strong>
            <small>Affiche les contrôles sur TikTok LIVE</small>
          </span>
          <input
            type="checkbox"
            checked={settings.enabled}
            disabled={saving}
            onChange={(event) =>
              void setSetting({ enabled: event.currentTarget.checked })
            }
          />
          <i aria-hidden="true" />
        </label>

        <label className="setting-row">
          <span>
            <strong>Mode simulation</strong>
            <small>Aucune interaction TikTok réelle</small>
          </span>
          <input
            type="checkbox"
            checked={settings.simulationMode}
            disabled={saving || !settings.enabled}
            onChange={(event) =>
              void setSetting({
                simulationMode: event.currentTarget.checked,
              })
            }
          />
          <i aria-hidden="true" />
        </label>
      </section>

      {!settings.simulationMode && settings.enabled ? (
        <p className="real-mode-note">
          Le mode réel déclenche l’interface visible de TikTok. L’envoi est
          expérimental et ne peut pas être confirmé par l’extension.
        </p>
      ) : null}

      {notice ? <p className="notice">{notice}</p> : null}

      <footer>
        <kbd>L</kbd>
        <span>Maintenir sur le LIVE · relâcher pour arrêter</span>
      </footer>
    </main>
  );
}
