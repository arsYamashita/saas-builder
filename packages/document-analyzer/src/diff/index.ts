import { diffWords } from 'diff';
import OpenAI from 'openai';

export interface DiffSummary {
  rawDiff: string;
  addedLines: number;
  removedLines: number;
  summary: string;
  importantChanges: string[];
}

export async function detectChanges(
  oldText: string,
  newText: string,
  options?: { llmSummary?: boolean },
): Promise<DiffSummary> {
  const changes = diffWords(oldText, newText);
  const added = changes.filter((c) => c.added).map((c) => c.value).join('');
  const removed = changes
    .filter((c) => c.removed)
    .map((c) => c.value)
    .join('');

  const rawDiff = changes
    .map((part) =>
      part.added ? `+ ${part.value}` : part.removed ? `- ${part.value}` : part.value,
    )
    .join('');

  let summary = '差分なし';
  let importantChanges: string[] = [];

  if (options?.llmSummary && (added || removed)) {
    const client = new OpenAI();
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content:
            'あなたは公文書・規制文書の差分を分析する専門家です。重要な変更点を簡潔に日本語で説明してください。',
        },
        {
          role: 'user',
          content: `以下のドキュメント差分を分析し、重要な変更点を3-5点の箇条書きで説明してください。\n\n追加内容:\n${added}\n\n削除内容:\n${removed}`,
        },
      ],
    });
    const content = response.choices[0].message.content ?? '';
    summary = content;
    importantChanges = content
      .split('\n')
      .filter((l) => l.startsWith('・') || l.startsWith('-') || l.startsWith('•'))
      .map((l) => l.replace(/^[・\-•]\s*/, ''));
  }

  return {
    rawDiff,
    addedLines: added.split('\n').length,
    removedLines: removed.split('\n').length,
    summary,
    importantChanges,
  };
}
