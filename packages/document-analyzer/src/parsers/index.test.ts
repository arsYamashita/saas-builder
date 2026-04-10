import { describe, it, expect } from 'vitest';
import { detectChanges } from '../diff';

describe('detectChanges', () => {
  it('追加行数を正しくカウントする', async () => {
    const result = await detectChanges('古いテキスト', '新しいテキスト', {
      llmSummary: false,
    });
    expect(result.addedLines).toBeGreaterThan(0);
  });

  it('変更なしの場合は差分テキストに元の文字列が含まれる', async () => {
    const result = await detectChanges('同じ', '同じ', { llmSummary: false });
    expect(result.rawDiff).toContain('同じ');
  });
});
