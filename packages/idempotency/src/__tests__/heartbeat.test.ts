import { describe, it, expect, vi, afterEach } from "vitest";
import { startHeartbeat } from "../heartbeat";

describe("startHeartbeat", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("calls tick() repeatedly at the given interval", async () => {
    vi.useFakeTimers();
    let calls = 0;
    const heartbeat = startHeartbeat(100, async () => {
      calls += 1;
    });

    await vi.advanceTimersByTimeAsync(350);
    await heartbeat.stop();

    expect(calls).toBe(3);
  });

  it("never overlaps two ticks — skips a scheduled tick while the previous one is still in flight", async () => {
    vi.useFakeTimers();
    let concurrentTicks = 0;
    let maxConcurrentTicks = 0;
    let totalStarted = 0;

    const heartbeat = startHeartbeat(50, async () => {
      totalStarted += 1;
      concurrentTicks += 1;
      maxConcurrentTicks = Math.max(maxConcurrentTicks, concurrentTicks);
      await vi.advanceTimersByTimeAsync(200); // outlives several would-be ticks
      concurrentTicks -= 1;
    });

    await vi.advanceTimersByTimeAsync(500);
    await heartbeat.stop();

    expect(maxConcurrentTicks).toBe(1);
    // With overlap this would be ~10 (500ms / 50ms); serialized, it's
    // bounded by how many non-overlapping 200ms ticks fit in 500ms.
    expect(totalStarted).toBeLessThanOrEqual(3);
  });

  it("stop() awaits an in-flight tick before returning — the race this module exists to close", async () => {
    vi.useFakeTimers();
    let tickResolved = false;
    let releaseTick!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseTick = resolve;
    });

    const heartbeat = startHeartbeat(50, async () => {
      await gate;
      tickResolved = true;
    });

    await vi.advanceTimersByTimeAsync(60); // let the first tick start (but not finish)

    const stopPromise = heartbeat.stop();
    releaseTick();
    await stopPromise;

    // If stop() returned before the in-flight tick settled, this would
    // be false — exactly the bug Codex review gpt-5.6-sol (2026-08-30
    // round 2) found in the original `clearInterval()`-only versions of
    // withLock/withIdempotency's heartbeats.
    expect(tickResolved).toBe(true);
  });

  it("stop() is a no-op-safe when called with no tick ever having run", async () => {
    vi.useFakeTimers();
    const heartbeat = startHeartbeat(1_000, async () => {});
    await heartbeat.stop(); // should resolve immediately, not hang
    expect(true).toBe(true);
  });

  it("a rejecting tick does not stop future ticks from being scheduled", async () => {
    vi.useFakeTimers();
    let calls = 0;
    const heartbeat = startHeartbeat(50, async () => {
      calls += 1;
      throw new Error("transient failure");
    });

    await vi.advanceTimersByTimeAsync(160);
    await heartbeat.stop();

    expect(calls).toBeGreaterThanOrEqual(2);
  });
});
