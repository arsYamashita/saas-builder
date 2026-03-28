import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils/cn";
import {
  BarChart3,
  CheckCircle2,
  XCircle,
  Trophy,
  Clock,
} from "lucide-react";
import { createAdminClient } from "@/lib/db/supabase/admin";
import { buildScoreboard } from "@/lib/providers/template-scoreboard";
import { TEMPLATE_REGISTRY } from "@/lib/templates/template-registry";
import { requireTenantUser } from "@/lib/auth/current-user";

type TemplateScore = {
  templateKey: string;
  label: string;
  totalRuns: number;
  completedRuns: number;
  failedRuns: number;
  greenRate: number;
  approvedRuns: number;
  rejectedRuns: number;
  promotedRuns: number;
  latestBaselineTag: string | null;
  qualityPassRate: number;
  qualityTotalRuns: number;
  qualityPassedRuns: number;
  promotionRate: number;
  blueprintReviewStatus: string | null;
  lastApprovedAt: string | null;
  lastPromotedAt: string | null;
};

function RateCircle({ rate, size = "lg" }: { rate: number; size?: "sm" | "lg" }) {
  const color =
    rate >= 90
      ? "text-emerald-600 border-emerald-200 bg-emerald-50"
      : rate >= 70
        ? "text-amber-600 border-amber-200 bg-amber-50"
        : "text-red-600 border-red-200 bg-red-50";

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-full border-2",
        color,
        size === "lg" ? "h-20 w-20" : "h-14 w-14"
      )}
    >
      <span className={cn("font-bold", size === "lg" ? "text-xl" : "text-base")}>
        {rate}%
      </span>
    </div>
  );
}

async function fetchScoreboardData() {
  const { tenantId } = await requireTenantUser();
  const supabase = createAdminClient();

  // Fetch tenant-scoped projects first
  const { data: projects } = await supabase
    .from("projects")
    .select("id, template_key")
    .eq("tenant_id", tenantId);

  const projectIds = (projects ?? []).map((p: { id: string }) => p.id);

  // If tenant has no projects, return empty scoreboard immediately
  if (projectIds.length === 0) {
    const templateLabels = Object.entries(TEMPLATE_REGISTRY).map(
      ([key, entry]) => ({ templateKey: key, label: entry.label })
    );
    return buildScoreboard([], [], templateLabels, []);
  }

  const [
    { data: generationRuns, error: grErr },
    { data: blueprints },
  ] = await Promise.all([
    supabase
      .from("generation_runs")
      .select("id, template_key, status, review_status, reviewed_at, promoted_at, baseline_tag")
      .in("project_id", projectIds)
      .order("started_at", { ascending: false }),
    supabase
      .from("blueprints")
      .select("project_id, review_status, version")
      .in("project_id", projectIds)
      .order("version", { ascending: false }),
  ]);

  if (grErr) throw new Error("Failed to fetch generation runs");

  // Fetch quality_runs scoped to tenant's generation runs
  const runIds = (generationRuns ?? []).map((r) => r.id);
  let qualityRuns: { generation_run_id: string; status: string }[] = [];

  if (runIds.length > 0) {
    const { data: qr, error: qrErr } = await supabase
      .from("quality_runs")
      .select("generation_run_id, status")
      .in("generation_run_id", runIds)
      .order("started_at", { ascending: false });

    if (qrErr) throw new Error("Failed to fetch quality runs");
    qualityRuns = qr ?? [];
  }

  const bpByTemplate = new Map<string, string | null>();
  if (projects && blueprints) {
    const projectTemplateMap = new Map(
      projects.map((p: { id: string; template_key: string }) => [p.id, p.template_key])
    );
    const seen = new Set<string>();
    for (const bp of blueprints) {
      if (seen.has(bp.project_id)) continue;
      seen.add(bp.project_id);
      const tmpl = projectTemplateMap.get(bp.project_id);
      if (tmpl && !bpByTemplate.has(tmpl)) {
        bpByTemplate.set(tmpl, bp.review_status ?? "pending");
      }
    }
  }

  const templateLabels = Object.entries(TEMPLATE_REGISTRY).map(
    ([key, entry]) => ({
      templateKey: key,
      label: entry.label,
    })
  );

  const blueprintStatuses = Array.from(bpByTemplate.entries()).map(([k, v]) => ({
    project_template_key: k,
    review_status: v,
  }));

  return buildScoreboard(
    (generationRuns ?? []).map((r) => ({
      id: r.id,
      template_key: r.template_key,
      status: r.status,
      review_status: r.review_status ?? "pending",
      reviewed_at: r.reviewed_at ?? null,
      promoted_at: r.promoted_at ?? null,
      baseline_tag: r.baseline_tag ?? null,
    })),
    (qualityRuns ?? []).map((q) => ({
      generation_run_id: q.generation_run_id,
      status: q.status,
    })),
    templateLabels,
    blueprintStatuses
  );
}

