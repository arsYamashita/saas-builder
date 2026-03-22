import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/db/supabase/admin";
import { readPrompt } from "@/lib/utils/read-prompt";
import { normalizeBlueprint } from "@/lib/ai/blueprint-normalizer";
import { blueprintSchema } from "@/lib/validation/blueprint";
import { executeTask } from "@/lib/providers/task-router";
import { extractJsonFromText } from "@/lib/providers/result-normalizer";
import { buildStepMeta, mergeStepMetas } from "@/lib/providers/step-meta";
import { requireCurrentUser } from "@/lib/auth/current-user";

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
    await requireCurrentUser();
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

    const intakePromptTemplate = await readPrompt("01-gemini-intake.md");
    const blueprintPromptTemplate = await readPrompt("02-gemini-blueprint.md");

    const userInput = buildUserInputFromProject(project);

    // Step 1: Intake (text output)
    const intakePrompt = intakePromptTemplate.replace("{{user_input}}", userInput);
    const intakeResult = await executeTask("intake", intakePrompt);
    const intakeText =
      intakeResult.normalized.format === "text"
        ? intakeResult.normalized.text
        : intakeResult.raw.text;

    // Step 2: Blueprint (json output)
    const blueprintPrompt = blueprintPromptTemplate.replace("{{mvp_spec}}", intakeText);
    const blueprintResult = await executeTask("blueprint", blueprintPrompt);

    // Extract and validate blueprint JSON
    let parsedBlueprint: unknown;
    if (blueprintResult.normalized.format === "json") {
      parsedBlueprint = blueprintResult.normalized.data;
    } else {
      const { data } = extractJsonFromText(blueprintResult.raw.text);
      parsedBlueprint = data;
    }

    const validated = blueprintSchema.safeParse(parsedBlueprint);
    if (!validated.success) {
      throw new Error(
        `Blueprint validation failed: ${JSON.stringify(validated.error.issues)}`
      );
    }

    const normalized = normalizeBlueprint(validated.data);

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
        raw_prompt: `${intakePrompt}\n\n---\n\n${blueprintPrompt}`,
        source: blueprintResult.raw.provider,
      })
      .select()
      .single();

    if (insertError) {
      return NextResponse.json(
        { error: "Failed to save generated blueprint", details: insertError.message },
        { status: 500 }
      );
    }

    const _meta = mergeStepMetas([
      buildStepMeta("intake", intakeResult),
      buildStepMeta("blueprint", blueprintResult),
    ]);

    return NextResponse.json({
      project,
      intake: intakeText,
      blueprint: inserted,
      _meta,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown server error";
    if (message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json(
      { error: "Failed to generate blueprint", details: message },
      { status: 500 }
    );
  }
}
