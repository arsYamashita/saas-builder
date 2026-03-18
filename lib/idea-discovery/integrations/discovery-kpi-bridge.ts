/**
 * Discovery KPI Bridge
 *
 * Computes KPI metrics from Idea Discovery data and provides them
 * to the SaaS Builder's Strategic KPI Layer.
 *
 * KPIs tracked:
 *   - discovered_ideas_total: total ideas in the pipeline
 *   - idea_conversion_rate: % of ideas that become projects
 *   - high_urgency_ratio: % of high-urgency ideas
 *   - template_match_rate: % of ideas that match existing templates
 *   - gap_detection_count: ideas that detected template gaps
 *   - source_diversity: number of active data sources producing ideas
 *   - avg_analysis_confidence: mean confidence of AI analysis
 *   - discovery_freshness: % of ideas less than 7 days old
 *
 * All KPIs are deterministic and explainable.
 */

import type {
  AnalyzedIdea,
  DiscoveryFeedItem,
  DiscoveryReport,
} from "../core/types";
import type {
  KpiRecord,
  KpiStatus,
} from "../../factory/strategic-kpi-layer";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DiscoveryKpiInputs {
  analyzedIdeas: AnalyzedIdea[];
  feedItems: DiscoveryFeedItem[];
  projectsCreatedFromIdeas: number;
  lastReport?: DiscoveryReport | null;
}

