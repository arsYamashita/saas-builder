import { parse } from "node-html-parser";
import type { WatcherSource } from "./types";

/**
 * selector 領域の先頭から判定に使う文字数の上限。
 * 本文全体を部分一致させると、記事が移動文言を引用しただけで誤検知する
 * （KB: source_check_moved_phrase_matches_own_article_quoting_it_false_alarm_exit2）。
 * そのため先頭ブロックだけに限定する。
 */
const SELECTOR_HEAD_CHARS = 300;

/**
 * soft-404 / ページ移動の判定に使う「限定領域」のテキストを取り出す。
 *
 * 範囲は <title>・最初の <h1>・selector で取れた領域の先頭ブロック（先頭 300 文字程度）に限る。
 * 本文全体は見ない（移動文言を引用しただけの生きたページを誤検知しないため）。
 */
function extractInspectionRegion(
  html: string,
  selector: string,
): { titleText: string; region: string } {
  const root = parse(html, { comment: false });

  // script / style の中身は可視テキストではないため判定から除く。
  // 残すと、移動文言が script 内にあるだけの正常ページを誤検知したり、
  // 先頭に長い script があるとその後ろの移動通知が 300 文字窓から押し出されて検知漏れする。
  root.querySelectorAll("script, style").forEach((el) => el.remove());

  const titleText = (root.querySelector("title")?.text ?? "").trim();
  const h1Text = (root.querySelector("h1")?.text ?? "").trim();

  const selectorEl = root.querySelector(selector);
  const selectorHead = (selectorEl?.text ?? "").replace(/\s+/g, " ").trim().slice(0, SELECTOR_HEAD_CHARS);

  const region = [titleText, h1Text, selectorHead].join("\n");
  return { titleText, region };
}

/**
 * 200 で返る移動済みページ（soft-404）や、200 で返る 404 本文を検知する。
 *
 * 許可リスト方式: `movedPhrases` も `expectTitleIncludes` も無い source では常に `false`。
 * 文言判定は明示したホストだけで行う。
 *
 * 判定:
 * - `movedPhrases` のいずれかが限定領域（title・最初の h1・selector 先頭ブロック）に現れたら `true`
 * - `expectTitleIncludes` が設定され、かつ <title> がその文字列を含まなければ `true`
 *
 * HTTP ステータス（`expectStatus`）は本体テキストからは判定できないため、ここでは扱わない
 * （checkSource が fetch アダプタの status と突き合わせる）。
 */
export function detectSoft404(html: string, source: WatcherSource): boolean {
  const hasPhrases = source.movedPhrases !== undefined && source.movedPhrases.length > 0;
  const hasTitleExpectation = source.expectTitleIncludes !== undefined;

  // 許可リスト方式: 文言判定を指定していない source は一切判定しない。
  if (!hasPhrases && !hasTitleExpectation) {
    return false;
  }

  const { titleText, region } = extractInspectionRegion(html, source.selector);

  if (hasPhrases) {
    for (const phrase of source.movedPhrases!) {
      if (region.includes(phrase)) {
        return true;
      }
    }
  }

  if (hasTitleExpectation && !titleText.includes(source.expectTitleIncludes!)) {
    return true;
  }

  return false;
}
