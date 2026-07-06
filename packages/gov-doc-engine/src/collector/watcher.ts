import type { WatcherConfig, WatcherSource } from "./types";
import { detectDiff, type DiffResult } from "./diff";

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
 */
export class DocumentWatcher {
  constructor(
    private readonly store: WatcherStore,
    private readonly fetchFn: FetchFn = defaultFetch,
  ) {}

  async checkSource(source: WatcherSource): Promise<WatchResult> {
    const html = await this.fetchFn(source.url);
    const previousHtml = await this.store.getLastHtml(source.id);
    const diff = detectDiff({ previousHtml, currentHtml: html, selector: source.selector });
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
 * 個別ソースのフェッチ失敗が他ソースの監視ループを止めないよう、
 * try/catch でエラーを隔離する。
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
