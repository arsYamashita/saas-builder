/**
 * 適用層 (Application Layer) — インターフェイスのみ。
 *
 * gov-doc-engine 自体はテナントの永続化方式・通知チャネル（Slack/メール/DB等）を
 * 知らない。navigator (ai-business-navigator) 等のプロダクト側がこの契約を実装する
 * 薄いアダプタとして、検知結果・失敗アラートを自システムへ配線する。
 *
 * 実装例（プロダクト側の責務）:
 * - onSubsidyDetected: 検知した助成金情報を DB に保存し、対象テナントへ通知を送る
 * - onAiFailureAlert: gov-doc-engine からのアラートを Slack / system_alerts テーブル等へ転送する
 */
import type { SubsidyExtraction } from "../analyzer/schema";
import type { AiFailureEvent } from "../analyzer/alerts";
import type { WatchResult } from "../collector/watcher";

export interface SubsidyDetectionAdapter {
  /** 差分検知 + 構造化抽出が完了した際にプロダクト側へ通知する。 */
  onSubsidyDetected(params: {
    tenantId: string;
    watchResult: WatchResult;
    extraction: SubsidyExtraction;
  }): Promise<void>;

  /** AI 呼び出し失敗・劣化モードのアラートをプロダクト側の通知チャネルへ転送する。 */
  onAiFailureAlert(event: AiFailureEvent): Promise<void>;
}
