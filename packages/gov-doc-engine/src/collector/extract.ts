import { parse } from "node-html-parser";

/**
 * セレクタ不一致（サイト改装等で監視対象領域が見つからない）を示すエラー。
 *
 * Codex P2 指摘: 以前はセレクタ不一致を黙って空文字に変換していたため、
 * 「空 vs 空」比較で changed=false に固定され、監視が静かに死んでいた
 * （サイトが改装された瞬間から一切の変更を検知できなくなる）。
 * 黙変換をやめ、明示的なエラーとして呼び出し元（watcher → AlertSink）に伝える。
 */
export class SelectorNotFoundError extends Error {
  constructor(
    public readonly selector: string,
    context: string,
  ) {
    super(`gov-doc-engine: selector "${selector}" matched no element (${context})`);
    this.name = "SelectorNotFoundError";
  }
}

/**
 * CSS セレクタで指定した要素の innerHTML を抽出する。
 * 要素が見つからない場合は null を返す（空文字への黙変換はしない —
 * 呼び出し元が missing-selector を明示的に扱えるようにする）。
 */
export function extractSection(html: string, selector: string): string | null {
  const root = parse(html, { comment: false });
  const el = root.querySelector(selector);
  return el ? el.innerHTML : null;
}
