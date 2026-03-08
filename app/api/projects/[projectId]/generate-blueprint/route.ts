import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/db/supabase/admin";
import { readPrompt } from "@/lib/utils/read-prompt";
import { runGeminiIntake } from "@/lib/ai/gemini-intake";
import { runGeminiBlueprint } from "@/lib/ai/gemini-blueprint";
import { normalizeBlueprint } from "@/lib/ai/blueprint-normalizer";

type Props = {
  params: Promise<{ projectId: string }>;
};

function buildUserInputFromProject(project: {
  name: string;
  description: string | null;
  industry: string;
  metadata_json: Record<string, unknown> | null;
}) {
  const meta = project.metadata_json ?? {};

  return `
サービス名: ${project.name}
概要: ${project.description ?? ""}
テンプレカテゴリ: ${project.industry}
ターゲット: ${String(meta.targetUsers ?? "")}
解決課題: ${String(meta.problemToSolve ?? "")}
参考サービス: ${String(meta.referenceServices ?? "")}
ブランドトーン: ${String(meta.brandTone ?? "")}
必須機能: ${JSON.stringify(meta.requiredFeatures ?? [])}
管理データ: ${JSON.stringify(meta.managedData ?? [])}
エンドユーザー作成データ: ${JSON.stringify(meta.endUserCreatedData ?? [])}
権限: ${JSON.stringify(meta.roles ?? [])}
課金方式: ${String(meta.billingModel ?? "")}
アフィリエイト: ${String(meta.affiliateEnabled ?? false)}
公開範囲: ${String(meta.visibilityRule ?? "")}
MVP範囲: ${JSON.stringify(meta.mvpScope ?? [])}
除外範囲: ${JSON.stringify(meta.excludedInitialScope ?? [])}
技術スタック: ${String(meta.stackPreference ?? "")}
備考: ${String(meta.notes ?? "")}
優先度: ${String(meta.priority ?? "")}
`.trim();
}

export async function POST(_req: NextRequest, { params }: Props) {
  try {
    const { projectId } = await params;
    const supabase = createAdminClient();

    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("*")
      .eq("id", projectId)
      .single();

    if (projectError || !project) {
      return NextResponse.json(
        { error: "Project not found", details: projectError?.message },
        { status: 404 }
      );
    }

    const intakePrompt = await readPrompt("01-gemini-intake.md");
    const blueprintPrompt = await readPrompt("02-gemini-blueprint.md");

    const userInput = buildUserInputFromProject(project);

    const intakeResult = await runGeminiIntake({
      userInput,
      promptTemplate: intakePrompt,
    });

    const blueprintResult = await runGeminiBlueprint({
      mvpSpec: intakeResult.outputText,
      promptTemplate: blueprintPrompt,
    });

    const normalized = normalizeBlueprint(blueprintResult.blueprint);

    const { data: existing, error: existingError } = await supabase
      .from("blueprints")
      .select("version")
      .eq("project_id", projectId)
      .order("version", { ascending: false })
      .limit(1);

    if (existingError) {
      return NextResponse.json(
        {
          error: "Failed to check existing blueprints",
          details: existingError.message,
        },
        { status: 500 }
      );
    }

    const nextVersion = existing && existing.length > 0 ? existing[0].version + 1 : 1;

    const { data: inserted, error: insertError } = await supabase
      .from("blueprints")
      .insert({
        project_id: projectId,
        version: nextVersion,
        prd_json: normalized.product_summary ?? {},
        entities_json: normalized.entities ?? [],
        screens_json: normalized.screens ?? [],
        roles_json: normalized.roles ?? [],
        permissions_json: normalized.permissions ?? [],
        billing_json: normalized.billing ?? {},
        affiliate_json: normalized.affiliate ?? {},
        kpi_json: normalized.kpis ?? [],
        assumptions_json: normalized.assumptions ?? [],
        events_json: normalized.events ?? [],
        mvp_scope_json: normalized.mvp_scope ?? [],
        future_scope_json: normalized.future_scope ?? [],
        raw_prompt: `${intakeResult.rawPrompt}\n\n---\n\n${blueprintResult.rawPrompt}`,
        source: "gemini",
      })
      .select()
      .single();

    if (insertError) {
      return NextResponse.json(
        { error: "Failed to save generated blueprint", details: insertError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      project,
      intake: intakeResult.outputText,
      blueprint: inserted,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown server error";

    return NextResponse.json(
      { error: "Failed to generate blueprint", details: message },
      { status: 500 }
    );
  }
}
