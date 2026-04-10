/**
 * Document Diff Module
 *
 * Uses Claude API to compare two document versions and produce
 * a structured diff with change summaries.
 *
 * Common use cases:
 * - 介護報酬改定: comparing old vs new regulation text
 * - 助成金申請書: comparing draft versions
 * - 契約書: tracking clause changes
 */

// ── Types ───────────────────────────────────────────────────

export interface DocumentDiffInput {
  /** Text content of the original (older) document */
  oldText: string;
  /** Text content of the new (updated) document */
  newText: string;
  /** Optional label for the old version (e.g., "令和5年度版") */
  oldLabel?: string;
  /** Optional label for the new version (e.g., "令和6年度版") */
  newLabel?: string;
  /** Domain hint for better analysis (e.g., "介護報酬", "助成金", "契約書") */
  domain?: string;
  /** Language hint — defaults to "ja" */
  language?: string;
}

export interface DocumentChange {
  /** Type of change */
  type: "added" | "removed" | "modified" | "moved";
  /** Section or clause where the change occurred */
  location: string;
  /** Summary of the change in natural language */
  summary: string;
  /** Severity/impact level */
  impact: "high" | "medium" | "low";
  /** Original text snippet (for modified/removed) */
  oldSnippet?: string;
  /** New text snippet (for modified/added) */
  newSnippet?: string;
}

export interface DocumentDiffResult {
  /** Overall summary of changes */
  summary: string;
  /** Total number of changes detected */
  changeCount: number;
  /** Categorized list of changes */
  changes: DocumentChange[];
  /** Key takeaways / action items */
  keyTakeaways: string[];
  /** Domain-specific metadata */
  domainNotes?: string;
  /** Token usage for cost tracking */
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

// ── Prompt Builder ──────────────────────────────────────────

function buildDiffPrompt(input: DocumentDiffInput): string {
  const lang = input.language ?? "ja";
  const domain = input.domain ?? "一般";
  const oldLabel = input.oldLabel ?? "旧版";
  const newLabel = input.newLabel ?? "新版";

  return `あなたは${domain}分野の専門家です。以下の2つのドキュメントバージョンを比較し、変更点を分析してください。

## 指示
1. 全ての変更点を漏れなく検出してください
2. 各変更の影響度（high/medium/low）を判定してください
3. 実務上のキーポイントをまとめてください

## 出力形式
以下の JSON 形式で出力してください（他のテキストは不要）:
\`\`\`json
{
  "summary": "変更の全体サマリー（2-3文）",
  "changes": [
    {
      "type": "added|removed|modified|moved",
      "location": "変更箇所（条項名・セクション名）",
      "summary": "変更内容の説明",
      "impact": "high|medium|low",
      "oldSnippet": "旧テキスト（該当する場合）",
      "newSnippet": "新テキスト（該当する場合）"
    }
  ],
  "keyTakeaways": ["実務上の重要ポイント1", "ポイント2"],
  "domainNotes": "${domain}分野における補足事項"
}
\`\`\`

## ${oldLabel}
${truncateForPrompt(input.oldText)}

## ${newLabel}
${truncateForPrompt(input.newText)}`;
}

/**
 * Truncate text to fit within token limits.
 * Rough estimate: 1 Japanese character ≈ 1-2 tokens.
 * Keep under ~50k chars to leave room for prompt + output.
 */
function truncateForPrompt(text: string, maxChars = 50000): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + "\n\n... (以下省略、全" + text.length + "文字中 " + maxChars + "文字まで表示)";
}

// ── Diff Executor ───────────────────────────────────────────

/**
 * Compare two document texts using Claude API and return structured diff.
 */
export async function compareDocuments(
  input: DocumentDiffInput
): Promise<DocumentDiffResult> {
  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) {
    throw new Error("CLAUDE_API_KEY is not configured");
  }

  const prompt = buildDiffPrompt(input);

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 8192,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Claude API error: ${response.status} ${errorText}`);
  }

  const json = await response.json() as {
    content: Array<{ type: string; text?: string }>;
    usage?: { input_tokens: number; output_tokens: number };
  };

  const text = json.content
    ?.filter((c) => c.type === "text")
    .map((c) => c.text)
    .join("") ?? "";

  const usage = json.usage
    ? { inputTokens: json.usage.input_tokens, outputTokens: json.usage.output_tokens }
    : undefined;

  // Extract JSON from response (may be wrapped in ```json ... ```)
  const parsed = extractJsonFromResponse(text);

  const changes = Array.isArray(parsed.changes) ? parsed.changes : [];
  const keyTakeaways = Array.isArray(parsed.keyTakeaways) ? parsed.keyTakeaways.map(String) : [];

  return {
    summary: typeof parsed.summary === "string" ? parsed.summary : "差分分析が完了しました",
    changeCount: changes.length,
    changes: changes.map(normalizeChange),
    keyTakeaways,
    domainNotes: typeof parsed.domainNotes === "string" ? parsed.domainNotes : undefined,
    usage,
  };
}

/**
 * Lightweight local diff (no LLM) for quick comparison.
 * Compares line-by-line and returns basic statistics.
 */
export function compareDocumentsLocal(
  oldText: string,
  newText: string
): { addedLines: number; removedLines: number; unchangedLines: number; changeRatio: number } {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");
  const oldSet = new Set(oldLines);
  const newSet = new Set(newLines);

  const added = newLines.filter((l) => !oldSet.has(l)).length;
  const removed = oldLines.filter((l) => !newSet.has(l)).length;
  const unchanged = newLines.filter((l) => oldSet.has(l)).length;
  const total = Math.max(oldLines.length, newLines.length, 1);

  return {
    addedLines: added,
    removedLines: removed,
    unchangedLines: unchanged,
    changeRatio: (added + removed) / total,
  };
}

// ── Helpers ─────────────────────────────────────────────────

function extractJsonFromResponse(text: string): Record<string, unknown> {
  // Try to find JSON block in markdown code fence
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  const jsonStr = fenceMatch ? fenceMatch[1] : text;

  try {
    return JSON.parse(jsonStr.trim()) as Record<string, unknown>;
  } catch {
    // If parsing fails, return minimal result
    return { summary: text.slice(0, 500), changes: [], keyTakeaways: [] };
  }
}

function normalizeChange(raw: unknown): DocumentChange {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    type: validateChangeType(obj.type),
    location: String(obj.location ?? "不明"),
    summary: String(obj.summary ?? ""),
    impact: validateImpact(obj.impact),
    oldSnippet: obj.oldSnippet != null ? String(obj.oldSnippet) : undefined,
    newSnippet: obj.newSnippet != null ? String(obj.newSnippet) : undefined,
  };
}

function validateChangeType(v: unknown): DocumentChange["type"] {
  if (v === "added" || v === "removed" || v === "modified" || v === "moved") return v;
  return "modified";
}

function validateImpact(v: unknown): DocumentChange["impact"] {
  if (v === "high" || v === "medium" || v === "low") return v;
  return "medium";
}
