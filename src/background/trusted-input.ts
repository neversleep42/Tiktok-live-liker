const PROTOCOL_VERSION = "1.3";
const IDLE_DETACH_MS = 2_500;

const attachedTabs = new Set<number>();
const detachTimers = new Map<number, ReturnType<typeof setTimeout>>();
const operationQueues = new Map<number, Promise<void>>();
const pendingClicks = new Map<number, Set<AbortController>>();

function debuggee(tabId: number): chrome.debugger.Debuggee {
  return { tabId };
}

function enqueueTabOperation<T>(
  tabId: number,
  operation: () => Promise<T>,
): Promise<T> {
  const previous = operationQueues.get(tabId) ?? Promise.resolve();
  const result = previous.catch(() => undefined).then(operation);
  const settled = result.then(() => undefined, () => undefined);
  operationQueues.set(tabId, settled);
  void settled.then(() => {
    if (operationQueues.get(tabId) === settled) operationQueues.delete(tabId);
  });
  return result;
}

async function ensureAttached(tabId: number): Promise<void> {
  if (attachedTabs.has(tabId)) return;
  await chrome.debugger.attach(debuggee(tabId), PROTOCOL_VERSION);
  attachedTabs.add(tabId);
}

async function detach(tabId: number): Promise<void> {
  const timer = detachTimers.get(tabId);
  if (timer !== undefined) {
    clearTimeout(timer);
    detachTimers.delete(tabId);
  }
  if (!attachedTabs.has(tabId)) return;
  try {
    await chrome.debugger.detach(debuggee(tabId));
  } finally {
    attachedTabs.delete(tabId);
  }
}

function scheduleDetach(tabId: number): void {
  const current = detachTimers.get(tabId);
  if (current !== undefined) clearTimeout(current);
  const timer = setTimeout(() => {
    detachTimers.delete(tabId);
    void enqueueTabOperation(tabId, () => detach(tabId)).catch(() => undefined);
  }, IDLE_DETACH_MS);
  detachTimers.set(tabId, timer);
}

async function mouseEvent(
  tabId: number,
  type: "mouseMoved" | "mousePressed" | "mouseReleased",
  x: number,
  y: number,
  clickCount: number,
): Promise<void> {
  await chrome.debugger.sendCommand(debuggee(tabId), "Input.dispatchMouseEvent", {
    type,
    x,
    y,
    button: type === "mouseMoved" ? "none" : "left",
    buttons: type === "mousePressed" ? 1 : 0,
    clickCount,
    // A separate pointer lets the hold control distinguish generated releases
    // from the user's physical mouse release.
    pointerType: "pen",
  });
}

export async function dispatchTrustedLike(
  tabId: number,
  x: number,
  y: number,
  doubleClick: boolean,
): Promise<void> {
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0) {
    throw new Error("INVALID_LIKE_COORDINATES");
  }

  const cancellation = new AbortController();
  const pending = pendingClicks.get(tabId) ?? new Set<AbortController>();
  pending.add(cancellation);
  pendingClicks.set(tabId, pending);
  const assertActive = () => {
    if (cancellation.signal.aborted) throw new Error("LIKE_CANCELLED");
  };
  try {
    return await enqueueTabOperation(tabId, async () => {
      assertActive();
      await ensureAttached(tabId);
      try {
        assertActive();
        await mouseEvent(tabId, "mouseMoved", x, y, 0);
        for (let count = 1; count <= (doubleClick ? 2 : 1); count++) {
          assertActive();
          await mouseEvent(tabId, "mousePressed", x, y, count);
          // Always release a pressed button, including during cancellation.
          await mouseEvent(tabId, "mouseReleased", x, y, count);
        }
      } finally {
        scheduleDetach(tabId);
      }
    });
  } finally {
    pending.delete(cancellation);
    if (pending.size === 0) pendingClicks.delete(tabId);
  }
}

function cancelPendingClicks(tabId: number): void {
  for (const cancellation of pendingClicks.get(tabId) ?? []) {
    cancellation.abort();
  }
}

export function releaseTrustedInput(tabId: number): Promise<void> {
  // Cancel now, not when the release reaches the end of the operation queue.
  cancelPendingClicks(tabId);
  return enqueueTabOperation(tabId, () => detach(tabId));
}

export function forgetTrustedInput(tabId: number): void {
  cancelPendingClicks(tabId);
  clearAttachment(tabId);
}

function clearAttachment(tabId: number): void {
  const timer = detachTimers.get(tabId);
  if (timer !== undefined) clearTimeout(timer);
  detachTimers.delete(tabId);
  attachedTabs.delete(tabId);
}

chrome.debugger.onDetach.addListener((source) => {
  if (source.tabId !== undefined) {
    clearAttachment(source.tabId);
  }
});
