export class VisibilityController {
  private started = false;

  constructor(
    private readonly doc: Document,
    private readonly win: Window,
    private readonly onInactive: () => void,
  ) {}

  isActive(): boolean {
    return this.doc.visibilityState === "visible" && this.doc.hasFocus();
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    this.doc.addEventListener("visibilitychange", this.handleVisibilityChange);
    this.win.addEventListener("blur", this.handleInactive);
    this.win.addEventListener("pagehide", this.handleInactive);
  }

  stop(): void {
    if (!this.started) return;
    this.started = false;
    this.doc.removeEventListener(
      "visibilitychange",
      this.handleVisibilityChange,
    );
    this.win.removeEventListener("blur", this.handleInactive);
    this.win.removeEventListener("pagehide", this.handleInactive);
  }

  private readonly handleVisibilityChange = (): void => {
    if (this.doc.visibilityState !== "visible") {
      this.onInactive();
    }
  };

  private readonly handleInactive = (): void => {
    this.onInactive();
  };
}
