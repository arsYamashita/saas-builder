import { NextRequest, NextResponse } from "next/server";
import { readPrompt } from "@/lib/utils/read-prompt";
import { generateWithGemini } from "@/lib/ai/gemini-request";

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
    const body = (await req.json()) as Partial<RewriteInput>;

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

    const result = await generateWithGemini({ prompt });

    // Extract JSON from response (may be wrapped in ```json ... ```)
    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("[rewrite-brief] Failed to parse AI response:", result.text);
      return NextResponse.json(
        { error: "AIの応答を解析できませんでした" },
        { status: 502 }
      );
    }

    const parsed = JSON.parse(jsonMatch[0]) as RewriteOutput;

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
