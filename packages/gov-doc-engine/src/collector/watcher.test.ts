import { describe, it, expect, vi } from "vitest";
import { DocumentWatcher, SourceMovedError, type WatcherStore } from "./watcher";
import { SelectorNotFoundError } from "./extract";
import { FailureThresholdTracker, InMemoryAlertSink } from "../analyzer/alerts";
import type { WatcherSource } from "./types";
import { loadFixture } from "../test-utils/fixtures";
import { noopAlertDeps } from "../test-utils/alerts";

function makeSource(overrides: Partial<WatcherSource> = {}): WatcherSource {
  return {
    id: "test-source",
    name: "Test",
    agency: "Test Agency",
    url: "https://example.test/subsidy",
    selector: "main#main-content",
    category: "subsidy",
    checkIntervalMinutes: 60,
    ...overrides,
  };
}

function makeStore(initialHtml: string | null): WatcherStore & { saved: Array<{ id: string; html: string }> } {
  const saved: Array<{ id: string; html: string }> = [];
  let current = initialHtml;
  return {
    saved,
    async getLastHtml() {
      return current;
    },
    async saveHtml(id, html) {
      current = html;
      saved.push({ id, html });
    },
  };
}

describe("DocumentWatcher.checkSource — real network is never touched (fetchFn is fully injected)", () => {
  it("detects a change and persists the new html", async () => {
    const fetchFn = vi.fn().mockResolvedValue(loadFixture("mirasapo-plus-after.html"));
    const store = makeStore(loadFixture("mirasapo-plus-before.html"));
    const watcher = new DocumentWatcher(store, fetchFn, noopAlertDeps());

    const result = await watcher.checkSource(makeSource());

    expect(fetchFn).toHaveBeenCalledWith("https://example.test/subsidy");
    expect(result.diff.changed).toBe(true);
    expect(store.saved).toHaveLength(1);
  });

  it("does not persist when no change is detected", async () => {
    const html = loadFixture("mirasapo-plus-before.html");
    const fetchFn = vi.fn().mockResolvedValue(html);
    const store = makeStore(html);
    const watcher = new DocumentWatcher(store, fetchFn, noopAlertDeps());

    const result = await watcher.checkSource(makeSource());

    expect(result.diff.changed).toBe(false);
    expect(store.saved).toHaveLength(0);
  });

  it("treats a brand-new source (no stored html yet) as changed", async () => {
    const fetchFn = vi.fn().mockResolvedValue(loadFixture("mirasapo-plus-before.html"));
    const store = makeStore(null);
    const watcher = new DocumentWatcher(store, fetchFn, noopAlertDeps());

    const result = await watcher.checkSource(makeSource());
    expect(result.diff.changed).toBe(true);
    expect(store.saved).toHaveLength(1);
  });
});

describe("DocumentWatcher.checkAll", () => {
  it("checks every source in the config and isolates results independently", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(loadFixture("mirasapo-plus-after.html"))
      .mockResolvedValueOnce(loadFixture("jnet21-before.html"));
    const store = makeStore(null);
    const watcher = new DocumentWatcher(store, fetchFn, noopAlertDeps());

    const results = await watcher.checkAll({
      version: 1,
      sources: [
        makeSource({ id: "a", url: "https://example.test/a" }),
        makeSource({ id: "b", url: "https://example.test/b", selector: "div.contents" }),
      ],
    });

    expect(results).toHaveLength(2);
    expect(results[0].source.id).toBe("a");
    expect(results[1].source.id).toBe("b");
  });
});

