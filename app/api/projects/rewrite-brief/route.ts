import { NextRequest, NextResponse } from "next/server";
import { readPrompt } from "@/lib/utils/read-prompt";
import { executeTask } from "@/lib/providers/task-router";
import { extractJsonFromText } from "@/lib/providers/result-normalizer";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { rateLimit } from "@/lib/rate-limit";
import { parseJsonBody } from "@/lib/api/errors";

interface RewriteInput {
  summary: string;
  problemToSolve: string;
  targetUsers: string;
}

interface RewriteOutput {
  rewrittenSummary: string;
  rewrittenProblemToSolve: string;
  rewrittenTargetUsers: string;
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireCurrentUser();

    const allowed = await rateLimit(`generate:${user.id}`, 5, 60_000);
    if (!allowed) {
      return NextResponse.json(
        { error: "生成リクエストが多すぎます。しばらく待ってから再試行してください。" },
        { status: 429 }
      );
    }

    const parsedBody = await parseJsonBody<Partial<RewriteInput>>(req);
    if (!parsedBody.ok) return parsedBody.response;
    const body = parsedBody.data;

    const summary = body.summary?.trim() ?? "";
    const problemToSolve = body.problemToSolve?.trim() ?? "";
    const targetUsers = body.targetUsers?.trim() ?? "";

    // Nothing to rewrite
    if (!summary && !problemToSolve && !targetUsers) {
      return NextResponse.json(
        { error: "少なくとも1つの項目を入力してください" },
        { status: 400 }
      );
    }

    const promptTemplate = await readPrompt("utility/rewrite-project-brief.md");

    const inputJson = JSON.stringify(
      { summary, problemToSolve, targetUsers },
      null,
      2
    );

    const prompt = promptTemplate.replace("{{INPUT_JSON}}", inputJson);

    const result = await executeTask("brief_rewrite", prompt);

    // Extract JSON from normalized result
    let parsed: RewriteOutput;
    if (result.normalized.format === "json") {
      parsed = result.normalized.data as RewriteOutput;
    } else {
      // Fallback: try extracting from raw text
      const { data } = extractJsonFromText(result.raw.text);
      parsed = data as RewriteOutput;
    }

    return NextResponse.json({
      rewrittenSummary: parsed.rewrittenSummary ?? summary,
      rewrittenProblemToSolve: parsed.rewrittenProblemToSolve ?? problemToSolve,
      rewrittenTargetUsers: parsed.rewrittenTargetUsers ?? targetUsers,
    });
  } catch (err) {
    console.error("[rewrite-brief] Error:", err);
    return NextResponse.json(
      { error: "整形中にエラーが発生しました" },
      { status: 500 }
    );
  }
}
