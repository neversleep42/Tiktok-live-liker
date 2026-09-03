export interface ExtensionSettings {
  enabled: boolean;
  simulationMode: boolean;
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

export type InteractionError = "INTERACTION_TARGET_NOT_FOUND";

export interface RuntimeStatus {
  enabled: boolean;
  liveDetected: boolean;
  interacting: boolean;
  simulationMode: boolean;
  interactionCount: number;
  status: UiStatus;
  error: InteractionError | null;
}

export type ExtensionMessage =
  | { type: "GET_SETTINGS" }
  | { type: "SET_SETTINGS"; patch: Partial<ExtensionSettings> }
  | { type: "GET_STATUS" }
  | { type: "RESET_SESSION" }
  | { type: "STATUS_CHANGED"; status: RuntimeStatus };

export type ExtensionResponse =
  | { ok: true; settings: ExtensionSettings }
  | { ok: true; status: RuntimeStatus }
  | { ok: true }
  | { ok: false; error: string };
