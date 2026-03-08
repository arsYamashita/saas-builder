import { readPrompt } from "@/lib/utils/read-prompt";

/**
 * Lovable UI 生成用のプロンプトを構築する
 * final/04-ui-final.md をベースに、プレースホルダーを置換して返す
 */
export async function buildLovablePrompt(replacements: Record<string, string>) {
  let prompt = await readPrompt("final/04-ui-final.md");

  for (const [key, value] of Object.entries(replacements)) {
    prompt = prompt.replace(`{{${key}}}`, value);
  }

  return prompt;
}
