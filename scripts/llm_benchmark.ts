/**
 * LLM Benchmark: Claude Haiku vs NousCoder-14B (Ollama)
 *
 * Evaluates whether NousCoder-14B running locally on M5 Max can replace
 * Claude Haiku for low-stakes tasks in saas-builder (cost -30-50%).
 *
 * Run:
 *   ollama serve &
 *   ollama pull nous-hermes2:14b
 *   npx tsx scripts/llm_benchmark.ts
 */

import Anthropic from "@anthropic-ai/sdk";
import * as fs from "fs/promises";
import * as path from "path";

interface TestCase {
  id: string;
  prompt: string;
  expectedKeywords: string[];
}

interface BenchmarkResult {
  model: string;
  testCaseId: string;
  score: number;
  elapsedMs: number;
  tokens: number | null;
  error?: string;
}

// ── Test Cases (real saas-builder scenarios) ────────────────

const TEST_CASES: TestCase[] = [
  {
    id: "code_gen",
    prompt:
      "Next.js の API route で Supabase からユーザー一覧を取得する関数を書いてください",
    expectedKeywords: ["supabase", "createClient", "async", "NextResponse"],
  },
  {
    id: "test_gen",
    prompt:
      "以下の関数のユニットテストを vitest で書いてください:\nexport function formatDate(d: Date) { return d.toISOString().split('T')[0]; }",
    expectedKeywords: ["describe", "it", "expect", "formatDate"],
  },
  {
    id: "doc_gen",
    prompt:
      "以下の関数の JSDoc コメントを日本語で書いてください:\nasync function createTenant(name: string, plan: string)",
    expectedKeywords: ["@param", "@returns"],
  },
];

// ── Benchmark Runners ────────────────────────────────────────

async function benchmarkClaude(
  tc: TestCase
): Promise<BenchmarkResult> {
  const client = new Anthropic();
  const start = Date.now();
  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 512,
      messages: [{ role: "user", content: tc.prompt }],
    });
    const elapsed = Date.now() - start;
    const text =
      response.content[0].type === "text" ? response.content[0].text : "";
    const score =
      tc.expectedKeywords.filter((k) =>
        text.toLowerCase().includes(k.toLowerCase())
      ).length / tc.expectedKeywords.length;
    return {
      model: "claude-haiku-4-5-20251001",
      testCaseId: tc.id,
      score,
      elapsedMs: elapsed,
      tokens: response.usage.output_tokens,
    };
  } catch (err) {
    return {
      model: "claude-haiku-4-5-20251001",
      testCaseId: tc.id,
      score: 0,
      elapsedMs: Date.now() - start,
      tokens: null,
      error: String(err),
    };
  }
}

async function benchmarkOllama(
  tc: TestCase,
  modelName = "nous-hermes2:14b"
): Promise<BenchmarkResult> {
  const start = Date.now();
  try {
    const response = await fetch("http://localhost:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: modelName,
        prompt: tc.prompt,
        stream: false,
      }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok) {
      throw new Error(`Ollama HTTP ${response.status}`);
    }
    const data = (await response.json()) as { response: string };
    const elapsed = Date.now() - start;
    const score =
      tc.expectedKeywords.filter((k) =>
        data.response.toLowerCase().includes(k.toLowerCase())
      ).length / tc.expectedKeywords.length;
    return {
      model: modelName,
      testCaseId: tc.id,
      score,
      elapsedMs: elapsed,
      tokens: null,
    };
  } catch (err) {
    return {
      model: modelName,
      testCaseId: tc.id,
      score: 0,
      elapsedMs: Date.now() - start,
      tokens: null,
      error: String(err),
    };
  }
}

// ── Decision Logic ───────────────────────────────────────────

function renderDecision(
  claudeResults: BenchmarkResult[],
  ollamaResults: BenchmarkResult[]
): string {
  const claudeAvg =
    claudeResults.reduce((s, r) => s + r.score, 0) / claudeResults.length;
  const ollamaAvg =
    ollamaResults.reduce((s, r) => s + r.score, 0) / ollamaResults.length;
  const diff = claudeAvg - ollamaAvg;

  if (diff < 0.15) {
    return `ADOPT — スコア差 ${(diff * 100).toFixed(1)}% (<15%). ローカル採用推奨。\n対象タスク: doc_gen, test_gen`;
  } else if (diff < 0.30) {
    return `PARTIAL — スコア差 ${(diff * 100).toFixed(1)}% (15-30%). ドキュメント生成等の低品質許容タスクのみ採用。`;
  } else {
    return `SKIP — スコア差 ${(diff * 100).toFixed(1)}% (>30%). 採用見送り。3ヶ月後に再評価。`;
  }
}

// ── Main ─────────────────────────────────────────────────────

async function main() {
  console.log("=== LLM ベンチマーク開始 ===\n");

  const claudeResults: BenchmarkResult[] = [];
  const ollamaResults: BenchmarkResult[] = [];

  for (const tc of TEST_CASES) {
    console.log(`テストケース: ${tc.id}`);

    const claudeResult = await benchmarkClaude(tc);
    claudeResults.push(claudeResult);
    if (claudeResult.error) {
      console.log(`  Claude Haiku: ERROR — ${claudeResult.error}`);
    } else {
      console.log(
        `  Claude Haiku: スコア=${claudeResult.score.toFixed(2)}, 時間=${claudeResult.elapsedMs}ms, tokens=${claudeResult.tokens}`
      );
    }

    const ollamaResult = await benchmarkOllama(tc);
    ollamaResults.push(ollamaResult);
    if (ollamaResult.error) {
      console.log(`  NousCoder-14B: ERROR — ${ollamaResult.error}`);
    } else {
      console.log(
        `  NousCoder-14B: スコア=${ollamaResult.score.toFixed(2)}, 時間=${ollamaResult.elapsedMs}ms`
      );
    }
    console.log();
  }

  const decision = renderDecision(claudeResults, ollamaResults);
  console.log(`\n=== 判断 ===\n${decision}\n`);

  // Save results to 30_Knowledge
  const knowledgePath = path.join(
    process.env.HOME ?? "~",
    "my-vault/30_Knowledge/nousecoder_benchmark_result.md"
  );
  const md = `---
type: benchmark_result
created: ${new Date().toISOString().split("T")[0]}
projects: [saas-builder]
---

# NousCoder-14B vs Claude Haiku ベンチマーク結果

## 結果

| テストケース | Claude Haiku スコア | NousCoder スコア | Claude 時間(ms) | Nous 時間(ms) |
|---|---|---|---|---|
${TEST_CASES.map((tc) => {
  const c = claudeResults.find((r) => r.testCaseId === tc.id)!;
  const o = ollamaResults.find((r) => r.testCaseId === tc.id)!;
  return `| ${tc.id} | ${c.score.toFixed(2)} | ${o.error ? "ERROR" : o.score.toFixed(2)} | ${c.elapsedMs} | ${o.error ? "N/A" : o.elapsedMs} |`;
}).join("\n")}

## 判断

${decision}
`;

  await fs.writeFile(knowledgePath, md, "utf8");
  console.log(`結果を保存しました: ${knowledgePath}`);
}

main().catch((e) => {
  console.error("Benchmark failed:", e);
  process.exit(1);
});
