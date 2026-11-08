import {
  FailureThresholdTracker,
  type AiFailureEvent,
  type AlertSink,
  type ThresholdExceededEvent,
} from "../analyzer/alerts";
import type { WatcherAlertDeps } from "../collector/watcher";

/** 何も記録しない AlertSink。アラート経路を検証しないテスト用。 */
export class NoopAlertSink implements AlertSink {
  async recordFailure(_event: AiFailureEvent): Promise<void> {
    // intentionally no-op
  }
  async recordThresholdExceeded(_event: ThresholdExceededEvent): Promise<void> {
    // intentionally no-op
  }
}

/**
 * DocumentWatcher の必須 alerts 引数に渡す no-op 依存。
 * アラート経路を検証しないテストで「必須だが何もしない」依存を明示的に渡すために使う。
 */
export function noopAlertDeps(): WatcherAlertDeps {
  return { sink: new NoopAlertSink(), tracker: new FailureThresholdTracker() };
}
