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
  onTrigger,
  onHoldStart,
  onHoldStop,
}: FloatingControllerProps) {
  const canInteract =
    status === "READY" || status === "ACTIVE" || status === "SIMULATION";

  return (
    <section className="lla-panel" aria-label="TikTok LIVE Like Assistant">
      <header className="lla-header">
        <span className="lla-mark" aria-hidden="true">
          L
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
      </header>

      <div className="lla-actions">
        <button
          className="lla-once"
          type="button"
          disabled={!canInteract}
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
            ♥
          </span>
          <span>
            <strong>Maintenir</strong>
            <small>ou touche L</small>
          </span>
        </button>
      </div>

      {error === "INTERACTION_TARGET_NOT_FOUND" ? (
        <p className="lla-error" role="status">
          Le contrôle TikTok n’est pas disponible.
        </p>
      ) : null}

      {simulationMode ? (
        <p className="lla-simulation">Aucun like réel n’est envoyé</p>
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
