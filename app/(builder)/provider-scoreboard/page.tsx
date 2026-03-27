import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils/cn";
import { Zap, Globe } from "lucide-react";
import { createAdminClient } from "@/lib/db/supabase/admin";
import { buildProviderScoreboard } from "@/lib/providers/provider-scoreboard";
import type { GenerationStep } from "@/types/generation-run";
import { requireTenantUser } from "@/lib/auth/current-user";

type ProviderTaskMetric = {
  provider: string;
  taskKind: string;
  totalSteps: number;
  completedSteps: number;
  failedSteps: number;
  successRate: number;
  fallbackCount: number;
  fallbackRate: number;
  rerunCount: number;
  rerunRate: number;
  avgDurationMs: number;
  p50DurationMs: number;
  p95DurationMs: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  totalCostUsd: number;
  avgCostPerStep: number;
  promotedSteps: number;
  promotedStepRate: number;
  fallbackReasons: string[];
};

type TemplateProviderSummary = {
  templateKey: string;
  totalRuns: number;
  completedRuns: number;
  promotedRuns: number;
  promotionRate: number;
  totalCostUsd: number;
  avgCostPerRun: number;
  stepMetrics: ProviderTaskMetric[];
};

type ProviderScoreboardData = {
  templates: TemplateProviderSummary[];
  globalMetrics: ProviderTaskMetric[];
  generatedAt: string;
};