export interface DiscoveryKpiSummary {
  kpis: KpiRecord[];
  overallStatus: KpiStatus;
  highlights: string[];
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

function classifyRate(
  value: number,
  thresholds: { strong: number; healthy: number; warning: number },
): KpiStatus {
  if (value >= thresholds.strong) return "strong";
  if (value >= thresholds.healthy) return "healthy";
  if (value >= thresholds.warning) return "warning";
  return "weak";
}

function classifyCount(
  value: number,
  thresholds: { strong: number; healthy: number; warning: number },
): KpiStatus {
  if (value >= thresholds.strong) return "strong";
  if (value >= thresholds.healthy) return "healthy";
  if (value >= thresholds.warning) return "warning";
  return "weak";
}

// ---------------------------------------------------------------------------
// KPI Computation
// ---------------------------------------------------------------------------

export function computeDiscoveryKpis(inputs: DiscoveryKpiInputs): KpiRecord[] {
  const { analyzedIdeas, feedItems, projectsCreatedFromIdeas } = inputs;
  const kpis: KpiRecord[] = [];

  // 1. Total discovered ideas
  const totalIdeas = analyzedIdeas.length;
  kpis.push({
    kpiKey: "discovery_ideas_total",
    category: "strategy_scenario",
    label: "発見アイデア総数",
    value: totalIdeas,
    unit: "件",
    status: classifyCount(totalIdeas, { strong: 50, healthy: 20, warning: 5 }),
    reasons: [
      totalIdeas === 0
        ? "アイデアがまだ発見されていません"
        : `${totalIdeas}件のアイデアがパイプラインに存在`,
    ],
  });

  // 2. Idea-to-project conversion rate
  const conversionRate =
    totalIdeas > 0
      ? Math.round((projectsCreatedFromIdeas / totalIdeas) * 100)
      : 0;
  kpis.push({
    kpiKey: "discovery_conversion_rate",
    category: "strategy_scenario",
    label: "アイデア→プロジェクト変換率",
    value: conversionRate,
    unit: "%",
    status: classifyRate(conversionRate, {
      strong: 20,
      healthy: 10,
      warning: 3,
    }),
    reasons: [
      `${projectsCreatedFromIdeas}/${totalIdeas}件のアイデアがプロジェクト化`,
      conversionRate >= 20
        ? "高い変換率: 発見品質が良好"
        : conversionRate < 3
          ? "変換率が低い: フィルタリング精度の改善を検討"
          : "標準的な変換率",
    ],
  });

  // 3. High urgency ratio
  const highUrgency = feedItems.filter(
    (item) => item.idea.quickFilter.urgency === "high",
  ).length;
  const highUrgencyRate =
    feedItems.length > 0
      ? Math.round((highUrgency / feedItems.length) * 100)
      : 0;
  kpis.push({
    kpiKey: "discovery_high_urgency_ratio",
    category: "strategy_scenario",
    label: "高緊急度アイデア比率",
    value: highUrgencyRate,
    unit: "%",
    status: classifyRate(highUrgencyRate, {
      strong: 30,
      healthy: 15,
      warning: 5,
    }),
    reasons: [
      `${highUrgency}/${feedItems.length}件が高緊急度`,
      highUrgencyRate >= 30
        ? "多くのホットなアイデアを検出中"
        : "高緊急度のアイデアが少ない: キーワード調整を検討",
    ],
  });

  // 4. Template match rate
  const matched = feedItems.filter(
    (item) => item.templateMatch.type === "matched",
  ).length;
  const matchRate =
    feedItems.length > 0
      ? Math.round((matched / feedItems.length) * 100)
      : 0;
  kpis.push({
    kpiKey: "discovery_template_match_rate",
    category: "strategy_scenario",
    label: "テンプレートマッチ率",
    value: matchRate,
    unit: "%",
    status: classifyRate(matchRate, {
      strong: 60,
      healthy: 40,
      warning: 20,
    }),
    reasons: [
      `${matched}/${feedItems.length}件が既存テンプレートにマッチ`,
      matchRate < 20
        ? "マッチ率が低い: 新テンプレートの開発が必要"
        : matchRate >= 60
          ? "既存テンプレートが多くのニーズをカバー"
          : "一部のアイデアにギャップあり",
    ],
  });

  // 5. Gap detection count
  const gaps = feedItems.filter(
    (item) => item.templateMatch.type === "gap_detected",
  ).length;
  kpis.push({
    kpiKey: "discovery_gap_count",
    category: "strategy_scenario",
    label: "テンプレートギャップ検出数",
    value: gaps,
    unit: "件",
    status:
      gaps > 0
        ? classifyCount(gaps, { strong: 10, healthy: 3, warning: 1 })
        : "healthy", // No gaps is fine
    reasons: [
      gaps === 0
        ? "ギャップなし: 現在のテンプレートが十分"
        : `${gaps}件のギャップを検出 → 新テンプレート候補`,
    ],
  });

  // 6. Source diversity
  const activeSources = new Set(feedItems.map((item) => item.idea.source));
  const sourceCount = activeSources.size;
  kpis.push({
    kpiKey: "discovery_source_diversity",
    category: "strategy_scenario",
    label: "アクティブデータソース数",
    value: sourceCount,
    unit: "ソース",
    status: classifyCount(sourceCount, {
      strong: 4,
      healthy: 3,
      warning: 1,
    }),
    reasons: [
      `${sourceCount}種類のソースからデータ収集中`,
      sourceCount >= 4
        ? "十分な多様性"
        : "ソースを追加して多角的に発見",
      ...(activeSources.size > 0
        ? [`アクティブ: ${Array.from(activeSources).join(", ")}`]
        : []),
    ],
  });

  // 7. Average analysis confidence
  const confidences = feedItems
    .map((item) => item.templateMatch.confidence)
    .filter((c) => c > 0);
  const avgConfidence =
    confidences.length > 0
      ? Math.round(
          confidences.reduce((sum, c) => sum + c, 0) / confidences.length,
        )
      : 0;
  kpis.push({
    kpiKey: "discovery_avg_confidence",
    category: "strategy_scenario",
    label: "平均分析信頼度",
    value: avgConfidence,
    unit: "%",
    status: classifyRate(avgConfidence, {
      strong: 70,
      healthy: 50,
      warning: 30,
    }),
    reasons: [
      `${confidences.length}件の分析結果の平均信頼度`,
      avgConfidence >= 70
        ? "高品質な分析結果"
        : avgConfidence < 30
          ? "分析精度が低い: プロンプト調整を検討"
          : "標準的な分析精度",
    ],
  });

  // 8. Discovery freshness
  const now = Date.now();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  const freshIdeas = analyzedIdeas.filter((idea) => {
    const age = now - new Date(idea.analyzedAt).getTime();
    return age < sevenDaysMs;
  }).length;
  const freshRate =
    totalIdeas > 0 ? Math.round((freshIdeas / totalIdeas) * 100) : 0;
  kpis.push({
    kpiKey: "discovery_freshness",
    category: "strategy_scenario",
    label: "アイデア鮮度（7日以内）",
    value: freshRate,
    unit: "%",
    status: classifyRate(freshRate, {
      strong: 50,
      healthy: 25,
      warning: 10,
    }),
    reasons: [
      `${freshIdeas}/${totalIdeas}件が過去7日以内`,
      freshRate < 10
        ? "古いデータが多い: 定期実行を設定してください"
        : "十分な鮮度",
    ],
  });

  return kpis;
}

// ---------------------------------------------------------------------------
// Summary builder
// ---------------------------------------------------------------------------

export function buildDiscoveryKpiSummary(
  inputs: DiscoveryKpiInputs,
): DiscoveryKpiSummary {
  const kpis = computeDiscoveryKpis(inputs);

  // Determine overall status
  const statuses = kpis.map((k) => k.status);
  const statusWeights: Record<KpiStatus, number> = {
    strong: 3,
    healthy: 2,
    warning: 1,
    weak: 0,
  };
  const avgWeight =
    statuses.length > 0
      ? statuses.reduce((sum, s) => sum + statusWeights[s], 0) /
        statuses.length
      : 0;

  const overallStatus: KpiStatus =
    avgWeight >= 2.5
      ? "strong"
      : avgWeight >= 1.5
        ? "healthy"
        : avgWeight >= 0.5
          ? "warning"
          : "weak";

  // Generate highlights
  const highlights: string[] = [];
  const totalIdeas = inputs.analyzedIdeas.length;
  if (totalIdeas > 0) {
    highlights.push(`${totalIdeas}件のアイデアを発見済み`);
  }
  if (inputs.projectsCreatedFromIdeas > 0) {
    highlights.push(
      `${inputs.projectsCreatedFromIdeas}件がプロジェクト化`,
    );
  }
  const gaps = inputs.feedItems.filter(
    (item) => item.templateMatch.type === "gap_detected",
  ).length;
  if (gaps > 0) {
    highlights.push(`${gaps}件のテンプレートギャップを検出`);
  }

  return {
    kpis,
    overallStatus,
    highlights,
    generatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

export function formatDiscoveryKpiSummary(
  summary: DiscoveryKpiSummary,
): string {
  const STATUS_ICONS: Record<KpiStatus, string> = {
    strong: "[STRONG]",
    healthy: "[HEALTHY]",
    warning: "[WARNING]",
    weak: "[WEAK]",
  };

  const lines: string[] = [];
  lines.push(
    `── Idea Discovery KPI ${STATUS_ICONS[summary.overallStatus]} ──`,
  );

  if (summary.highlights.length > 0) {
    lines.push(`  Highlights: ${summary.highlights.join(" / ")}`);
  }

  for (const kpi of summary.kpis) {
    lines.push(
      `  ${STATUS_ICONS[kpi.status]} ${kpi.label}: ${kpi.value}${kpi.unit}`,
    );
    for (const reason of kpi.reasons) {
      lines.push(`    - ${reason}`);
    }
  }

  lines.push(`  Generated: ${summary.generatedAt}`);
  return lines.join("\n");
}
