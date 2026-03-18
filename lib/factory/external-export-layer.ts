/**
 * External Connector / Export Layer v1
 *
 * Provides:
 *   1. Stable JSON exports for all major Factory artifacts
 *   2. CSV exports for tabular data (marketplace, ranking, KPI, releases)
 *   3. Filtered export by domain, category, type, stage, health state
 *   4. Export manifest describing available targets, formats, and filters
 *   5. Deterministic, read-only, auditable output
 *
 * This module NEVER mutates Factory state.
 */

import {
  buildMarketplaceReport,
  type MarketplaceReport,
  type MarketplaceItem,
} from "./template-marketplace";
import {
  buildTemplateReleaseReport,
  type TemplateReleaseReport,
  type ReleasedTemplateEntry,
} from "./template-release-management";
import {
  buildTemplateRankingReport,
  type TemplateRankingReport,
  type TemplateAnalytics,
} from "./template-analytics-ranking";
import {
  buildTemplateRecommendationReport,
  type RecommendationReport,
  type RecommendationRecord,
} from "./template-recommendation-engine";
import {
  buildPortfolioStrategyReport,
  type PortfolioStrategyReport,
  type DomainStrategyRecord,
} from "./template-portfolio-strategy";
import {
  buildScenarioReport,
  type ScenarioReport,
  type FactoryScenario,
} from "./factory-scenario-planner";
import {
  buildStrategicKpiReport,
  type StrategicKpiReport,
  type KpiRecord,
} from "./strategic-kpi-layer";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ExportTarget =
  | "marketplace"
  | "releases"
  | "ranking"
  | "recommendations"
  | "portfolio"
  | "scenarios"
  | "kpis";

export type ExportFormat = "json" | "csv";

export interface ExportFilters {
  domain?: string;
  healthState?: string;
  stage?: string;
  recommendationType?: string;
  category?: string;
  scenarioType?: string;
}

export interface ExportResult<T = unknown> {
  target: ExportTarget;
  format: ExportFormat;
  filters: ExportFilters;
  generatedAt: string;
  recordCount: number;
  records: T[];
}

export interface ExportTargetDescriptor {
  target: ExportTarget;
  label: string;
  description: string;
  formats: ExportFormat[];
  supportedFilters: string[];
}

export interface ExportManifest {
  targets: ExportTargetDescriptor[];
  generatedAt: string;
}

export interface ExportInputs {
  marketplaceReport: MarketplaceReport;
  releaseReport: TemplateReleaseReport;
  rankingReport: TemplateRankingReport;
  recommendationReport: RecommendationReport;
  portfolioReport: PortfolioStrategyReport;
  scenarioReport: ScenarioReport;
  kpiReport: StrategicKpiReport;
}

// ---------------------------------------------------------------------------
// CSV helpers
// ---------------------------------------------------------------------------

