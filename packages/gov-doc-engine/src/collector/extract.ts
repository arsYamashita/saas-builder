import { parse } from "node-html-parser";

/**
 * CSS セレクタで指定した要素の innerHTML を抽出する。
 * 要素が見つからない場合は空文字を返す（呼び出し元のログ/監視で気づける設計とする）。
 */
export function extractSection(html: string, selector: string): string {
  const root = parse(html, { comment: false });
  const el = root.querySelector(selector);
  return el ? el.innerHTML : "";
}
