import type { SessionState } from "../shared/types";

export class SessionCounter {
  private state: SessionState;

  constructor(now: () => number = Date.now) {
    this.now = now;
    this.state = {
      interactionCount: 0,
      startedAt: now(),
      liveKey: null,
    };
  }

  private readonly now: () => number;

  beginLive(liveKey: string | null): SessionState {
    if (this.state.liveKey !== liveKey) {
      this.state = {
        interactionCount: 0,
        startedAt: this.now(),
        liveKey,
      };
    }

    return this.getState();
  }

  increment(): number {
    this.state = {
      ...this.state,
      interactionCount: this.state.interactionCount + 1,
    };
    return this.state.interactionCount;
  }

  reset(): SessionState {
    this.state = {
      interactionCount: 0,
      startedAt: this.now(),
      liveKey: this.state.liveKey,
    };
    return this.getState();
  }

  getCount(): number {
    return this.state.interactionCount;
  }

  getState(): SessionState {
    return { ...this.state };
  }
}
