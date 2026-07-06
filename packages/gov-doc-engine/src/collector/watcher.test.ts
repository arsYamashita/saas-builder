import { describe, it, expect, vi } from "vitest";
import { DocumentWatcher, type WatcherStore } from "./watcher";
import { SelectorNotFoundError } from "./extract";
import { FailureThresholdTracker, InMemoryAlertSink } from "../analyzer/alerts";
import type { WatcherSource } from "./types";
import { loadFixture } from "../test-utils/fixtures";

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
    const watcher = new DocumentWatcher(store, fetchFn);

    const result = await watcher.checkSource(makeSource());

    expect(fetchFn).toHaveBeenCalledWith("https://example.test/subsidy");
    expect(result.diff.changed).toBe(true);
    expect(store.saved).toHaveLength(1);
  });

  it("does not persist when no change is detected", async () => {
    const html = loadFixture("mirasapo-plus-before.html");
    const fetchFn = vi.fn().mockResolvedValue(html);
    const store = makeStore(html);
    const watcher = new DocumentWatcher(store, fetchFn);

    const result = await watcher.checkSource(makeSource());

    expect(result.diff.changed).toBe(false);
    expect(store.saved).toHaveLength(0);
  });

  it("treats a brand-new source (no stored html yet) as changed", async () => {
    const fetchFn = vi.fn().mockResolvedValue(loadFixture("mirasapo-plus-before.html"));
    const store = makeStore(null);
    const watcher = new DocumentWatcher(store, fetchFn);

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
    const watcher = new DocumentWatcher(store, fetchFn);

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

  it("without alert deps it still rethrows and still does not save the snapshot", async () => {
    const fetchFn = vi.fn().mockResolvedValue(REDESIGNED_PAGE);
    const store = makeStore(loadFixture("mirasapo-plus-before.html"));
    const watcher = new DocumentWatcher(store, fetchFn); // alerts 未指定

    await expect(watcher.checkSource(makeSource())).rejects.toThrow(SelectorNotFoundError);
    expect(store.saved).toHaveLength(0);
  });
});
