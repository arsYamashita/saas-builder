import type { WatcherConfig, WatcherSource } from "./types";
import { detectDiff, type DiffResult } from "./diff";
import { SelectorNotFoundError } from "./extract";
import {
  FailureThresholdTracker,
  recordAiFailure,
  type AlertSink,
} from "../analyzer/alerts";

const WATCHER_PIPELINE_NAME = "gov-doc-engine.collector.watcher";

/**
 * 実サイトへのフェッチ関数。既定実装 (defaultFetch) は Node のグローバル fetch を使う
 * 実ネットワークアクセスだが、DocumentWatcher はこれを DI で差し替え可能にしてあるため
 * テストでは実サイトを一切叩かない（常にフェイクの FetchFn を注入する）。
 */
export type FetchFn = (url: string) => Promise<string>;

/** 直近取得済み HTML の永続化契約。実装はプロダクト側（DB / KVS 等）に委ねる。 */
export interface WatcherStore {
  getLastHtml(sourceId: string): Promise<string | null>;
  saveHtml(sourceId: string, html: string, observedAt: Date): Promise<void>;
}

export interface WatchResult {
  source: WatcherSource;
  diff: DiffResult;
  observedAt: Date;
}

/**
 * 収集層の失敗（セレクタ不一致等）をアラートに流すための依存。
 * ai_api_silent_degradation_no_alert と同じ AlertSink 経路を使う (Codex P2)。
 */
export interface WatcherAlertDeps {
  sink: AlertSink;
  tracker: FailureThresholdTracker;
  now?: () => Date;
}

async function defaultFetch(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": "gov-doc-engine/0.1 (+internal regulatory monitoring)" },
  });
  if (!res.ok) {
    throw new Error(`gov-doc-engine: fetch failed for ${url}: ${res.status} ${res.statusText}`);
  }
  return await res.text();
}

/**
 * 収集層のコアクラス。1件の監視対象を取得し、直前保存分との差分を検知する。
 * 実サイトへの定期アクセスを行うのはこのクラスの責務だが、fetchFn/store を
 * DI で差し替えられるため単体テストでは実ネットワークに触れない。
 *
 * セレクタ不一致（SelectorNotFoundError, サイト改装等）は failure として扱う:
 * - alerts が与えられていれば AlertSink に "selector_missing" として記録する
 *   （閾値超過アラートも同経路で発火）
 * - 不一致ページを snapshot として保存しない（保存すると直前の正常スナップショットが
 *   壊れ、改装復旧後の実変更を見逃す）
 * - エラーは呼び出し元へ再スローする（startPolling の onError / 運用ログで捕捉）
 */
export class DocumentWatcher {
  constructor(
    private readonly store: WatcherStore,
    private readonly fetchFn: FetchFn = defaultFetch,
    private readonly alerts?: WatcherAlertDeps,
  ) {}

  async checkSource(source: WatcherSource): Promise<WatchResult> {
    const html = await this.fetchFn(source.url);
    const previousHtml = await this.store.getLastHtml(source.id);

    let diff: DiffResult;
    try {
      diff = detectDiff({ previousHtml, currentHtml: html, selector: source.selector });
    } catch (err) {
      if (err instanceof SelectorNotFoundError && this.alerts) {
        // snapshot は保存しない（前回の正常スナップショットを温存する）。
        await recordAiFailure(
          this.alerts.sink,
          this.alerts.tracker,
          {
            pipeline: WATCHER_PIPELINE_NAME,
            reason: "selector_missing",
            detail: `source=${source.id} selector=${source.selector} url=${source.url}`,
          },
          (this.alerts.now ?? (() => new Date()))(),
        );
      }
      throw err;
    }

    const observedAt = new Date();
    if (diff.changed) {
      await this.store.saveHtml(source.id, html, observedAt);
    }
    return { source, diff, observedAt };
  }

  async checkAll(config: WatcherConfig): Promise<WatchResult[]> {
    const results: WatchResult[] = [];
    for (const source of config.sources) {
      results.push(await this.checkSource(source));
    }
    return results;
  }
}

export interface SchedulerHandle {
  stop(): void;
}

/**
 * 各監視対象を checkIntervalMinutes 間隔で定期実行するスケジューラ。
 * 個別ソースのフェッチ失敗・セレクタ不一致が他ソースの監視ループを止めないよう、
 * try/catch でエラーを隔離する（セレクタ不一致のアラート送出は checkSource 内で
 * 実施済みなので、onError はログ/運用通知に専念できる）。
 *
 * 本番運用でのみ使用する経路であり、ユニットテストでは exercise しない
 * （実タイマー・実ネットワークへの依存を持ち込まないため）。
 */
export function startPolling(
  watcher: DocumentWatcher,
  config: WatcherConfig,
  onResult: (result: WatchResult) => void | Promise<void>,
  onError: (source: WatcherSource, error: unknown) => void = (source, error) => {
    console.error(`[gov-doc-engine] watcher error for ${source.id}:`, error);
  },
): SchedulerHandle {
  const timers = config.sources.map((source) => {
    const intervalMs = source.checkIntervalMinutes * 60_000;
    return setInterval(() => {
      watcher
        .checkSource(source)
        .then(onResult)
        .catch((error) => onError(source, error));
    }, intervalMs);
  });

  return {
    stop: () => timers.forEach(clearInterval),
  };
}
