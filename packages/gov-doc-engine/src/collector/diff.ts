import { extractSection } from "./extract";
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
 * previousHtml が null の場合（初回観測）は常に changed: true を返す
 * — 「新規追加された監視対象の初回コンテンツ」を見逃さないため。
 */
export function detectDiff(params: {
  previousHtml: string | null;
  currentHtml: string;
  selector: string;
}): DiffResult {
  const currentNormalized = normalizeHtml(extractSection(params.currentHtml, params.selector));
  const currentHash = hashContent(currentNormalized);

  if (params.previousHtml === null) {
    return {
      changed: true,
      previousHash: null,
      currentHash,
      previousNormalized: null,
      currentNormalized,
    };
  }

  const previousNormalized = normalizeHtml(extractSection(params.previousHtml, params.selector));
  const previousHash = hashContent(previousNormalized);

  return {
    changed: previousHash !== currentHash,
    previousHash,
    currentHash,
    previousNormalized,
    currentNormalized,
  };
}
