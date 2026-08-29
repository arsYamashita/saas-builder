/**
 * A serialized, self-scheduling heartbeat: never overlaps two ticks, and
 * `stop()` waits for any in-flight tick to actually settle before
 * returning.
 *
 * Extracted after Codex review (gpt-5.6-sol, 2026-08-30 round 2 High)
 * found that both `withLock` and `withIdempotency`'s original
 * `setInterval(() => { void extend(...) })` pattern had the same bug:
 * `clearInterval()` only stops FUTURE ticks — it does not wait for a tick
 * already in flight. That created a real race: `fn` finishes,
 * `clearInterval()` runs, the caller checks `lost` (still `false`) and
 * proceeds to report success/release, and only THEN does the lagging
 * in-flight extend/renew resolve with `false` and set `lost = true` —
 * too late for anyone to see it. `stop()` here closes that window by
 * awaiting the last in-flight tick before returning.
 */
export interface Heartbeat {
  /** Stops scheduling new ticks and waits for any tick currently in
   * flight to settle. Safe to call multiple times. */
  stop(): Promise<void>;
}

/**
 * Starts calling `tick()` every `intervalMs`, skipping a scheduled call
 * if the previous `tick()` hasn't settled yet (never runs two ticks
 * concurrently — avoids out-of-order renewals under a slow backing
 * store). `tick()` rejecting is swallowed here (by design: a transient
 * renewal failure is not itself proof of anything — see the callers'
 * "not itself proof of loss" comments); `tick()` is responsible for
 * recording whatever conclusion it draws (e.g. setting a `lost` flag in
 * its own closure) before resolving/rejecting.
 */
export function startHeartbeat(intervalMs: number, tick: () => Promise<void>): Heartbeat {
  let inFlight: Promise<void> | null = null;

  const timer = setInterval(() => {
    if (inFlight) return; // previous tick still running — don't overlap
    inFlight = tick()
      .catch(() => {
        // Swallowed here; see doc comment. `tick()` itself is
        // responsible for distinguishing "confirmed lost" from
        // "transient error" in its own closure.
      })
      .finally(() => {
        inFlight = null;
      });
  }, intervalMs);

  // Node-specific: don't let the heartbeat keep the process alive on its
  // own (no-op / unsupported in browser and Deno, guarded defensively).
  const maybeUnref = (timer as unknown as { unref?: () => void }).unref;
  if (typeof maybeUnref === "function") {
    maybeUnref.call(timer);
  }

  return {
    async stop() {
      clearInterval(timer);
      if (inFlight) {
        await inFlight;
      }
    },
  };
}
