import type {
  InteractionMode,
  InteractionError,
  UiStatus,
} from "../shared/types";
import { CADENCE_PRESETS } from "../shared/constants";
import { version } from "../../package.json";

interface FloatingControllerProps {
  status: UiStatus;
  count: number;
  simulationMode: boolean;
  error: InteractionError | null;
  pulseId: number;
  collapsed: boolean;
  interactionMode: InteractionMode;
  intervalMs: number;
  onModeChange: (mode: InteractionMode) => void;
  onIntervalChange: (ms: number) => void;
  onToggleAutomatic: () => void;
  onSimulationChange: (simulation: boolean) => void;
  onToggleCollapse: () => void;
  onTrigger: () => void;
  onHoldStart: (source: "pointer" | "keyboard", pointerId?: number) => void;
  onHoldStop: (source: "pointer" | "keyboard") => void;
}

const STATUS_LABELS: Record<UiStatus, string> = {
  DISABLED: "Désactivée",
  NO_LIVE: "Aucun LIVE",
  TARGET_MISSING: "Contrôle introuvable",
  READY: "Prête",
  ACTIVE: "Active",
  SIMULATION: "Simulation",
};

export function FloatingController({
  status,
  count,
  simulationMode,
  error,
  pulseId,
  collapsed,
  interactionMode,
  intervalMs,
  onModeChange,
  onIntervalChange,
  onToggleAutomatic,
  onSimulationChange,
  onToggleCollapse,
  onTrigger,
  onHoldStart,
  onHoldStop,
}: FloatingControllerProps) {
  const automatic = interactionMode === "automatic";
  const canInteract =
    status === "READY" || status === "ACTIVE" || status === "SIMULATION";

  if (collapsed) {
    return (
      <section
        className={`lla-panel lla-panel--collapsed lla-panel--${status.toLowerCase()}`}
        aria-label="TikTok LIVE Like Assistant replié"
      >
        <button
          type="button"
          className="lla-collapsed-btn"
          title="Agrandir le panneau"
          onClick={(event) => {
            if (event.nativeEvent.isTrusted) onToggleCollapse();
          }}
        >
          <span className={`lla-status lla-status--${status.toLowerCase()}`} aria-hidden="true">
            <i />
          </span>
          <strong>{count.toLocaleString("fr-FR")}</strong>
          <span className="lla-collapsed-expand" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="m18 15-6-6-6 6" />
            </svg>
          </span>
        </button>
        {automatic && status === "ACTIVE" ? (
          <button type="button" className="lla-stop" onClick={(event) => {
            if (event.nativeEvent.isTrusted) onToggleAutomatic();
          }}>Arrêter</button>
        ) : null}
      </section>
    );
  }

  return (
    <section
      className={`lla-panel lla-panel--${status.toLowerCase()}`}
      aria-label="TikTok LIVE Like Assistant"
    >
      <header className="lla-header">
        <span className="lla-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
          </svg>
        </span>
        <div className="lla-heading">
          <strong>LIVE Like · {version}</strong>
          <span className={`lla-status lla-status--${status.toLowerCase()}`}>
            <i aria-hidden="true" />
            {STATUS_LABELS[status]}
          </span>
        </div>
        <div className="lla-count" aria-label={`${count} ${simulationMode ? "simulations" : "tentatives non confirmées"}`}>
          <strong>{count.toLocaleString("fr-FR")}</strong>
          <span>{simulationMode ? "simulation" : "tentatives"}</span>
        </div>
        <button
          type="button"
          className="lla-collapse"
          title="Réduire le panneau"
          aria-label="Réduire le panneau"
          onClick={(event) => {
            if (event.nativeEvent.isTrusted) onToggleCollapse();
          }}
        >
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
      </header>

      <div className="lla-options" role="group" aria-label="Mode de likes">
        {(["manual", "automatic"] as const).map((mode) => (
          <button key={mode} type="button" aria-pressed={interactionMode === mode}
            onClick={(event) => { if (event.nativeEvent.isTrusted) onModeChange(mode); }}>
            {mode === "manual" ? "Manuel" : "Automatique"}
          </button>
        ))}
      </div>
      <label className="lla-cadence">
        <span>Cadence · {(1000 / intervalMs).toLocaleString("fr-FR", { maximumFractionDigits: 1 })}/s</span>
        <select aria-label="Cadence d’envoi" value={intervalMs}
          onChange={(event) => { if (event.nativeEvent.isTrusted) onIntervalChange(Number(event.currentTarget.value)); }}>
          {!CADENCE_PRESETS.some((preset) => preset.ms === intervalMs) ? <option value={intervalMs}>Personnalisée</option> : null}
          {CADENCE_PRESETS.map((preset) => <option key={preset.ms} value={preset.ms}>{preset.label}</option>)}
        </select>
      </label>

      <div className="lla-actions">
        <button
          className="lla-once"
          type="button"
          disabled={!canInteract || status === "ACTIVE"}
          title="Envoyer une seule interaction"
          onClick={(event) => {
            if (event.nativeEvent.isTrusted) onTrigger();
          }}
        >
          +1
          <span>Like</span>
        </button>
        <button
          className="lla-hold"
          type="button"
          disabled={!canInteract}
          title={automatic ? "Démarrer ou arrêter les likes automatiques" : "Maintenir pour envoyer en continu"}
          aria-pressed={status === "ACTIVE"}
          onClick={(event) => {
            if (automatic && event.nativeEvent.isTrusted) onToggleAutomatic();
          }}
          onPointerDown={(event) => {
            if (automatic) return;
            if (!event.nativeEvent.isTrusted || event.button !== 0) return;
            // The content script observes release globally for this pointer.
            // Browser-generated clicks can steal capture from this control.
            onHoldStart("pointer", event.pointerId);
          }}
          onKeyDown={(event) => {
            if (automatic) return;
            if (
              !event.nativeEvent.isTrusted ||
              event.repeat ||
              (event.code !== "Space" && event.code !== "Enter")
            ) {
              return;
            }
            event.preventDefault();
            onHoldStart("keyboard");
          }}
          onKeyUp={(event) => {
            if (automatic) return;
            if (event.code === "Space" || event.code === "Enter") {
              event.preventDefault();
              onHoldStop("keyboard");
            }
          }}
          onBlur={() => onHoldStop("keyboard")}
          onContextMenu={(event) => event.preventDefault()}
        >
          <span className="lla-hold-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
              <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
            </svg>
          </span>
          <span className="lla-hold-text">
            <strong>{automatic ? (status === "ACTIVE" ? "Arrêter" : "Démarrer") : "Maintenir"}</strong>
            <small>{automatic ? "L : marche / arrêt" : "vise la vidéo + L"}</small>
          </span>
          <kbd aria-hidden="true">L</kbd>
        </button>
      </div>
      <p className="lla-simulation">{automatic ? "Sans maintien · Échap pour arrêter" : "Relâche L ou le bouton pour arrêter"}</p>

      {error === "INTERACTION_TARGET_NOT_FOUND" ? (
        <p className="lla-error" role="status">
          Cible introuvable. Clic droit sur la zone qui réagit à tes likes → Utiliser comme cible.
        </p>
      ) : null}
      {error === "INTERACTION_DISPATCH_FAILED" ? (
        <p className="lla-error" role="status">
          Envoi navigateur impossible. Ferme les DevTools, puis recharge l’extension et la page TikTok.
        </p>
      ) : null}

      {simulationMode ? (
        <div className="lla-simulation-notice">
          <p className="lla-simulation">Simulation active : aucun like n’est envoyé.</p>
          <button type="button" className="lla-enable-real" onClick={(event) => {
            if (event.nativeEvent.isTrusted) onSimulationChange(false);
          }}>Activer les likes réels</button>
        </div>
      ) : (
        <p className="lla-real">Mode réel · envois non confirmés par TikTok</p>
      )}

      {simulationMode && pulseId > 0 ? (
        <span key={pulseId} className="lla-pulse" aria-hidden="true">
          +1
        </span>
      ) : null}
    </section>
  );
}
