/**
 * Template Scoreboard
 *
 * Aggregates per-template operational metrics for the AI SaaS factory.
 */

export interface TemplateScore {
  templateKey: string;
  label: string;
  totalRuns: number;
  completedRuns: number;
  failedRuns: number;
  greenRate: number; // 0-100, completed / total
  approvedRuns: number;
  rejectedRuns: number;
  promotedRuns: number;
  latestBaselineTag: string | null;
  qualityPassRate: number; // 0-100
  qualityTotalRuns: number;
  qualityPassedRuns: number;
  promotionRate: number; // 0-100, promoted / approved (if approved > 0)
  blueprintReviewStatus: string | null; // "approved" | "pending" | "rejected" | null
  lastApprovedAt: string | null;
  lastPromotedAt: string | null;
}

export interface ScoreboardData {
  templates: TemplateScore[];
  generatedAt: string;
}

interface GenerationRunRow {
  id?: string;
  template_key: string;
  status: string;
  review_status: string;
  reviewed_at: string | null;
  promoted_at: string | null;
  baseline_tag: string | null;
}

interface QualityRunRow {
  generation_run_id: string;
  status: string;
}

interface BlueprintStatusRow {
  project_template_key: string;
  review_status: string | null;
}

interface TemplateLabel {
  templateKey: string;
  label: string;
}

export function buildScoreboard(
  generationRuns: GenerationRunRow[],
  qualityRuns: QualityRunRow[],
  templateLabels: TemplateLabel[],
  blueprintStatuses?: BlueprintStatusRow[]
): ScoreboardData {
  const labelMap = new Map(templateLabels.map((t) => [t.templateKey, t.label]));

  // Blueprint status lookup by template key
  const bpStatusMap = new Map<string, string | null>();
  if (blueprintStatuses) {
    for (const bp of blueprintStatuses) {
      bpStatusMap.set(bp.project_template_key, bp.review_status);
    }
  }

  // Group generation runs by template
  const byTemplate = new Map<string, GenerationRunRow[]>();
  for (const run of generationRuns) {
    const key = run.template_key;
    if (!byTemplate.has(key)) byTemplate.set(key, []);
    byTemplate.get(key)!.push(run);
  }

  // Build quality run lookup by generation_run_id
  const qualityByGenRun = new Map<string, QualityRunRow[]>();
  for (const qr of qualityRuns) {
    if (!qr.generation_run_id) continue;
    if (!qualityByGenRun.has(qr.generation_run_id)) {
      qualityByGenRun.set(qr.generation_run_id, []);
    }
    qualityByGenRun.get(qr.generation_run_id)!.push(qr);
  }

  // Ensure all known templates appear
  for (const t of templateLabels) {
    if (!byTemplate.has(t.templateKey)) {
      byTemplate.set(t.templateKey, []);
    }
  }

  const templates: TemplateScore[] = [];

  const templateKeys = Array.from(byTemplate.keys());
  for (const templateKey of templateKeys) {
    const runs = byTemplate.get(templateKey) ?? [];
    const totalRuns = runs.length;
    const completedRuns = runs.filter((r: GenerationRunRow) => r.status === "completed").length;
    const failedRuns = runs.filter((r: GenerationRunRow) => r.status === "failed").length;
    const approvedRuns = runs.filter((r: GenerationRunRow) => r.review_status === "approved").length;
    const rejectedRuns = runs.filter((r: GenerationRunRow) => r.review_status === "rejected").length;
    const promotedRuns = runs.filter((r: GenerationRunRow) => r.promoted_at != null).length;

    const promotedWithTag = runs
      .filter((r: GenerationRunRow) => r.baseline_tag != null && r.promoted_at != null)
      .sort((a: GenerationRunRow, b: GenerationRunRow) => (b.promoted_at ?? "").localeCompare(a.promoted_at ?? ""));
    const latestBaselineTag = promotedWithTag[0]?.baseline_tag ?? null;

    const lastApproved = runs
      .filter((r: GenerationRunRow) => r.review_status === "approved" && r.reviewed_at)
      .sort((a: GenerationRunRow, b: GenerationRunRow) => (b.reviewed_at ?? "").localeCompare(a.reviewed_at ?? ""))
      [0]?.reviewed_at ?? null;

    const lastPromoted = promotedWithTag[0]?.promoted_at ?? null;

    // Quality metrics: collect quality runs linked to this template's generation runs
    let qualityTotalRuns = 0;
    let qualityPassedRuns = 0;
    for (const run of runs) {
      if (!run.id) continue;
      const qrs = qualityByGenRun.get(run.id);
      if (!qrs) continue;
      for (const qr of qrs) {
        qualityTotalRuns++;
        if (qr.status === "passed") qualityPassedRuns++;
      }
    }

    templates.push({
      templateKey,
      label: labelMap.get(templateKey) ?? templateKey,
      totalRuns,
      completedRuns,
      failedRuns,
      greenRate: totalRuns > 0 ? Math.round((completedRuns / totalRuns) * 100) : 0,
      approvedRuns,
      rejectedRuns,
      promotedRuns,
      latestBaselineTag,
      qualityPassRate: qualityTotalRuns > 0 ? Math.round((qualityPassedRuns / qualityTotalRuns) * 100) : 0,
      qualityTotalRuns,
      qualityPassedRuns,
      promotionRate: approvedRuns > 0 ? Math.round((promotedRuns / approvedRuns) * 100) : 0,
      blueprintReviewStatus: bpStatusMap.get(templateKey) ?? null,
      lastApprovedAt: lastApproved,
      lastPromotedAt: lastPromoted,
    });
  }

  // Sort by templateKey for stable order
  templates.sort((a, b) => a.templateKey.localeCompare(b.templateKey));

  return {
    templates,
    generatedAt: new Date().toISOString(),
  };
}
