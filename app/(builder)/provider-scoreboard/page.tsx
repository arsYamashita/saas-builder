"use client";

import { useCallback, useEffect, useState } from "react";

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
  if (rate >= 90) return "text-green-700";
  if (rate >= 70) return "text-amber-600";
  return "text-red-600";
}

function MetricTable({ metrics, title }: { metrics: ProviderTaskMetric[]; title: string }) {
  if (metrics.length === 0) return null;

  const sorted = [...metrics].sort((a, b) =>
    a.provider.localeCompare(b.provider) || a.taskKind.localeCompare(b.taskKind)
  );

  return (
    <div>
      <h3 className="text-sm font-semibold mb-2 text-gray-600">{title}</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b text-left text-gray-500">
              <th className="py-1.5 pr-3">Provider</th>
              <th className="py-1.5 pr-3">Task</th>
              <th className="py-1.5 pr-3 text-right">Success</th>
              <th className="py-1.5 pr-3 text-right">Promoted</th>
              <th className="py-1.5 pr-3 text-right">Fallback</th>
              <th className="py-1.5 pr-3 text-right">Avg</th>
              <th className="py-1.5 pr-3 text-right">p95</th>
              <th className="py-1.5 pr-3 text-right">Tokens</th>
              <th className="py-1.5 text-right">Cost</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((m) => (
              <tr key={`${m.provider}-${m.taskKind}`} className="border-b border-gray-100">
                <td className="py-1.5 pr-3 font-medium">{m.provider}</td>
                <td className="py-1.5 pr-3">{m.taskKind}</td>
                <td className={`py-1.5 pr-3 text-right font-mono ${rateColor(m.successRate)}`}>
                  {m.successRate}%
                  <span className="text-gray-400 ml-1">({m.completedSteps}/{m.totalSteps})</span>
                </td>
                <td className="py-1.5 pr-3 text-right font-mono">
                  {m.promotedSteps > 0 ? (
                    <span className="text-green-700">{m.promotedStepRate}% ({m.promotedSteps})</span>
                  ) : (
                    <span className="text-gray-300">0</span>
                  )}
                </td>
                <td className="py-1.5 pr-3 text-right font-mono">
                  {m.fallbackCount > 0 ? (
                    <span className="text-amber-600" title={m.fallbackReasons.join("\n") || undefined}>
                      {m.fallbackRate}% ({m.fallbackCount})
                    </span>
                  ) : (
                    <span className="text-gray-300">0</span>
                  )}
                </td>
                <td className="py-1.5 pr-3 text-right font-mono text-gray-600">
                  {formatDuration(m.avgDurationMs)}
                </td>
                <td className="py-1.5 pr-3 text-right font-mono text-gray-600">
                  {formatDuration(m.p95DurationMs)}
                </td>
                <td className="py-1.5 pr-3 text-right font-mono text-gray-600" title={`in: ${formatTokens(m.totalInputTokens)} / out: ${formatTokens(m.totalOutputTokens)}`}>
                  {formatTokens(m.totalTokens)}
                </td>
                <td className="py-1.5 text-right font-mono text-gray-600" title={`avg: ${formatCost(m.avgCostPerStep)}/step`}>
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
      <main className="max-w-6xl mx-auto p-6">
        <p className="text-gray-500">Loading...</p>
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="max-w-6xl mx-auto p-6">
        <p className="text-red-500">{error || "Failed to load"}</p>
      </main>
    );
  }

  return (
    <main className="max-w-6xl mx-auto p-6 space-y-8">
      <div>
        <h1 className="text-xl font-bold">Provider Scoreboard</h1>
        <p className="text-xs text-gray-500">
          Factory Intelligence v1 — Generated {new Date(data.generatedAt).toLocaleString("ja-JP")}
        </p>
      </div>

      {/* Global Metrics */}
      <section className="border rounded-xl p-4 space-y-3">
        <h2 className="font-semibold">Global — 全テンプレート集計</h2>
        <MetricTable metrics={data.globalMetrics} title="Provider × TaskKind" />
      </section>

      {/* Per-Template */}
      {data.templates.map((t) => (
        <section key={t.templateKey} className="border rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold">{t.templateKey}</h2>
              <p className="text-xs text-gray-400">
                {t.completedRuns}/{t.totalRuns} completed — {t.promotedRuns} promoted
                {t.promotionRate > 0 && ` (${t.promotionRate}%)`}
                {t.totalCostUsd > 0 && ` — ${formatCost(t.totalCostUsd)} total (${formatCost(t.avgCostPerRun)}/run)`}
              </p>
            </div>
          </div>
          <MetricTable metrics={t.stepMetrics} title="Step Metrics" />
        </section>
      ))}

      {data.templates.length === 0 && (
        <p className="text-sm text-gray-500">まだ生成実行がありません。</p>
      )}
    </main>
  );
}