describe("DocumentWatcher.checkSource — selector missing (Codex P2: 監視が静かに死ぬのを防ぐ)", () => {
  const REDESIGNED_PAGE = `<html><body><div id="totally-new-layout">サイト改装後のレイアウト</div></body></html>`;

  function makeAlertDeps() {
    return { sink: new InMemoryAlertSink(), tracker: new FailureThresholdTracker(60, 3) };
  }

  it("fires a selector_missing alert, does NOT save the snapshot, and rethrows", async () => {
    const fetchFn = vi.fn().mockResolvedValue(REDESIGNED_PAGE);
    const store = makeStore(loadFixture("mirasapo-plus-before.html"));
    const alerts = makeAlertDeps();
    const watcher = new DocumentWatcher(store, fetchFn, alerts);

    await expect(watcher.checkSource(makeSource())).rejects.toThrow(SelectorNotFoundError);

    // アラートが AlertSink (ai_api_silent_degradation_no_alert と同経路) に流れる
    expect(alerts.sink.failures).toHaveLength(1);
    expect(alerts.sink.failures[0].reason).toBe("selector_missing");
    expect(alerts.sink.failures[0].detail).toContain("test-source");
    // 不一致ページは snapshot として保存されない（直前の正常スナップショットを温存）
    expect(store.saved).toHaveLength(0);
  });

  it("repeated selector misses reach the threshold alert (3-in-window, same path as AI failures)", async () => {
    const fetchFn = vi.fn().mockResolvedValue(REDESIGNED_PAGE);
    const store = makeStore(loadFixture("mirasapo-plus-before.html"));
    const alerts = makeAlertDeps();
    const watcher = new DocumentWatcher(store, fetchFn, alerts);

    await expect(watcher.checkSource(makeSource())).rejects.toThrow(SelectorNotFoundError);
    await expect(watcher.checkSource(makeSource())).rejects.toThrow(SelectorNotFoundError);
    await expect(watcher.checkSource(makeSource())).rejects.toThrow(SelectorNotFoundError);

    expect(alerts.sink.failures).toHaveLength(3);
    expect(alerts.sink.thresholdExceededEvents).toHaveLength(1);
  });

  it("regression: a real change after the site recovers is still detected (snapshot was preserved)", async () => {
    // 改装ページ → (エラー・snapshot 非更新) → 復旧後の実変更ページ の順にフェッチさせる。
    // 旧実装では改装時に空スナップショットで上書きされ、以降の実変更を見逃していた。
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(REDESIGNED_PAGE)
      .mockResolvedValueOnce(loadFixture("mirasapo-plus-after.html"));
    const store = makeStore(loadFixture("mirasapo-plus-before.html"));
    const alerts = makeAlertDeps();
    const watcher = new DocumentWatcher(store, fetchFn, alerts);

    await expect(watcher.checkSource(makeSource())).rejects.toThrow(SelectorNotFoundError);
    expect(store.saved).toHaveLength(0); // 改装ページは保存されていない

    const result = await watcher.checkSource(makeSource());
    expect(result.diff.changed).toBe(true); // before(温存) vs after の実変更を検知
    expect(result.diff.previousHash).not.toBeNull();
    expect(store.saved).toHaveLength(1);
  });

  it("still does not save the snapshot and still records the alert (alerts are now mandatory)", async () => {
    const fetchFn = vi.fn().mockResolvedValue(REDESIGNED_PAGE);
    const store = makeStore(loadFixture("mirasapo-plus-before.html"));
    const alerts = makeAlertDeps();
    const watcher = new DocumentWatcher(store, fetchFn, alerts);

    await expect(watcher.checkSource(makeSource())).rejects.toThrow(SelectorNotFoundError);
    expect(alerts.sink.failures).toHaveLength(1);
    expect(alerts.sink.failures[0].reason).toBe("selector_missing");
    expect(store.saved).toHaveLength(0);
  });
});