export default async function ScoreboardPage() {
  let data: { templates: TemplateScore[]; generatedAt: string };
  try {
    data = await fetchScoreboardData();
  } catch {
    return (
      <div className="space-y-6 animate-fade-in">
        <PageHeader title="テンプレートスコアボード" />
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-sm text-destructive">
              スコアボードの読み込みに失敗しました
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in">
      <PageHeader
        title="テンプレートスコアボード"
        description={`最終更新 ${new Date(data.generatedAt).toLocaleString("ja-JP")}`}
      />

      {data.templates.length === 0 ? (
        <Card>
          <EmptyState
            icon={BarChart3}
            title="まだ生成履歴がありません"
            description="生成パイプラインを実行すると、テンプレートのスコアと指標がここに表示されます。"
          />
        </Card>
      ) : (
        <div className="space-y-6">
          {data.templates.map((t, index) => (
            <Card
              key={t.templateKey}
              className="overflow-hidden"
              style={{ animationDelay: `${index * 80}ms` }}
            >
              <CardHeader className="pb-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                      <BarChart3 className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{t.label}</CardTitle>
                      <p className="text-xs text-muted-foreground font-mono">
                        {t.templateKey}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {t.blueprintReviewStatus === "approved" ? (
                      <Badge variant="success" className="flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        ブループリント承認済み
                      </Badge>
                    ) : t.blueprintReviewStatus === "rejected" ? (
                      <Badge variant="destructive" className="flex items-center gap-1">
                        <XCircle className="h-3 w-3" />
                        ブループリント却下
                      </Badge>
                    ) : t.blueprintReviewStatus ? (
                      <Badge variant="secondary">ブループリント保留中</Badge>
                    ) : null}
                    {t.latestBaselineTag && (
                      <Badge variant="info">{t.latestBaselineTag}</Badge>
                    )}
                  </div>
                </div>
              </CardHeader>

              <CardContent>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <div className="flex flex-col items-center gap-2 rounded-xl border p-4">
                    <RateCircle rate={t.greenRate} size="sm" />
                    <div className="text-center">
                      <p className="text-xs font-medium text-muted-foreground">
                        成功率
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t.completedRuns}/{t.totalRuns} 回
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col items-center gap-2 rounded-xl border p-4">
                    <RateCircle
                      rate={t.qualityTotalRuns > 0 ? t.qualityPassRate : 0}
                      size="sm"
                    />
                    <div className="text-center">
                      <p className="text-xs font-medium text-muted-foreground">
                        品質合格
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t.qualityTotalRuns > 0
                          ? `${t.qualityPassedRuns}/${t.qualityTotalRuns} 回`
                          : "未実行"}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col items-center gap-2 rounded-xl border p-4">
                    <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-amber-200 bg-amber-50">
                      <span className="text-base font-bold text-amber-600">
                        {t.approvedRuns}
                      </span>
                    </div>
                    <div className="text-center">
                      <p className="text-xs font-medium text-muted-foreground">
                        承認
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t.rejectedRuns} 却下
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col items-center gap-2 rounded-xl border p-4">
                    <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-indigo-200 bg-indigo-50">
                      <span className="text-base font-bold text-indigo-600">
                        {t.promotedRuns}
                      </span>
                    </div>
                    <div className="text-center">
                      <p className="text-xs font-medium text-muted-foreground">
                        昇格
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t.approvedRuns > 0
                          ? `承認の${t.promotionRate}%`
                          : `${t.failedRuns} 失敗`}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Timestamps */}
                {(t.lastApprovedAt || t.lastPromotedAt) && (
                  <div className="mt-4 flex flex-wrap gap-4 border-t pt-3">
                    {t.lastApprovedAt && (
                      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        最終承認:{" "}
                        {new Date(t.lastApprovedAt).toLocaleString("ja-JP")}
                      </span>
                    )}
                    {t.lastPromotedAt && (
                      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Trophy className="h-3 w-3" />
                        最終昇格:{" "}
                        {new Date(t.lastPromotedAt).toLocaleString("ja-JP")}
                      </span>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