function formatDuration(ms: number): string {
  if (ms === 0) return "-";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatTokens(n: number): string {
  if (n === 0) return "-";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatCost(usd: number): string {
  if (usd === 0) return "-";
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

function rateColor(rate: number): string {
  if (rate >= 90) return "text-emerald-600";
  if (rate >= 70) return "text-amber-600";
  return "text-red-600";
}

function MetricTable({
  metrics,
  title,
}: {
  metrics: ProviderTaskMetric[];
  title: string;
}) {
  if (metrics.length === 0) return null;

  const sorted = [...metrics].sort(
    (a, b) =>
      a.provider.localeCompare(b.provider) ||
      a.taskKind.localeCompare(b.taskKind)
  );

  return (
    <div>
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b bg-muted/30">
              <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">
                プロバイダー
              </th>
              <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">
                タスク
              </th>
              <th className="px-3 py-2.5 text-right font-medium text-muted-foreground">
                成功
              </th>
              <th className="px-3 py-2.5 text-right font-medium text-muted-foreground">
                昇格
              </th>
              <th className="px-3 py-2.5 text-right font-medium text-muted-foreground">
                フォールバック
              </th>
              <th className="px-3 py-2.5 text-right font-medium text-muted-foreground">
                平均
              </th>
              <th className="px-3 py-2.5 text-right font-medium text-muted-foreground">
                p95
              </th>
              <th className="px-3 py-2.5 text-right font-medium text-muted-foreground">
                トークン
              </th>
              <th className="px-3 py-2.5 text-right font-medium text-muted-foreground">
                コスト
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((m) => (
              <tr
                key={`${m.provider}-${m.taskKind}`}
                className="border-b last:border-0 transition-colors hover:bg-muted/20"
              >
                <td className="px-3 py-2.5 font-medium">{m.provider}</td>
                <td className="px-3 py-2.5 text-muted-foreground">
                  {m.taskKind}
                </td>
                <td
                  className={cn(
                    "px-3 py-2.5 text-right font-mono tabular-nums",
                    rateColor(m.successRate)
                  )}
                >
                  {m.successRate}%
                  <span className="ml-1 text-muted-foreground">
                    ({m.completedSteps}/{m.totalSteps})
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                  {m.promotedSteps > 0 ? (
                    <span className="text-emerald-600">
                      {m.promotedStepRate}%{" "}
                      <span className="text-muted-foreground">
                        ({m.promotedSteps})
                      </span>
                    </span>
                  ) : (
                    <span className="text-muted-foreground">0</span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                  {m.fallbackCount > 0 ? (
                    <span
                      className="text-amber-600 cursor-help"
                      title={
                        m.fallbackReasons.join("\n") || undefined
                      }
                    >
                      {m.fallbackRate}%{" "}
                      <span className="text-muted-foreground">
                        ({m.fallbackCount})
                      </span>
                    </span>
                  ) : (
                    <span className="text-muted-foreground">0</span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-right font-mono tabular-nums text-muted-foreground">
                  {formatDuration(m.avgDurationMs)}
                </td>
                <td className="px-3 py-2.5 text-right font-mono tabular-nums text-muted-foreground">
                  {formatDuration(m.p95DurationMs)}
                </td>
                <td
                  className="px-3 py-2.5 text-right font-mono tabular-nums text-muted-foreground cursor-help"
                  title={`in: ${formatTokens(m.totalInputTokens)} / out: ${formatTokens(m.totalOutputTokens)}`}
                >
                  {formatTokens(m.totalTokens)}
                </td>
                <td
                  className="px-3 py-2.5 text-right font-mono tabular-nums text-muted-foreground cursor-help"
                  title={`avg: ${formatCost(m.avgCostPerStep)}/step`}
                >
                  {formatCost(m.totalCostUsd)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

async function fetchProviderScoreboardData(): Promise<ProviderScoreboardData> {
  const { tenantId } = await requireTenantUser();
  const supabase = createAdminClient();

  // Fetch tenant-scoped project IDs
  const { data: projects } = await supabase
    .from("projects")
    .select("id")
    .eq("tenant_id", tenantId);

  const projectIds = (projects ?? []).map((p: { id: string }) => p.id);
  const safeIds = projectIds.length > 0 ? projectIds : ["__none__"];

  let runs: Record<string, unknown>[] = [];
  const { data: fullRuns, error: fullErr } = await supabase
    .from("generation_runs")
    .select("id, template_key, status, steps_json, promoted_at, review_status")
    .in("project_id", safeIds)
    .order("started_at", { ascending: false });

  if (fullErr && fullErr.message.includes("does not exist")) {
    const { data: coreRuns, error: coreErr } = await supabase
      .from("generation_runs")
      .select("id, template_key, status, steps_json")
      .in("project_id", safeIds)
      .order("started_at", { ascending: false });

    if (coreErr) throw new Error("Failed to fetch generation runs");
    runs = coreRuns ?? [];
  } else if (fullErr) {
    throw new Error("Failed to fetch generation runs");
  } else {
    runs = fullRuns ?? [];
  }

  return buildProviderScoreboard(
    runs.map((r: Record<string, unknown>) => ({
      id: r.id as string,
      template_key: r.template_key as string,
      status: r.status as string,
      steps_json: (r.steps_json ?? []) as GenerationStep[],
      promoted_at: (r.promoted_at as string) ?? null,
      review_status: (r.review_status as string) ?? "pending",
    }))
  );
}

export default async function ProviderScoreboardPage() {
  let data: ProviderScoreboardData;
  try {
    data = await fetchProviderScoreboardData();
  } catch {
    return (
      <div className="space-y-6 animate-fade-in">
        <PageHeader title="プロバイダースコアボード" />
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-sm text-destructive">
              読み込みに失敗しました
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in">
      <PageHeader
        title="プロバイダースコアボード"
        description={`Factory Intelligence v1 — 最終更新 ${new Date(data.generatedAt).toLocaleString("ja-JP")}`}
      />

      {/* Global Metrics */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <Globe className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle>グローバル指標</CardTitle>
              <CardDescription>
                全テンプレートの集計パフォーマンス
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <MetricTable
            metrics={data.globalMetrics}
            title="プロバイダー × タスク種別"
          />
        </CardContent>
      </Card>

      {/* Per-Template */}
      {data.templates.map((t, index) => (
        <Card
          key={t.templateKey}
          style={{ animationDelay: `${index * 60}ms` }}
        >
          <CardHeader>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted">
                  <Zap className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <CardTitle>{t.templateKey}</CardTitle>
                  <CardDescription>
                    {t.completedRuns}/{t.totalRuns} 完了
                    {t.promotedRuns > 0 &&
                      ` — ${t.promotedRuns} 昇格 (${t.promotionRate}%)`}
                    {t.totalCostUsd > 0 &&
                      ` — ${formatCost(t.totalCostUsd)} 合計 (${formatCost(t.avgCostPerRun)}/回)`}
                  </CardDescription>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <MetricTable metrics={t.stepMetrics} title="ステップ指標" />
          </CardContent>
        </Card>
      ))}

      {data.templates.length === 0 && (
        <Card>
          <EmptyState
            icon={Zap}
            title="まだ生成履歴がありません"
            description="生成パイプラインを実行するとプロバイダーの指標が表示されます。"
          />
        </Card>
      )}
    </div>
  );
}
