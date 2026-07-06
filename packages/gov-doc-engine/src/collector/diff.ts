import { extractSection, SelectorNotFoundError } from "./extract";
import { normalizeHtml } from "./normalize";
import { hashContent } from "./hash";

export interface DiffResult {
  changed: boolean;
  previousHash: string | null;
  currentHash: string;
  /** 正規化済みテキスト（解析層への入力に使う。null = 初回観測で比較対象なし） */
  previousNormalized: string | null;
  currentNormalized: string;
}

/**
 * HTML 正規化 + ハッシュ比較による差分検知。
 *
 * - previousHtml が null の場合（初回観測）は常に changed: true を返す
 *   — 「新規追加された監視対象の初回コンテンツ」を見逃さないため。
 * - currentHtml でセレクタが一致しない場合は SelectorNotFoundError を投げる
 *   （Codex P2: 空文字への黙変換だと「空 vs 空」で changed=false に固定され
 *   監視が静かに死ぬ。サイト改装は障害としてアラート経路に乗せる）。
 * - previousHtml 側だけセレクタ不一致の場合（設定のセレクタを更新した直後など、
 *   保存済みスナップショットが新セレクタと不整合）は初回観測と同様に扱い
 *   changed: true を返す — 監視を止めずに新スナップショットへ移行するため。
 */
export function detectDiff(params: {
  previousHtml: string | null;
  currentHtml: string;
  selector: string;
}): DiffResult {
  const currentSection = extractSection(params.currentHtml, params.selector);
  if (currentSection === null) {
    throw new SelectorNotFoundError(params.selector, "current fetch");
  }
  const currentNormalized = normalizeHtml(currentSection);
  const currentHash = hashContent(currentNormalized);

  const previousSection =
    params.previousHtml === null ? null : extractSection(params.previousHtml, params.selector);

  if (previousSection === null) {
    // 初回観測、または保存済みスナップショットが現行セレクタと不整合 → 全体を新規として扱う。
    return {
      changed: true,
      previousHash: null,
      currentHash,
      previousNormalized: null,
      currentNormalized,
    };
  }

  const previousNormalized = normalizeHtml(previousSection);
  const previousHash = hashContent(previousNormalized);

  return {
    changed: previousHash !== currentHash,
    previousHash,
    currentHash,
    previousNormalized,
    currentNormalized,
  };
}
