import { describe, it, expect } from "vitest";
import { recordAiFailure, FailureThresholdTracker, InMemoryAlertSink } from "./alerts";

describe("FailureThresholdTracker (ai_api_silent_degradation_no_alert 対策 — day_care_web_app パターン)", () => {
  it("does not exceed until the 3rd failure within the window", () => {
    const tracker = new FailureThresholdTracker(60, 3);
    const t0 = new Date("2026-07-06T00:00:00Z");
    expect(tracker.record(t0)).toBe(false);
    expect(tracker.record(new Date(t0.getTime() + 1000))).toBe(false);
    expect(tracker.record(new Date(t0.getTime() + 2000))).toBe(true);
  });

  it("does not count failures that fall outside the sliding window", () => {
    const tracker = new FailureThresholdTracker(60, 3);
    const t0 = new Date("2026-07-06T00:00:00Z");
    tracker.record(t0);
    tracker.record(new Date(t0.getTime() + 30 * 60_000));
    // 91分後に3件目 -> 最初の失敗は60分ウィンドウの外
    const exceeded = tracker.record(new Date(t0.getTime() + 91 * 60_000));
    expect(exceeded).toBe(false);
  });
});

describe("recordAiFailure", () => {
  it("records every failure and raises a threshold alert on the 3rd failure within an hour", async () => {
    const sink = new InMemoryAlertSink();
    const tracker = new FailureThresholdTracker(60, 3);
    const now = new Date("2026-07-06T00:00:00Z");

    await recordAiFailure(sink, tracker, { pipeline: "test", reason: "api_key_missing" }, now);
    await recordAiFailure(sink, tracker, { pipeline: "test", reason: "call_error" }, new Date(now.getTime() + 1000));
    expect(sink.thresholdExceededEvents).toHaveLength(0);

    await recordAiFailure(
      sink,
      tracker,
      { pipeline: "test", reason: "json_parse_error" },
      new Date(now.getTime() + 2000),
    );

    expect(sink.failures).toHaveLength(3);
    expect(sink.thresholdExceededEvents).toHaveLength(1);
    expect(sink.thresholdExceededEvents[0].count).toBe(3);
    expect(sink.thresholdExceededEvents[0].pipeline).toBe("test");
  });

  it("preserves the detail and reason on each recorded failure", async () => {
    const sink = new InMemoryAlertSink();
    const tracker = new FailureThresholdTracker(60, 3);
    await recordAiFailure(sink, tracker, { pipeline: "p", reason: "json_parse_error", detail: "Unexpected token" });
    expect(sink.failures[0]).toMatchObject({ pipeline: "p", reason: "json_parse_error", detail: "Unexpected token" });
  });
});