describe("DocumentWatcher.checkSource — soft-404 / source moved (200 で返る移動済みページ)", () => {
  function makeAlertDeps() {
    return { sink: new InMemoryAlertSink(), tracker: new FailureThresholdTracker(60, 3) };
  }

  const MOVED_PAGE = `<!doctype html><html lang="ja"><head><meta charset="utf-8">
    <title>ページは移動しました</title></head>
    <body><main id="main-content"><h1>このページは移動しました</h1>
    <p>新しいURLへ移動してください。</p></main></body></html>`;

  // 本文の奥（selector 先頭ブロック 300 文字より後）で移動文言を「引用」しているだけの生きたページ。
  const LIVE_PAGE_QUOTING_PHRASE = `<!doctype html><html lang="ja"><head><meta charset="utf-8">
    <title>補助金・支援施策検索</title></head>
    <body><main id="main-content"><h1>補助金・支援施策検索</h1>
    <p>${"あ".repeat(400)}</p>
    <p>注記: 旧ページでは「ページは移動しました」と表示されていました。</p></main></body></html>`;

  // (a) movedPhrases 指定・200・title に文言 → SourceMovedError / source_moved 1件 / saveHtml 未呼び出し
  it("throws SourceMovedError, records source_moved, and does not save when a moved page is returned with 200", async () => {
    const fetchFn = vi.fn().mockResolvedValue(MOVED_PAGE);
    const store = makeStore(loadFixture("mirasapo-plus-before.html"));
    const alerts = makeAlertDeps();
    const watcher = new DocumentWatcher(store, fetchFn, alerts);
    const source = makeSource({ movedPhrases: ["ページは移動しました"] });

    await expect(watcher.checkSource(source)).rejects.toThrow(SourceMovedError);

    expect(alerts.sink.failures).toHaveLength(1);
    expect(alerts.sink.failures[0].reason).toBe("source_moved");
    expect(alerts.sink.failures[0].detail).toContain("test-source");
    expect(alerts.sink.failures[0].detail).toContain("https://example.test/subsidy");
    // 移動済みページは snapshot として保存しない（直前の正常スナップショットを温存）。
    expect(store.saved).toHaveLength(0);
  });

  // (b) 本文の奥で文言を引用しているだけの生きたページ → 通常どおり差分検知される
  it("still detects a normal diff for a live page that merely quotes the phrase deep in its body", async () => {
    const fetchFn = vi.fn().mockResolvedValue(LIVE_PAGE_QUOTING_PHRASE);
    const store = makeStore(loadFixture("mirasapo-plus-before.html"));
    const alerts = makeAlertDeps();
    const watcher = new DocumentWatcher(store, fetchFn, alerts);
    const source = makeSource({ movedPhrases: ["ページは移動しました"] });

    const result = await watcher.checkSource(source);

    expect(result.diff.changed).toBe(true);
    expect(alerts.sink.failures).toHaveLength(0);
    expect(store.saved).toHaveLength(1);
  });

  // (c) movedPhrases が無い source では、title に文言があっても判定しない（許可リスト方式）
  it("does not flag a source without movedPhrases even if the title contains a moved phrase", async () => {
    const fetchFn = vi.fn().mockResolvedValue(MOVED_PAGE);
    const store = makeStore(null);
    const alerts = makeAlertDeps();
    const watcher = new DocumentWatcher(store, fetchFn, alerts);
    const source = makeSource(); // movedPhrases 未指定

    const result = await watcher.checkSource(source);

    expect(result.diff.changed).toBe(true);
    expect(alerts.sink.failures).toHaveLength(0);
    expect(store.saved).toHaveLength(1);
  });

  // expectStatus を明示した source で実応答が合わなければ source_moved 扱い
  it("treats an unexpected HTTP status (status-aware fetch) as source_moved when expectStatus is set", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ status: 404, body: MOVED_PAGE });
    const store = makeStore(loadFixture("mirasapo-plus-before.html"));
    const alerts = makeAlertDeps();
    const watcher = new DocumentWatcher(store, fetchFn, alerts);

    await expect(watcher.checkSource(makeSource({ expectStatus: 200 }))).rejects.toThrow(SourceMovedError);
    expect(alerts.sink.failures).toHaveLength(1);
    expect(alerts.sink.failures[0].reason).toBe("source_moved");
    expect(store.saved).toHaveLength(0);
  });

  // 回帰(Codex P2): defaultFetch が実ステータスを返すので expectStatus:202 の正常応答を取りこぼさない。
  // 以前は本文だけ返して status が 200 に化け、202 期待と不一致で誤って SourceMovedError を投げていた。
  it("preserves the real status from defaultFetch so an expectStatus:202 page saves normally", async () => {
    const normalPage = loadFixture("mirasapo-plus-before.html");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 202,
      statusText: "Accepted",
      text: async () => normalPage,
    } as unknown as Response);
    try {
      const store = makeStore(null);
      // fetchFn を undefined で渡して defaultFetch を使わせる。
      const watcher = new DocumentWatcher(store, undefined, makeAlertDeps());

      const result = await watcher.checkSource(makeSource({ expectStatus: 202 }));

      expect(result.diff.changed).toBe(true);
      expect(store.saved).toHaveLength(1);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  // 回帰(Codex P2): expectStatus:200 の監視先がハード 404 を返すと、defaultFetch が
  // 本文比較より先に例外を投げる。それでも source_moved を記録してから再スローする
  // （ページ削除で通知も閾値アラートも出ないのを防ぐ）。
  it("records source_moved before rethrowing when defaultFetch hits a hard 404 under expectStatus:200", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found",
      text: async () => "<html><title>404 Not Found</title></html>",
    } as unknown as Response);
    try {
      const store = makeStore(loadFixture("mirasapo-plus-before.html"));
      const alerts = makeAlertDeps();
      // fetchFn を undefined で渡して defaultFetch を使わせる。
      const watcher = new DocumentWatcher(store, undefined, alerts);

      await expect(watcher.checkSource(makeSource({ expectStatus: 200 }))).rejects.toThrow(/fetch failed/);

      expect(alerts.sink.failures).toHaveLength(1);
      expect(alerts.sink.failures[0].reason).toBe("source_moved");
      expect(alerts.sink.failures[0].detail).toContain("status=404");
      expect(alerts.sink.failures[0].detail).toContain("expected=200");
      // ハード 404 の本文は保存しない（直前の正常スナップショットを温存）。
      expect(store.saved).toHaveLength(0);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  // expectStatus 未設定なら、ハード 404 は従来どおり記録せず例外のまま。
  it("does not record an alert on a hard 404 when expectStatus is not set", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found",
      text: async () => "<html></html>",
    } as unknown as Response);
    try {
      const store = makeStore(loadFixture("mirasapo-plus-before.html"));
      const alerts = makeAlertDeps();
      const watcher = new DocumentWatcher(store, undefined, alerts);

      await expect(watcher.checkSource(makeSource())).rejects.toThrow(/fetch failed/);

      expect(alerts.sink.failures).toHaveLength(0);
      expect(store.saved).toHaveLength(0);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  // (d) alerts を渡さない構築は型エラー（soft-404・selector-missing を必ずアラートするため必須）
  it("requires alerts: constructing a DocumentWatcher without alert deps is a type error", () => {
    const store = makeStore(null);
    const fetchFn = vi.fn().mockResolvedValue(MOVED_PAGE);
    // @ts-expect-error alerts は必須のコンストラクタ引数（省略すると監視の死を検知できない）。
    const watcher = new DocumentWatcher(store, fetchFn);
    expect(watcher).toBeInstanceOf(DocumentWatcher);
  });

  // defaultFetch が 404 本文を差分検知へ流さない（非 2xx は throw する）ことを固定する。
  it("defaultFetch throws on a non-2xx response instead of returning the 404 body", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found",
      text: async () => "<html><title>404 Not Found</title></html>",
    } as unknown as Response);
    try {
      const store = makeStore(null);
      // fetchFn を undefined で渡して defaultFetch を使わせる（alerts は必須なので第3引数で渡す）。
      const watcher = new DocumentWatcher(store, undefined, makeAlertDeps());

      await expect(watcher.checkSource(makeSource())).rejects.toThrow(/fetch failed/);
      expect(store.saved).toHaveLength(0);
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
