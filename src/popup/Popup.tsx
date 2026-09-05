import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  DEFAULT_SETTINGS,
  MAX_HOLD_INTERVAL_MS,
  MIN_HOLD_INTERVAL_MS,
  STORAGE_KEYS,
} from "../shared/constants";
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
    detail: "Ouvrez un LIVE TikTok dans cet onglet, puis maintenez L.",
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

const CADENCE_PRESETS = [
  { label: "Doux", ms: 700 },
  { label: "Équilibré", ms: 350 },
  { label: "Intense", ms: 180 },
] as const;

function intervalToPerSec(ms: number): string {
  return (1000 / ms).toLocaleString("fr-FR", { maximumFractionDigits: 1 });
}

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
        setLocalSettings((prev) => ({
          ...prev,
          enabled: message.status.enabled,
          simulationMode: message.status.simulationMode,
        }));
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

  const sendTabMessage = async (type: "FORCE_LIVE" | "CLEAR_MANUAL") => {
    const tabId = activeTabId.current ?? (await getActiveTabId());
    if (tabId === null) {
      setNotice("Onglet actif introuvable.");
      return;
    }
    try {
      await chrome.tabs.sendMessage(tabId, { type } satisfies ExtensionMessage);
      const tabStatus = await requestTabStatus(tabId);
      if (tabStatus) setStatus(tabStatus);
      setNotice(
        type === "FORCE_LIVE"
          ? "LIVE activé manuellement sur cet onglet."
          : "Mode manuel effacé.",
      );
    } catch {
      setNotice("Recharge l’onglet TikTok (F5), puis réessaie.");
    }
  };

  const copy = STATUS_COPY[status.status];
  const statusClass = `status-card status-card--${status.status.toLowerCase()}`;
  const formattedCount = useMemo(
    () => status.interactionCount.toLocaleString("fr-FR"),
    [status.interactionCount],
  );
  const perSec = useMemo(
    () => intervalToPerSec(settings.holdIntervalMs),
    [settings.holdIntervalMs],
  );
  const isLive = status.liveDetected && status.status !== "NO_LIVE";

  return (
    <main className={loading ? "popup popup--loading" : "popup"}>
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
            </svg>
          </div>
          <div className="brand-copy">
            <strong>LIVE Like</strong>
            <span>Assistant local · TikTok</span>
          </div>
        </div>
        <div className="topbar-badges">
          <span className={isLive ? "pill pill--live" : "pill"} aria-live="polite">
            <i aria-hidden="true" />
            {isLive ? "LIVE" : "Veille"}
          </span>
          <span className="version">v0.1</span>
        </div>
      </header>

      <section className={statusClass} aria-live="polite">
        <div className="status-icon" aria-hidden="true">
          <span />
        </div>
        <div className="status-text">
          <strong>{loading ? "Vérification…" : copy.title}</strong>
          <p>{loading ? "Lecture de l’onglet actif." : copy.detail}</p>
        </div>
        {status.interacting ? <span className="pulse" aria-hidden="true" /> : null}
      </section>

      {!isLive ? (
        <section className="manual" aria-label="Activation manuelle">
          <div className="manual-head">
            <span className="eyebrow">Dépannage · sans détection auto</span>
            {status.manualLive ? <span className="pill pill--live"><i aria-hidden="true" />Manuel</span> : null}
          </div>
          <p className="hint">
            Méthode fiable : place ton curseur sur le cœur du LIVE qui fait monter
            son compteur, puis maintiens <strong>L</strong>. L’extension clique là où
            tu vises. Sinon : <strong>Activer</strong>, puis clic droit sur le bouton
            like → <strong>♥ Utiliser comme cible</strong>.
          </p>
          <div className="manual-actions">
            <button type="button" className="preset preset--active" onClick={() => void sendTabMessage("FORCE_LIVE")}>
              Activer ici
            </button>
            <button type="button" className="preset" onClick={() => void sendTabMessage("CLEAR_MANUAL")}>
              Effacer
            </button>
          </div>
        </section>
      ) : status.manualLive ? (
        <section className="manual manual--on" aria-label="Mode manuel actif">
          <div className="manual-head">
            <span className="eyebrow">Mode manuel actif</span>
            <button type="button" className="ghost-btn" onClick={() => void sendTabMessage("CLEAR_MANUAL")}>
              Effacer
            </button>
          </div>
          <p className="hint">Clic droit sur un autre bouton like pour changer de cible.</p>
        </section>
      ) : null}

      <section className="counter" aria-label="Compteur de session">
        <div className="counter-head">
          <span className="eyebrow">Session · interactions</span>
          <button
            type="button"
            className="ghost-btn"
            onClick={() => void resetSession()}
            title="Remettre le compteur à zéro"
          >
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
            </svg>
            Réinitialiser
          </button>
        </div>
        <strong>{formattedCount}</strong>
        <span className="counter-sub">
          {settings.simulationMode ? "Simulation locale · aucun like réel" : "Mode réel · clic sur l’interface TikTok visible"}
        </span>
      </section>

      <section className="cadence" aria-label="Puissance et cadence">
        <div className="cadence-head">
          <span className="eyebrow">Puissance · cadence</span>
          <span className="cadence-value">{perSec}/s</span>
        </div>
        <input
          type="range"
          className="slider"
          min={MIN_HOLD_INTERVAL_MS}
          max={MAX_HOLD_INTERVAL_MS}
          step={10}
          value={MAX_HOLD_INTERVAL_MS + MIN_HOLD_INTERVAL_MS - settings.holdIntervalMs}
          disabled={saving || !settings.enabled}
          aria-label="Cadence d’envoi pendant le maintien"
          style={
            {
              "--fill": `${(
                ((MAX_HOLD_INTERVAL_MS + MIN_HOLD_INTERVAL_MS - settings.holdIntervalMs - MIN_HOLD_INTERVAL_MS) /
                  (MAX_HOLD_INTERVAL_MS - MIN_HOLD_INTERVAL_MS)) *
                100
              ).toFixed(1)}%`,
            } as React.CSSProperties
          }
          onChange={(event) => {
            const slider = Number(event.currentTarget.value);
            const ms = MAX_HOLD_INTERVAL_MS + MIN_HOLD_INTERVAL_MS - slider;
            void setSetting({ holdIntervalMs: ms });
          }}
        />
        <div className="presets" role="group" aria-label="Préréglages de puissance">
          {CADENCE_PRESETS.map((preset) => {
            const active = Math.abs(preset.ms - settings.holdIntervalMs) < 30;
            return (
              <button
                key={preset.label}
                type="button"
                className={active ? "preset preset--active" : "preset"}
                disabled={saving || !settings.enabled}
                onClick={() => void setSetting({ holdIntervalMs: preset.ms })}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
        <p className="hint">Appliquée uniquement tant que tu maintiens L ou le bouton. Relâcher arrête tout.</p>
      </section>

      <section className="settings" aria-label="Réglages">
        <label className="setting-row">
          <span className="setting-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2v4M12 18v4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M2 12h4M18 12h4M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8" />
            </svg>
          </span>
          <span className="setting-text">
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
          <span className="setting-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 2v6L4.5 18a2 2 0 0 0 1.8 3h11.4a2 2 0 0 0 1.8-3L14 8V2" />
              <path d="M8.5 2h7" />
              <path d="M7 16h10" />
            </svg>
          </span>
          <span className="setting-text">
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
        <p className="real-mode-note" role="note">
          Mode réel expérimental : déclenche uniquement le bouton visible de TikTok. TikTok peut ignorer ce clic synthétique.
        </p>
      ) : null}

      {notice ? <p className="notice">{notice}</p> : null}

      <footer className="foot">
        <kbd>L</kbd>
        <span>Maintenir sur le LIVE · relâcher pour arrêter</span>
      </footer>
      <p className="hint foot-note">
        Le popup se ferme dès qu’il perd le focus (limite Chrome). Suis le compteur en direct
        sur le panneau flottant dans la page — tu peux le réduire.
      </p>
    </main>
  );
}
