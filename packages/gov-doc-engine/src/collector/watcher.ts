import type { WatcherConfig, WatcherSource } from "./types";
import { detectDiff, type DiffResult } from "./diff";
import { SelectorNotFoundError } from "./extract";
import { detectSoft404 } from "./soft404";
import {
  FailureThresholdTracker,
  recordAiFailure,
  type AlertSink,
} from "../analyzer/alerts";

const WATCHER_PIPELINE_NAME = "gov-doc-engine.collector.watcher";

/** fetch 結果を status 付きで返す場合の形。status を扱わないアダプタは文字列を返せばよい。 */
export interface FetchResponse {
  status: number;
  body: string;
}

/**
 * 実サイトへのフェッチ関数。既定実装 (defaultFetch) は Node のグローバル fetch を使う
 * 実ネットワークアクセスだが、DocumentWatcher はこれを DI で差し替え可能にしてあるため
 * テストでは実サイトを一切叩かない（常にフェイクの FetchFn を注入する）。
 *
 * 戻り値は本文の文字列、または status 付きの {@link FetchResponse}。
 * 文字列を返した場合は status 200 として扱う（既存アダプタとの後方互換）。
 */
export type FetchFn = (url: string) => Promise<string | FetchResponse>;

function normalizeFetchResult(result: string | FetchResponse): FetchResponse {
  return typeof result === "string" ? { status: 200, body: result } : result;
}

/**
 * 200 で返る移動済みページ（soft-404）や、期待と違う HTTP ステータスを検知したときの例外。
 * selector_missing と同様に「監視が静かに死ぬ」事象で、snapshot を保存せず呼び出し元へ再スローする。
 */
export class SourceMovedError extends Error {
  constructor(
    public readonly source: WatcherSource,
    public readonly detail: string,
  ) {
    super(`gov-doc-engine: source "${source.id}" appears moved/soft-404 (${detail})`);
    this.name = "SourceMovedError";
  }
}

/**
 * 非 2xx 応答を実ステータス付きで表す fetch 例外。
 * checkSource が expectStatus との不一致を判定できるよう、ステータスを載せて投げる。
 * status を返せる fetch アダプタを自作する場合も、非 2xx はこの型で投げると
 * ハード 404/410（ページ削除）が source_moved として記録される。
 */
export class FetchStatusError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "FetchStatusError";
  }
}

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

async function defaultFetch(url: string): Promise<FetchResponse> {
  const res = await fetch(url, {
    headers: { "User-Agent": "gov-doc-engine/0.1 (+internal regulatory monitoring)" },
  });
  if (!res.ok) {
    // 非 2xx は本文を返さず、実ステータス付きで throw する。
    // 本文を差分検知へ流さない従来動作を保ちつつ、checkSource が expectStatus と
    // 突き合わせてハード 404/410（ページ削除）を source_moved として記録できるようにする。
    throw new FetchStatusError(
      res.status,
      `gov-doc-engine: fetch failed for ${url}: ${res.status} ${res.statusText}`,
    );
  }
  // 実ステータスをそのまま返す。200 へ丸めると expectStatus:202 等の正常応答を取りこぼす。
  return { status: res.status, body: await res.text() };
}

/**
 * 収集層のコアクラス。1件の監視対象を取得し、直前保存分との差分を検知する。
 * 実サイトへの定期アクセスを行うのはこのクラスの責務だが、fetchFn/store を
 * DI で差し替えられるため単体テストでは実ネットワークに触れない。
 *
 * 収集が静かに死ぬ事象は failure として AlertSink に流す。alerts は必須の依存で、
 * soft-404・セレクタ不一致を取りこぼさないよう省略できない（省略すると監視の死を検知できない）。
 *
 * - soft-404 / ページ移動（200 で返る移動済みページや 404 本文、expectStatus 不一致）は
 *   "source_moved" として記録し SourceMovedError を投げる
 * - セレクタ不一致（SelectorNotFoundError, サイト改装等）は "selector_missing" として記録し再スローする
 * - いずれも snapshot として保存しない（保存すると直前の正常スナップショットが
 *   壊れ、復旧後の実変更を見逃す）
 * - エラーは呼び出し元へ再スローする（startPolling の onError / 運用ログで捕捉）
 */
export class DocumentWatcher {
  constructor(
    private readonly store: WatcherStore,
    private readonly fetchFn: FetchFn = defaultFetch,
    private readonly alerts: WatcherAlertDeps,
  ) {}

  private async recordFailure(reason: "selector_missing" | "source_moved", detail: string): Promise<void> {
    await recordAiFailure(
      this.alerts.sink,
      this.alerts.tracker,
      { pipeline: WATCHER_PIPELINE_NAME, reason, detail },
      (this.alerts.now ?? (() => new Date()))(),
    );
  }

  async checkSource(source: WatcherSource): Promise<WatchResult> {
    let fetched: string | FetchResponse;
    try {
      fetched = await this.fetchFn(source.url);
    } catch (err) {
      // expectStatus を明示した source で非 2xx（ハード 404/410 等）を受けた場合、
      // fetch 例外が本文比較より先に飛ぶ。ここで実ステータス付き例外を拾い、
      // expectStatus 不一致を source_moved として記録してから再スローする。
      if (
        source.expectStatus !== undefined &&
        err instanceof FetchStatusError &&
        err.status !== source.expectStatus
      ) {
        const detail = `source=${source.id} url=${source.url} status=${err.status} expected=${source.expectStatus}`;
        await this.recordFailure("source_moved", detail);
      }
      throw err;
    }

    const { status, body: html } = normalizeFetchResult(fetched);

    // expectStatus を明示した source だけ、実応答のステータスと突き合わせる。
    // 未設定なら status 判定はしない（defaultFetch は非 2xx で throw 済みで、
    // 2xx の細かな違いまで移動扱いにすると正常ページを誤検知するため）。
    if (source.expectStatus !== undefined && status !== source.expectStatus) {
      const detail = `source=${source.id} url=${source.url} status=${status} expected=${source.expectStatus}`;
      await this.recordFailure("source_moved", detail);
      throw new SourceMovedError(source, detail);
    }

    // 200 で返る移動済みページ（soft-404）を detectDiff の前に塞ぐ。
    if (detectSoft404(html, source)) {
      const detail = `source=${source.id} url=${source.url} reason=soft-404`;
      await this.recordFailure("source_moved", detail);
      throw new SourceMovedError(source, detail);
    }

    const previousHtml = await this.store.getLastHtml(source.id);

    let diff: DiffResult;
    try {
      diff = detectDiff({ previousHtml, currentHtml: html, selector: source.selector });
    } catch (err) {
      if (err instanceof SelectorNotFoundError) {
        // snapshot は保存しない（前回の正常スナップショットを温存する）。
        await this.recordFailure(
          "selector_missing",
          `source=${source.id} selector=${source.selector} url=${source.url}`,
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
