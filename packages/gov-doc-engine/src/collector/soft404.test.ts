import { describe, it, expect } from "vitest";
import { detectSoft404 } from "./soft404";
import type { WatcherSource } from "./types";

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

const MOVED_IN_TITLE = `<html><head><title>ページは移動しました</title></head>
  <body><main id="main-content"><h1>補助金</h1></main></body></html>`;

const MOVED_IN_H1 = `<html><head><title>補助金・支援施策検索</title></head>
  <body><main id="main-content"><h1>このページは移動しました</h1></main></body></html>`;

const LIVE_PAGE = `<html><head><title>補助金・支援施策検索</title></head>
  <body><main id="main-content"><h1>補助金・支援施策検索</h1>
  <p>ものづくり補助金の公募が始まりました。</p></main></body></html>`;

// selector 先頭ブロック（300 文字）より後ろで文言を引用しているだけの生きたページ。
const LIVE_PAGE_DEEP_QUOTE = `<html><head><title>補助金・支援施策検索</title></head>
  <body><main id="main-content"><h1>補助金・支援施策検索</h1>
  <p>${"あ".repeat(400)}</p>
  <p>旧ページには「ページは移動しました」と表示されていました。</p></main></body></html>`;

describe("detectSoft404 — allowlist (movedPhrases 指定時のみ判定)", () => {
  it("returns false when neither movedPhrases nor expectTitleIncludes is set, even if the title matches", () => {
    expect(detectSoft404(MOVED_IN_TITLE, makeSource())).toBe(false);
  });

  it("detects a moved phrase in the <title>", () => {
    expect(detectSoft404(MOVED_IN_TITLE, makeSource({ movedPhrases: ["ページは移動しました"] }))).toBe(true);
  });

  it("detects a moved phrase in the first <h1>", () => {
    expect(detectSoft404(MOVED_IN_H1, makeSource({ movedPhrases: ["ページは移動しました"] }))).toBe(true);
  });

  it("does not detect a live page that lacks the phrase in the inspected region", () => {
    expect(detectSoft404(LIVE_PAGE, makeSource({ movedPhrases: ["ページは移動しました"] }))).toBe(false);
  });

  it("does not detect a phrase quoted deep in the body (beyond the selector head block)", () => {
    expect(detectSoft404(LIVE_PAGE_DEEP_QUOTE, makeSource({ movedPhrases: ["ページは移動しました"] }))).toBe(false);
  });

  it("matches any of several configured phrases", () => {
    const source = makeSource({ movedPhrases: ["別の文言", "ページは移動しました"] });
    expect(detectSoft404(MOVED_IN_TITLE, source)).toBe(true);
  });

  // 回帰(Codex P2): script/style の中身は判定から除外する。
  it("excludes <script>/<style> contents: ignores a phrase only in a script, and still catches one after a long script", () => {
    const source = makeSource({ movedPhrases: ["ページは移動しました"] });

    // 文言が script 内にしか無い正常ページ → 誤検知しない
    const phraseOnlyInScript = `<html><head><title>補助金</title></head>
      <body><main id="main-content"><h1>補助金・支援施策検索</h1>
      <script>var notice = "ページは移動しました";</script>
      <p>ものづくり補助金の公募が始まりました。</p></main></body></html>`;
    expect(detectSoft404(phraseOnlyInScript, source)).toBe(false);

    // 先頭に長い script があっても、その後ろの移動通知を検知漏れしない
    // （script を残すと 300 文字窓が script で埋まり、後続の <p> が押し出される）
    const longScriptThenMoved = `<html><head><title>補助金</title></head>
      <body><main id="main-content">
      <script>${"x".repeat(500)}</script>
      <p>このページは移動しました。新しいURLへ移動してください。</p></main></body></html>`;
    expect(detectSoft404(longScriptThenMoved, source)).toBe(true);
  });
});

describe("detectSoft404 — expectTitleIncludes (肯定判定)", () => {
  it("flags a page whose title does not include the expected marker", () => {
    const source = makeSource({ expectTitleIncludes: "補助金" });
    const page = `<html><head><title>404 Not Found</title></head>
      <body><main id="main-content"><h1>Not Found</h1></main></body></html>`;
    expect(detectSoft404(page, source)).toBe(true);
  });

  it("passes a live page whose title includes the expected marker", () => {
    const source = makeSource({ expectTitleIncludes: "補助金" });
    expect(detectSoft404(LIVE_PAGE, source)).toBe(false);
  });
});

describe("detectSoft404 — selector が取れなくても title/h1 で判定できる", () => {
  it("still inspects title/h1 when the selector matches nothing", () => {
    const page = `<html><head><title>ページは移動しました</title></head>
      <body><div id="totally-other"></div></body></html>`;
    expect(detectSoft404(page, makeSource({ movedPhrases: ["ページは移動しました"] }))).toBe(true);
  });
});
