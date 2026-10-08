export type InteractionMode = "manual" | "automatic";

export interface ExtensionSettings {
  interactionMode: InteractionMode;
  enabled: boolean;
  simulationMode: boolean;
  holdIntervalMs: number;
}

export interface SessionState {
  interactionCount: number;
  startedAt: number;
  liveKey: string | null;
}

export type UiStatus =
  | "DISABLED"
  | "NO_LIVE"
  | "TARGET_MISSING"
  | "READY"
  | "ACTIVE"
  | "SIMULATION";

export type InteractionError =
  | "INTERACTION_TARGET_NOT_FOUND"
  | "INTERACTION_DISPATCH_FAILED";

export interface RuntimeStatus {
  enabled: boolean;
  liveDetected: boolean;
  interacting: boolean;
  simulationMode: boolean;
  interactionCount: number;
  status: UiStatus;
  error: InteractionError | null;
  manualLive?: boolean;
}

export type ExtensionMessage =
  | { type: "GET_SETTINGS" }
  | { type: "SET_SETTINGS"; patch: Partial<ExtensionSettings> }
  | { type: "GET_STATUS" }
  | { type: "RESET_SESSION" }
  | { type: "FORCE_LIVE" }
  | { type: "USE_CONTEXT_TARGET" }
  | { type: "CLEAR_MANUAL" }
  | {
      type: "DISPATCH_TRUSTED_LIKE";
      x: number;
      y: number;
      doubleClick: boolean;
    }
  | { type: "RELEASE_TRUSTED_INPUT" }
  | { type: "STATUS_CHANGED"; status: RuntimeStatus };

export type ExtensionResponse =
  | { ok: true; settings: ExtensionSettings }
  | { ok: true; status: RuntimeStatus }
  | { ok: true }
  | { ok: false; error: string };