function escapeCsvField(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = typeof value === "string" ? value : JSON.stringify(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function arrayToCsvRow(fields: unknown[]): string {
  return fields.map(escapeCsvField).join(",");
}

export function recordsToCsv<T>(
  headers: string[],
  records: T[],
  fieldExtractor: (record: T) => unknown[],
): string {
  const lines: string[] = [arrayToCsvRow(headers)];
  for (const record of records) {
    lines.push(arrayToCsvRow(fieldExtractor(record)));
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Manifest
// ---------------------------------------------------------------------------

const TARGET_DESCRIPTORS: ExportTargetDescriptor[] = [
  {
    target: "marketplace",
    label: "Marketplace Catalog",
    description: "Template marketplace items with status, health, and maturity",
    formats: ["json", "csv"],
    supportedFilters: ["domain", "healthState"],
  },
  {
    target: "releases",
    label: "Release Catalog",
    description: "Template release catalog with stage and signals",
    formats: ["json", "csv"],
    supportedFilters: ["stage", "domain"],
  },
  {
    target: "ranking",
    label: "Template Ranking",
    description: "Template analytics and ranking scores",
    formats: ["json", "csv"],
    supportedFilters: ["domain", "healthState"],
  },
  {
    target: "recommendations",
    label: "Template Recommendations",
    description: "Template recommendation records by type, domain, and use case",
    formats: ["json"],
    supportedFilters: ["domain", "recommendationType"],
  },
  {
    target: "portfolio",
    label: "Portfolio Strategy",
    description: "Domain-level portfolio strategy records",
    formats: ["json"],
    supportedFilters: ["domain"],
  },
  {
    target: "scenarios",
    label: "Scenario Plans",
    description: "Factory scenario plans with steps and impact estimates",
    formats: ["json"],
    supportedFilters: ["domain", "scenarioType"],
  },
  {
    target: "kpis",
    label: "Strategic KPIs",
    description: "Strategic KPI metrics across 5 categories",
    formats: ["json", "csv"],
    supportedFilters: ["category"],
  },
];

export function buildExportManifest(): ExportManifest {
  return {
    targets: TARGET_DESCRIPTORS,
    generatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Default inputs builder
// ---------------------------------------------------------------------------

function buildDefaultInputs(): ExportInputs {
  return {
    marketplaceReport: buildMarketplaceReport(),
    releaseReport: buildTemplateReleaseReport(),
    rankingReport: buildTemplateRankingReport(),
    recommendationReport: buildTemplateRecommendationReport(),
    portfolioReport: buildPortfolioStrategyReport(),
    scenarioReport: buildScenarioReport(),
    kpiReport: buildStrategicKpiReport(),
  };
}

// ---------------------------------------------------------------------------
// Export: Marketplace Catalog
// ---------------------------------------------------------------------------

export function exportMarketplaceCatalog(
  filters?: ExportFilters,
  overrides?: Partial<ExportInputs>,
): ExportResult<MarketplaceItem> {
  const report = overrides?.marketplaceReport ?? buildMarketplaceReport();
  let items = [...report.items];

  if (filters?.domain) {
    items = items.filter((i) => i.domain === filters.domain);
  }
  if (filters?.healthState) {
    items = items.filter((i) => i.healthState === filters.healthState);
  }

  return {
    target: "marketplace",
    format: "json",
    filters: filters ?? {},
    generatedAt: new Date().toISOString(),
    recordCount: items.length,
    records: items,
  };
}

export function exportMarketplaceCatalogCsv(
  filters?: ExportFilters,
  overrides?: Partial<ExportInputs>,
): string {
  const result = exportMarketplaceCatalog(filters, overrides);
  const headers = [
    "templateId", "title", "domain", "status", "healthState",
    "maturity", "description", "capabilities", "publishedAt",
  ];
  return recordsToCsv(headers, result.records, (item) => [
    item.templateId,
    item.title,
    item.domain,
    item.status,
    item.healthState,
    item.maturity,
    item.description,
    item.capabilities.join("|"),
    item.publishedAt ?? "",
  ]);
}

// ---------------------------------------------------------------------------
// Export: Release Catalog
// ---------------------------------------------------------------------------

export function exportTemplateReleaseCatalog(
  filters?: ExportFilters,
  overrides?: Partial<ExportInputs>,
): ExportResult<ReleasedTemplateEntry> {
  const report = overrides?.releaseReport ?? buildTemplateReleaseReport();
  let catalog = [...report.catalog];

  if (filters?.stage) {
    catalog = catalog.filter((e) => e.stage === filters.stage);
  }
  if (filters?.domain) {
    // Filter by matching templateId prefix or signal-based domain if available
    catalog = catalog.filter((e) => {
      // ReleasedTemplateEntry doesn't have a domain field directly;
      // use templateId convention or check ranking report for domain mapping
      return e.templateId.includes(filters.domain!);
    });
  }

  return {
    target: "releases",
    format: "json",
    filters: filters ?? {},
    generatedAt: new Date().toISOString(),
    recordCount: catalog.length,
    records: catalog,
  };
}

export function exportTemplateReleaseCatalogCsv(
  filters?: ExportFilters,
  overrides?: Partial<ExportInputs>,
): string {
  const result = exportTemplateReleaseCatalog(filters, overrides);
  const headers = [
    "templateId", "stage", "sourceType", "parentTemplateId",
    "releasedAt", "releasedBy", "releaseNotes",
    "healthState", "regressionStatus", "marketplaceStatus", "overallRankScore",
  ];
  return recordsToCsv(headers, result.records, (entry) => [
    entry.templateId,
    entry.stage,
    entry.sourceType,
    entry.parentTemplateId ?? "",
    entry.releasedAt,
    entry.releasedBy,
    entry.releaseNotes,
    entry.signals.healthState,
    entry.signals.regressionStatus,
    entry.signals.marketplaceStatus,
    entry.signals.overallRankScore ?? "",
  ]);
}

// ---------------------------------------------------------------------------
// Export: Template Ranking
// ---------------------------------------------------------------------------

export function exportTemplateRanking(
  filters?: ExportFilters,
  overrides?: Partial<ExportInputs>,
): ExportResult<TemplateAnalytics> {
  const report = overrides?.rankingReport ?? buildTemplateRankingReport();
  let rankings = [...report.rankings];

  if (filters?.domain) {
    rankings = rankings.filter((r) => r.domain === filters.domain);
  }
  if (filters?.healthState) {
    rankings = rankings.filter((r) => r.healthState === filters.healthState);
  }

  return {
    target: "ranking",
    format: "json",
    filters: filters ?? {},
    generatedAt: new Date().toISOString(),
    recordCount: rankings.length,
    records: rankings,
  };
}

export function exportTemplateRankingCsv(
  filters?: ExportFilters,
  overrides?: Partial<ExportInputs>,
): string {
  const result = exportTemplateRanking(filters, overrides);
  const headers = [
    "templateId", "label", "domain", "healthState", "marketplaceStatus",
    "healthScore", "stabilityScore", "adoptionIntentCount", "derivationIntentCount",
    "derivationReadinessScore", "marketplaceMaturityScore", "overallRankScore", "trend",
  ];
  return recordsToCsv(headers, result.records, (r) => [
    r.templateId, r.label, r.domain, r.healthState, r.marketplaceStatus,
    r.healthScore, r.stabilityScore, r.adoptionIntentCount, r.derivationIntentCount,
    r.derivationReadinessScore, r.marketplaceMaturityScore, r.overallRankScore, r.trend,
  ]);
}

// ---------------------------------------------------------------------------
// Export: Template Recommendations
// ---------------------------------------------------------------------------

export function exportTemplateRecommendations(
  filters?: ExportFilters,
  overrides?: Partial<ExportInputs>,
): ExportResult<RecommendationRecord> {
  const report = overrides?.recommendationReport ?? buildTemplateRecommendationReport();

  let records: RecommendationRecord[] = [];

  // Collect all recommendation records
  for (const recs of Object.values(report.byDomain)) {
    records.push(...recs);
  }
  for (const recs of Object.values(report.byUseCase)) {
    records.push(...recs);
  }
  records.push(...report.bestDerivationParents);
  records.push(...report.safestProductionTemplates);
  records.push(...report.underusedHighQuality);
  records.push(...report.risingTemplates);

  // Deduplicate by templateId + recommendationType
  const seen = new Set<string>();
  records = records.filter((r) => {
    const key = `${r.templateId}:${r.recommendationType}:${r.domain ?? ""}:${r.useCase ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (filters?.domain) {
    records = records.filter((r) => r.domain === filters.domain);
  }
  if (filters?.recommendationType) {
    records = records.filter((r) => r.recommendationType === filters.recommendationType);
  }

  return {
    target: "recommendations",
    format: "json",
    filters: filters ?? {},
    generatedAt: new Date().toISOString(),
    recordCount: records.length,
    records,
  };
}

// ---------------------------------------------------------------------------
// Export: Portfolio Strategy
// ---------------------------------------------------------------------------

export function exportPortfolioStrategy(
  filters?: ExportFilters,
  overrides?: Partial<ExportInputs>,
): ExportResult<DomainStrategyRecord> {
  const report = overrides?.portfolioReport ?? buildPortfolioStrategyReport();
  let strategies = [...report.domainStrategies];

  if (filters?.domain) {
    strategies = strategies.filter((s) => s.domain === filters.domain);
  }

  return {
    target: "portfolio",
    format: "json",
    filters: filters ?? {},
    generatedAt: new Date().toISOString(),
    recordCount: strategies.length,
    records: strategies,
  };
}

// ---------------------------------------------------------------------------
// Export: Scenario Plans
// ---------------------------------------------------------------------------

export function exportScenarioPlans(
  filters?: ExportFilters,
  overrides?: Partial<ExportInputs>,
): ExportResult<FactoryScenario> {
  const report = overrides?.scenarioReport ?? buildScenarioReport();
  let scenarios = [
    ...report.expansionScenarios,
    ...report.gapFillScenarios,
    ...report.stabilizationScenarios,
  ];

  if (filters?.domain) {
    scenarios = scenarios.filter((s) => s.domain === filters.domain);
  }
  if (filters?.scenarioType) {
    scenarios = scenarios.filter((s) => s.type === filters.scenarioType);
  }

  // Sort by priority descending for deterministic output
  scenarios.sort((a, b) => b.priorityScore - a.priorityScore);

  return {
    target: "scenarios",
    format: "json",
    filters: filters ?? {},
    generatedAt: new Date().toISOString(),
    recordCount: scenarios.length,
    records: scenarios,
  };
}

// ---------------------------------------------------------------------------
// Export: Strategic KPIs
// ---------------------------------------------------------------------------

export function exportStrategicKpis(
  filters?: ExportFilters,
  overrides?: Partial<ExportInputs>,
): ExportResult<KpiRecord> {
  const report = overrides?.kpiReport ?? buildStrategicKpiReport();
  let kpis = report.categories.flatMap((c) => c.kpis);

  if (filters?.category) {
    kpis = kpis.filter((k) => k.category === filters.category);
  }

  return {
    target: "kpis",
    format: "json",
    filters: filters ?? {},
    generatedAt: new Date().toISOString(),
    recordCount: kpis.length,
    records: kpis,
  };
}

export function exportStrategicKpisCsv(
  filters?: ExportFilters,
  overrides?: Partial<ExportInputs>,
): string {
  const result = exportStrategicKpis(filters, overrides);
  const headers = [
    "kpiKey", "category", "label", "value", "unit", "status", "reasons",
  ];
  return recordsToCsv(headers, result.records, (kpi) => [
    kpi.kpiKey, kpi.category, kpi.label, kpi.value, kpi.unit, kpi.status,
    kpi.reasons.join("|"),
  ]);
}

// ---------------------------------------------------------------------------
// Unified export dispatcher
// ---------------------------------------------------------------------------

export interface ExportRequest {
  target: ExportTarget;
  format: ExportFormat;
  filters?: ExportFilters;
}

export function executeExport(
  request: ExportRequest,
  overrides?: Partial<ExportInputs>,
): { json?: ExportResult; csv?: string } {
  const { target, format, filters } = request;

  switch (target) {
    case "marketplace":
      return format === "csv"
        ? { csv: exportMarketplaceCatalogCsv(filters, overrides) }
        : { json: exportMarketplaceCatalog(filters, overrides) };
    case "releases":
      return format === "csv"
        ? { csv: exportTemplateReleaseCatalogCsv(filters, overrides) }
        : { json: exportTemplateReleaseCatalog(filters, overrides) };
    case "ranking":
      return format === "csv"
        ? { csv: exportTemplateRankingCsv(filters, overrides) }
        : { json: exportTemplateRanking(filters, overrides) };
    case "recommendations":
      return { json: exportTemplateRecommendations(filters, overrides) };
    case "portfolio":
      return { json: exportPortfolioStrategy(filters, overrides) };
    case "scenarios":
      return { json: exportScenarioPlans(filters, overrides) };
    case "kpis":
      return format === "csv"
        ? { csv: exportStrategicKpisCsv(filters, overrides) }
        : { json: exportStrategicKpis(filters, overrides) };
    default:
      throw new Error(`Unknown export target: ${target}`);
  }
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

export function formatExportManifest(manifest: ExportManifest): string {
  const lines: string[] = [];
  lines.push("=== Factory Export Manifest ===");
  lines.push("");
  for (const t of manifest.targets) {
    lines.push(`${t.target} — ${t.label}`);
    lines.push(`  ${t.description}`);
    lines.push(`  Formats: ${t.formats.join(", ")}`);
    lines.push(`  Filters: ${t.supportedFilters.join(", ")}`);
    lines.push("");
  }
  lines.push(`Generated: ${manifest.generatedAt}`);
  return lines.join("\n");
}
