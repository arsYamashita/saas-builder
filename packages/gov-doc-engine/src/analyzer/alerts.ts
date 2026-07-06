/**
 * AI API 失敗時のアラート機構。
 *
 * KB教訓: ai_api_silent_degradation_no_alert
 * (~/Documents/my-vault/30_Knowledge/errors/ai_api_silent_degradation_no_alert.md,
 * day_care_web_app で 2026-07-03 に resolved 化済み)
 *
 * 「ANTHROPIC_API_KEY 不在時にログ・アラートなしで劣化モードへ切り替わる」
 * 「JSON パース失敗が warn ログのみでアラートに昇格しない」という問題への対策。
 * 介護報酬改定の見逃しと同様、gov-doc-engine でも助成金の新着/変更を見逃すと
 * ビジネスインパクトが大きいため、最初からアラート経路を組み込む。
 *
 * day_care_web_app の functions/src/utils/aiAlerts.ts
 * (recordAiFailure + 直近1時間3回以上失敗での閾値アラート) と同じ設計を、
 * ストレージ非依存の DI 関数として移植。実際の通知先
 * （Slack / PagerDuty / DB の system_alerts テーブル等）は AlertSink を実装する
 * プロダクト側の適用層 (application/) が担う。
 */

export type AiFailureReason = "api_key_missing" | "call_error" | "json_parse_error" | "refusal";

export interface AiFailureEvent {
  pipeline: string;
  reason: AiFailureReason;
  detail?: string;
  timestamp: Date;
}

export interface ThresholdExceededEvent {
  pipeline: string;
  windowMinutes: number;
  count: number;
  timestamp: Date;
}

export interface AlertSink {
  recordFailure(event: AiFailureEvent): Promise<void>;
  recordThresholdExceeded(event: ThresholdExceededEvent): Promise<void>;
}

/**
 * 直近 windowMinutes 分のスライディングウィンドウで失敗回数を追跡し、
 * threshold 回以上ならしきい値超過を通知する。
 */
export class FailureThresholdTracker {
  private readonly failureTimestamps: number[] = [];

  constructor(
    private readonly windowMinutes: number = 60,
    private readonly threshold: number = 3,
  ) {}

  /** 失敗を1件記録し、このタイミングで閾値に達したかどうかを返す。 */
  record(now: Date): boolean {
    const nowMs = now.getTime();
    this.failureTimestamps.push(nowMs);
    const cutoff = nowMs - this.windowMinutes * 60_000;
    while (this.failureTimestamps.length > 0 && this.failureTimestamps[0] < cutoff) {
      this.failureTimestamps.shift();
    }
    return this.failureTimestamps.length >= this.threshold;
  }

  get windowMinutesValue(): number {
    return this.windowMinutes;
  }

  get thresholdValue(): number {
    return this.threshold;
  }
}

/**
 * 失敗を記録し、必要ならしきい値超過アラートも送出する。
 * sink.recordFailure() 自体の失敗で呼び出し元の処理全体を失敗させたくない場合は、
 * 呼び出し側で try/catch すること（day_care_web_app の recordUsage と同じ方針）。
 */
export async function recordAiFailure(
  sink: AlertSink,
  tracker: FailureThresholdTracker,
  event: Omit<AiFailureEvent, "timestamp">,
  now: Date = new Date(),
): Promise<void> {
  const full: AiFailureEvent = { ...event, timestamp: now };
  await sink.recordFailure(full);

  const exceeded = tracker.record(now);
  if (exceeded) {
    await sink.recordThresholdExceeded({
      pipeline: event.pipeline,
      windowMinutes: tracker.windowMinutesValue,
      count: tracker.thresholdValue,
      timestamp: now,
    });
  }
}

/** テスト・簡易用途向けのインメモリ AlertSink。 */
export class InMemoryAlertSink implements AlertSink {
  readonly failures: AiFailureEvent[] = [];
  readonly thresholdExceededEvents: ThresholdExceededEvent[] = [];

  async recordFailure(event: AiFailureEvent): Promise<void> {
    this.failures.push(event);
  }

  async recordThresholdExceeded(event: ThresholdExceededEvent): Promise<void> {
    this.thresholdExceededEvents.push(event);
  }
}
