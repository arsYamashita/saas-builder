"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils/cn";
import { Zap, Globe, Clock } from "lucide-react";

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
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
        {title}
      </h3>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b bg-muted/30">
              <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">
                Provider
              </th>
              <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">
                Task
              </th>
              <th className="px-3 py-2.5 text-right font-medium text-muted-foreground">
                Success
              </th>
              <th className="px-3 py-2.5 text-right font-medium text-muted-foreground">
                Promoted
              </th>
              <th className="px-3 py-2.5 text-right font-medium text-muted-foreground">
                Fallback
              </th>
              <th className="px-3 py-2.5 text-right font-medium text-muted-foreground">
                Avg
              </th>
              <th className="px-3 py-2.5 text-right font-medium text-muted-foreground">
                p95
              </th>
              <th className="px-3 py-2.5 text-right font-medium text-muted-foreground">
                Tokens
              </th>
              <th className="px-3 py-2.5 text-right font-medium text-muted-foreground">
                Cost
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
                  <span className="ml-1 text-muted-foreground/60">
                    ({m.completedSteps}/{m.totalSteps})
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                  {m.promotedSteps > 0 ? (
                    <span className="text-emerald-600">
                      {m.promotedStepRate}%{" "}
                      <span className="text-muted-foreground/60">
                        ({m.promotedSteps})
                      </span>
                    </span>
                  ) : (
                    <span className="text-muted-foreground/40">0</span>
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
                      <span className="text-muted-foreground/60">
                        ({m.fallbackCount})
                      </span>
                    </span>
                  ) : (
                    <span className="text-muted-foreground/40">0</span>
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

export default function ProviderScoreboardPage() {
  const [data, setData] = useState<ProviderScoreboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch_ = useCallback(async () => {
    try {
      const res = await fetch("/api/provider-scoreboard");
      if (!res.ok) throw new Error("Failed to fetch");
      setData(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch_();
  }, [fetch_]);

  if (loading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="space-y-2">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-6 animate-fade-in">
        <PageHeader title="Provider Scoreboard" />
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-sm text-destructive">
              {error || "Failed to load"}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in">
      <PageHeader
        title="Provider Scoreboard"
        description={`Factory Intelligence v1 -- Last updated ${new Date(data.generatedAt).toLocaleString("ja-JP")}`}
      />

      {/* Global Metrics */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <Globe className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle>Global Metrics</CardTitle>
              <CardDescription>
                Aggregated performance across all templates
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <MetricTable
            metrics={data.globalMetrics}
            title="Provider x Task Kind"
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
                    {t.completedRuns}/{t.totalRuns} completed
                    {t.promotedRuns > 0 &&
                      ` -- ${t.promotedRuns} promoted (${t.promotionRate}%)`}
                    {t.totalCostUsd > 0 &&
                      ` -- ${formatCost(t.totalCostUsd)} total (${formatCost(t.avgCostPerRun)}/run)`}
                  </CardDescription>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <MetricTable metrics={t.stepMetrics} title="Step Metrics" />
          </CardContent>
        </Card>
      ))}

      {data.templates.length === 0 && (
        <Card>
          <EmptyState
            icon={Zap}
            title="No generation runs yet"
            description="Run a generation pipeline to see provider performance metrics."
          />
        </Card>
      )}
    </div>
  );
}
