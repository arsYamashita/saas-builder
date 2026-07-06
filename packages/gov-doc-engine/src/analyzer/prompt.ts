import { diffLines } from "diff";
import type { DiffAnalysisRequest } from "./schema";

/**
 * system prompt は全呼び出しで不変（=キャッシュ可能）にしておく。
 * このパイプラインはソースごとに繰り返し実行されるため、cache_control による
 * プロンプトキャッシュの恩恵が大きい（claude-api スキルの Prompt Caching 参照）。
 */
export const SYSTEM_INSTRUCTIONS = `あなたは官公庁・自治体の助成金/補助金ページの差分を分析するアシスタントです。
与えられる差分 (unified diff 形式。"+"が追加行、"-"が削除行、" "が変更なし行) から、
新規または変更された助成金・補助金情報を構造化 JSON として抽出してください。
- 差分が助成金・補助金に関係ない場合は isRelevant を false にしてください。
- 金額・締切日など不明な項目は null にし、憶測で埋めないでください。
- 締切日は西暦の ISO 8601 (YYYY-MM-DD) 形式に正規化してください。不明な場合は null にし、
  原文の表現を description に残してください。`;

/** 正規化済みテキストの前後比較から unified diff 形式のテキストを構築する。 */
export function buildUnifiedDiffText(previousText: string | null, currentText: string): string {
  if (previousText === null) {
    return [
      "[初回観測 - 比較対象なし。全文を新規内容として扱う]",
      ...currentText.split("\n").map((line) => `+ ${line}`),
    ].join("\n");
  }

  return diffLines(previousText, currentText)
    .flatMap((part) => {
      const prefix = part.added ? "+" : part.removed ? "-" : " ";
      return part.value
        .split("\n")
        .filter((line) => line.length > 0)
        .map((line) => `${prefix} ${line}`);
    })
    .join("\n");
}

export function buildUserPrompt(request: DiffAnalysisRequest): string {
  const diffText = buildUnifiedDiffText(request.previousText, request.currentText);
  return `監視対象URL: ${request.sourceUrl}\n\n差分:\n${diffText}`;
}
