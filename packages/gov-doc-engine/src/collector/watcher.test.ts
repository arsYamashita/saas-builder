import { describe, it, expect, vi } from "vitest";
import { DocumentWatcher, type WatcherStore } from "./watcher";
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
