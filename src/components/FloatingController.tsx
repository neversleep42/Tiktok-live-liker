import type {
  InteractionError,
  UiStatus,
} from "../shared/types";

interface FloatingControllerProps {
  status: UiStatus;
  count: number;
  simulationMode: boolean;
  error: InteractionError | null;
  pulseId: number;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onTrigger: () => void;
  onHoldStart: (source: "pointer" | "keyboard") => void;
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
  onToggleCollapse,
  onTrigger,
  onHoldStart,
  onHoldStop,
}: FloatingControllerProps) {
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
          <strong>LIVE Like</strong>
          <span className={`lla-status lla-status--${status.toLowerCase()}`}>
            <i aria-hidden="true" />
            {STATUS_LABELS[status]}
          </span>
        </div>
        <div className="lla-count" aria-label={`${count} interactions envoyées`}>
          <strong>{count.toLocaleString("fr-FR")}</strong>
          <span>session</span>
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

      <div className="lla-actions">
        <button
          className="lla-once"
          type="button"
          disabled={!canInteract}
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
          title="Maintenir pour envoyer en continu"
          onPointerDown={(event) => {
            if (!event.nativeEvent.isTrusted || event.button !== 0) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            onHoldStart("pointer");
          }}
          onPointerUp={() => onHoldStop("pointer")}
          onPointerCancel={() => onHoldStop("pointer")}
          onLostPointerCapture={() => onHoldStop("pointer")}
          onKeyDown={(event) => {
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
            <strong>Maintenir</strong>
            <small>vise la vidéo + L</small>
          </span>
          <kbd aria-hidden="true">L</kbd>
        </button>
      </div>

      {error === "INTERACTION_TARGET_NOT_FOUND" ? (
        <p className="lla-error" role="status">
          Le contrôle TikTok n’est pas disponible.
        </p>
      ) : null}

      {simulationMode ? (
        <p className="lla-simulation">Simulation locale · aucun like réel</p>
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
