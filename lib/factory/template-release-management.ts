/**
 * Environment-Aware Template Release v1
 *
 * Provides:
 *   1. Release catalog (candidate → dev → staging → prod)
 *   2. Deterministic release eligibility evaluation
 *   3. Dry-run preview before promotion
 *   4. Controlled release promotion with history
 *   5. Rollback metadata generation
 *   6. Role-based authorization enforcement
 *
 * Conservative v1 — separate from policy promotion, no auto-promote,
 * JSON file storage, no DB migrations.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

import {
  authorizeFactoryAction,
  type FactoryActor,
  type FactoryAction,
} from "./team-role-approval";

import {
  TEMPLATE_CATALOG,
} from "@/lib/templates/template-catalog";

import {
  buildMarketplaceReport,
  type MarketplaceReport,
} from "./template-marketplace";

import {
  evaluateAllTemplateHealth,
  type TemplateHealthSignals,
  type TemplateGovernanceResult,
} from "./template-health-governance";

import {
  buildDerivationReport,
  type DerivationReport,
  type DerivedCandidateConfig,
} from "./marketplace-derivation-pipeline";

import {
  buildTemplateAnalytics,
  type TemplateAnalytics,
} from "./template-analytics-ranking";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ReleaseStage = "candidate" | "dev" | "staging" | "prod";

export type ReleasePromotionStatus =
  | "ready"
  | "promoted"
  | "skipped"
  | "failed"
  | "rolled_back";

export interface ReleaseSignals {
  healthState: string;
  regressionStatus: string;
  marketplaceStatus: string;
  overallRankScore: number | null;
}

export interface ReleasedTemplateEntry {
  templateId: string;
  stage: ReleaseStage;
  sourceType: "catalog" | "derivation" | "autopilot";
  parentTemplateId: string | null;
  releasedAt: string;
  releasedBy: string;
  releaseNotes: string;
  signals: ReleaseSignals;
}

export interface ReleaseEligibility {
  allowed: boolean;
  reason: string;
}

export interface ReleasePromotionPlan {
  releasePromotionId: string;
  templateId: string;
  fromStage: ReleaseStage;
  toStage: ReleaseStage;
  status: ReleasePromotionStatus;
  eligibility: ReleaseEligibility;
  beforeEntry: ReleasedTemplateEntry | null;
  afterEntry: ReleasedTemplateEntry | null;
}

export interface ReleaseRollbackMetadata {
  releasePromotionId: string;
  rollbackAction: {
    targetFile: string;
    templateId: string;
    restoreStage: ReleaseStage;
  };
}

export interface ReleaseHistoryEntry {
  releasePromotionId: string;
  templateId: string;
  fromStage: ReleaseStage;
  toStage: ReleaseStage;
  status: ReleasePromotionStatus;
  executedAt: string;
  executedBy: string;
  rollbackMetadata: ReleaseRollbackMetadata;
}

export interface ReleaseCandidate {
  templateId: string;
  sourceType: "catalog" | "derivation" | "autopilot";
  parentTemplateId: string | null;
  domain: string;
}

export interface TemplateReleaseReport {
  catalog: ReleasedTemplateEntry[];
  candidates: ReleaseCandidate[];
  plans: ReleasePromotionPlan[];
  history: ReleaseHistoryEntry[];
  summary: {
    candidateCount: number;
    devCount: number;
    stagingCount: number;
    prodCount: number;
    totalHistory: number;
  };
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STAGE_ORDER: ReleaseStage[] = ["candidate", "dev", "staging", "prod"];

const VALID_TRANSITIONS: Array<[ReleaseStage, ReleaseStage]> = [
  ["candidate", "dev"],
  ["dev", "staging"],
  ["staging", "prod"],
];

/** Maps transition to required FactoryAction */
function requiredActionForTransition(
  from: ReleaseStage,
  to: ReleaseStage,
): FactoryAction {
  if (from === "candidate" && to === "dev") return "release.promote.candidate_to_dev";
  if (from === "dev" && to === "staging") return "release.promote.dev_to_staging";
  if (from === "staging" && to === "prod") return "release.promote.staging_to_prod";
  return "release.promote.staging_to_prod"; // fallback, will be rejected by auth
}

const CATALOG_PATH = "data/template-release-catalog.json";
const HISTORY_PATH = "data/template-release-history.json";

// ---------------------------------------------------------------------------
// In-memory store (test support)
// ---------------------------------------------------------------------------

interface MemoryState {
  catalog: ReleasedTemplateEntry[];
  history: ReleaseHistoryEntry[];
  /** Override for governance results */
  governanceResults: TemplateGovernanceResult[] | null;
  /** Override for marketplace report */
  marketplaceReport: MarketplaceReport | null;
  /** Override for derivation report */
  derivationReport: DerivationReport | null;
  /** Override for analytics */
  analytics: TemplateAnalytics[] | null;
  /** Override for candidate list */
  candidates: ReleaseCandidate[] | null;
}

let memoryState: MemoryState | null = null;

export function useInMemoryStore(initial?: Partial<MemoryState>): void {
  memoryState = {
    catalog: initial?.catalog ?? [],
    history: initial?.history ?? [],
    governanceResults: initial?.governanceResults ?? null,
    marketplaceReport: initial?.marketplaceReport ?? null,
    derivationReport: initial?.derivationReport ?? null,
    analytics: initial?.analytics ?? null,
    candidates: initial?.candidates ?? null,
  };
}

export function clearInMemoryStore(): void {
  memoryState = null;
}

// ---------------------------------------------------------------------------
// File I/O
// ---------------------------------------------------------------------------

const DATA_DIR = join(process.cwd(), "data");

function ensureDataDir(): void {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readCatalog(): ReleasedTemplateEntry[] {
  if (memoryState !== null) return memoryState.catalog;
  try {
    const raw = readFileSync(join(process.cwd(), CATALOG_PATH), "utf-8");
    return JSON.parse(raw) as ReleasedTemplateEntry[];
  } catch {
    return [];
  }
}

function writeCatalog(catalog: ReleasedTemplateEntry[]): void {
  if (memoryState !== null) {
    memoryState.catalog = catalog;
    return;
  }
  ensureDataDir();
  writeFileSync(
    join(process.cwd(), CATALOG_PATH),
    JSON.stringify(catalog, null, 2),
    "utf-8",
  );
}

function readHistory(): ReleaseHistoryEntry[] {
  if (memoryState !== null) return memoryState.history;
  try {
    const raw = readFileSync(join(process.cwd(), HISTORY_PATH), "utf-8");
    return JSON.parse(raw) as ReleaseHistoryEntry[];
  } catch {
    return [];
  }
}

function writeHistory(history: ReleaseHistoryEntry[]): void {
  if (memoryState !== null) {
    memoryState.history = history;
    return;
  }
  ensureDataDir();
  writeFileSync(
    join(process.cwd(), HISTORY_PATH),
    JSON.stringify(history, null, 2),
    "utf-8",
  );
}

// ---------------------------------------------------------------------------
// Data helpers
// ---------------------------------------------------------------------------

function getGovernanceResults(): TemplateGovernanceResult[] {
  if (memoryState?.governanceResults) return memoryState.governanceResults;

  const templatesWithSignals = TEMPLATE_CATALOG.map((entry) => {
    const isGreen = entry.statusBadge === "GREEN";
    const signals: TemplateHealthSignals = {
      currentState: isGreen ? "green" : "candidate",
      greenCriteria: {
        pipelineComplete: isGreen,
        qualityGatesPass: isGreen,
        baselinePass: isGreen,
        tenantIsolationVerified: isGreen,
        rbacVerified: isGreen,
        runtimeVerificationDone: isGreen,
      },
      recentRegressionStatuses: isGreen ? ["pass", "pass", "pass"] : [],
      latestBaselinePassed: isGreen,
      latestQualityGatesPassed: isGreen,
    };
    return { templateKey: entry.templateKey, signals };
  });

  return evaluateAllTemplateHealth(templatesWithSignals).results;
}

function getMarketplaceReport(): MarketplaceReport {
  if (memoryState?.marketplaceReport) return memoryState.marketplaceReport;
  return buildMarketplaceReport();
}

function getDerivationReport(): DerivationReport {
  if (memoryState?.derivationReport) return memoryState.derivationReport;
  return buildDerivationReport();
}

function getAnalytics(): TemplateAnalytics[] {
  if (memoryState?.analytics) return memoryState.analytics;
  const governance = getGovernanceResults();
  const marketplace = getMarketplaceReport();
  const derivation = getDerivationReport();
  return buildTemplateAnalytics({
    governanceResults: governance,
    marketplaceReport: marketplace,
    derivationReport: derivation,
  });
}

function buildSignals(templateId: string): ReleaseSignals {
  const governance = getGovernanceResults();
  const marketplace = getMarketplaceReport();
  const analytics = getAnalytics();

  const gov = governance.find((g) => g.templateKey === templateId);
  const mktItem = marketplace.items.find((i) => i.templateId === templateId);
  const anal = analytics.find((a) => a.templateId === templateId);

  return {
    healthState: gov?.nextState ?? "unknown",
    regressionStatus: gov?.signals.latestBaselinePassed ? "pass" : "fail",
    marketplaceStatus: mktItem?.status ?? "unpublished",
    overallRankScore: anal?.overallRankScore ?? null,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Build the current release catalog */
export function buildTemplateReleaseCatalog(): ReleasedTemplateEntry[] {
  return readCatalog();
}

/** Collect release candidates from derivation pipeline and catalog templates */
export function collectReleaseCandidates(): ReleaseCandidate[] {
  if (memoryState?.candidates) return memoryState.candidates;

  const candidates: ReleaseCandidate[] = [];
  const catalog = readCatalog();
  const releasedIds = new Set(catalog.map((e) => e.templateId));

  // Source 1: Derivation pipeline candidates
  const derivReport = getDerivationReport();
  for (const dc of derivReport.candidates) {
    if (!releasedIds.has(dc.templateId)) {
      candidates.push({
        templateId: dc.templateId,
        sourceType: "derivation",
        parentTemplateId: dc.parentTemplateId,
        domain: dc.domain,
      });
    }
  }

  // Source 2: Catalog templates not yet in release catalog
  for (const entry of TEMPLATE_CATALOG) {
    if (!releasedIds.has(entry.templateKey)) {
      candidates.push({
        templateId: entry.templateKey,
        sourceType: "catalog",
        parentTemplateId: null,
        domain: entry.recommendedFor ?? "general",
      });
    }
  }

  return candidates;
}

/** Validate that a stage transition is allowed */
function isValidTransition(from: ReleaseStage, to: ReleaseStage): boolean {
  return VALID_TRANSITIONS.some(([f, t]) => f === from && t === to);
}

/** Evaluate release eligibility for a template at a specific transition */
export function evaluateTemplateReleaseEligibility(
  templateId: string,
  fromStage: ReleaseStage,
  toStage: ReleaseStage,
): ReleaseEligibility {
  // Validate transition path
  if (!isValidTransition(fromStage, toStage)) {
    return {
      allowed: false,
      reason: `Invalid transition: ${fromStage} → ${toStage}. Only adjacent stage promotions are allowed.`,
    };
  }

  const catalog = readCatalog();
  const governance = getGovernanceResults();
  const gov = governance.find((g) => g.templateKey === templateId);

  // candidate → dev
  if (fromStage === "candidate" && toStage === "dev") {
    // Check if candidate exists
    const candidates = collectReleaseCandidates();
    const isCandidate = candidates.some((c) => c.templateId === templateId);
    const alreadyInCatalog = TEMPLATE_CATALOG.some((c) => c.templateKey === templateId);

    if (!isCandidate && !alreadyInCatalog) {
      return { allowed: false, reason: "Template candidate artifact not found" };
    }

    // Check no duplicate in higher stage
    const higherEntry = catalog.find(
      (e) => e.templateId === templateId &&
        STAGE_ORDER.indexOf(e.stage) > STAGE_ORDER.indexOf("dev"),
    );
    if (higherEntry) {
      return {
        allowed: false,
        reason: `Template already released at higher stage: ${higherEntry.stage}`,
      };
    }

    return { allowed: true, reason: "Candidate eligible for dev release" };
  }

  // dev → staging
  if (fromStage === "dev" && toStage === "staging") {
    const devEntry = catalog.find(
      (e) => e.templateId === templateId && e.stage === "dev",
    );
    if (!devEntry) {
      return { allowed: false, reason: "Template not found in dev stage" };
    }

    if (!gov) {
      return { allowed: false, reason: "No governance data available" };
    }

    // Governance state must not be degraded/demoted
    if (gov.nextState === "degraded" || gov.nextState === "demoted") {
      return {
        allowed: false,
        reason: `Governance state is ${gov.nextState} — not eligible for staging`,
      };
    }

    // Latest regression must not be fail
    if (!gov.signals.latestBaselinePassed) {
      return { allowed: false, reason: "Latest regression baseline failed" };
    }

    return {
      allowed: true,
      reason: "Template passed validation signals, eligible for staging release",
    };
  }

  // staging → prod
  if (fromStage === "staging" && toStage === "prod") {
    const stagingEntry = catalog.find(
      (e) => e.templateId === templateId && e.stage === "staging",
    );
    if (!stagingEntry) {
      return { allowed: false, reason: "Template not found in staging stage" };
    }

    if (!gov) {
      return { allowed: false, reason: "No governance data available" };
    }

    // Must be green
    if (gov.nextState !== "green") {
      return {
        allowed: false,
        reason: `Governance state is ${gov.nextState} — must be green for prod release`,
      };
    }

    // Regression must be stable
    if (!gov.signals.latestBaselinePassed || !gov.signals.latestQualityGatesPassed) {
      return { allowed: false, reason: "Regression signals not stable for prod" };
    }

    // Check marketplace status
    const marketplace = getMarketplaceReport();
    const mktItem = marketplace.items.find((i) => i.templateId === templateId);
    if (mktItem && mktItem.maturity !== "production_ready") {
      return {
        allowed: false,
        reason: `Marketplace maturity is ${mktItem.maturity} — must be production_ready`,
      };
    }

    return {
      allowed: true,
      reason: "Template is green, stable, and production-ready for prod release",
    };
  }

  return { allowed: false, reason: "Unknown transition" };
}

/** Build release promotion plans (dry-run) */
export function buildTemplateReleasePlans(
  options?: {
    templateId?: string;
    fromStage?: ReleaseStage;
    toStage?: ReleaseStage;
  },
): ReleasePromotionPlan[] {
  const plans: ReleasePromotionPlan[] = [];
  const catalog = readCatalog();

  if (options?.templateId && options?.fromStage && options?.toStage) {
    // Single template promotion plan
    const plan = buildSinglePlan(
      options.templateId,
      options.fromStage,
      options.toStage,
      catalog,
    );
    plans.push(plan);
    return plans;
  }

  // Auto-discover promotable templates
  // candidate → dev: all candidates
  const candidates = collectReleaseCandidates();
  for (const candidate of candidates) {
    const existing = catalog.find(
      (e) => e.templateId === candidate.templateId,
    );
    if (!existing) {
      plans.push(
        buildSinglePlan(candidate.templateId, "candidate", "dev", catalog),
      );
    }
  }

  // dev → staging: all dev entries
  const devEntries = catalog.filter((e) => e.stage === "dev");
  for (const entry of devEntries) {
    plans.push(
      buildSinglePlan(entry.templateId, "dev", "staging", catalog),
    );
  }

  // staging → prod: all staging entries
  const stagingEntries = catalog.filter((e) => e.stage === "staging");
  for (const entry of stagingEntries) {
    plans.push(
      buildSinglePlan(entry.templateId, "staging", "prod", catalog),
    );
  }

  return plans;
}

function buildSinglePlan(
  templateId: string,
  fromStage: ReleaseStage,
  toStage: ReleaseStage,
  catalog: ReleasedTemplateEntry[],
): ReleasePromotionPlan {
  const releasePromotionId = `release-${templateId}-${fromStage}-to-${toStage}`;
  const eligibility = evaluateTemplateReleaseEligibility(templateId, fromStage, toStage);

  const beforeEntry = catalog.find(
    (e) => e.templateId === templateId && e.stage === fromStage,
  ) ?? null;

  const afterEntry: ReleasedTemplateEntry | null = eligibility.allowed
    ? {
        templateId,
        stage: toStage,
        sourceType: beforeEntry?.sourceType ?? detectSourceType(templateId),
        parentTemplateId: beforeEntry?.parentTemplateId ?? null,
        releasedAt: "(pending)",
        releasedBy: "(pending)",
        releaseNotes: `Promoted from ${fromStage} to ${toStage}`,
        signals: buildSignals(templateId),
      }
    : null;

  return {
    releasePromotionId,
    templateId,
    fromStage,
    toStage,
    status: eligibility.allowed ? "ready" : "skipped",
    eligibility,
    beforeEntry,
    afterEntry,
  };
}

function detectSourceType(templateId: string): "catalog" | "derivation" | "autopilot" {
  if (TEMPLATE_CATALOG.some((c) => c.templateKey === templateId)) {
    return "catalog";
  }
  const derivation = getDerivationReport();
  if (derivation.candidates.some((c) => c.templateId === templateId)) {
    return "derivation";
  }
  return "autopilot";
}

/** Preview release plans (alias for buildTemplateReleasePlans — no mutation) */
export function previewTemplateReleasePlans(
  options?: {
    templateId?: string;
    fromStage?: ReleaseStage;
    toStage?: ReleaseStage;
  },
): ReleasePromotionPlan[] {
  return buildTemplateReleasePlans(options);
}

/** Apply release promotions with authorization */
export function applyTemplateReleasePlans(
  options: {
    templateId?: string;
    fromStage?: ReleaseStage;
    toStage?: ReleaseStage;
    actor: FactoryActor;
    releaseNotes?: string;
  },
): {
  applied: ReleasePromotionPlan[];
  skipped: ReleasePromotionPlan[];
  history: ReleaseHistoryEntry[];
} {
  const plans = buildTemplateReleasePlans({
    templateId: options.templateId,
    fromStage: options.fromStage,
    toStage: options.toStage,
  });

  const catalog = readCatalog();
  const historyEntries = readHistory();
  const applied: ReleasePromotionPlan[] = [];
  const skipped: ReleasePromotionPlan[] = [];
  const newHistory: ReleaseHistoryEntry[] = [];

  for (const plan of plans) {
    // Check eligibility
    if (!plan.eligibility.allowed) {
      plan.status = "skipped";
      skipped.push(plan);
      continue;
    }

    // Check authorization
    const action = requiredActionForTransition(plan.fromStage, plan.toStage);
    const auth = authorizeFactoryAction(options.actor, action);
    if (!auth.allowed) {
      plan.status = "skipped";
      plan.eligibility = { allowed: false, reason: auth.reason };
      skipped.push(plan);
      continue;
    }

    // Apply promotion
    const now = new Date().toISOString();

    // Remove old entry if exists
    const oldIdx = catalog.findIndex(
      (e) => e.templateId === plan.templateId && e.stage === plan.fromStage,
    );
    if (oldIdx >= 0) {
      catalog.splice(oldIdx, 1);
    }

    // Add new entry at target stage
    const newEntry: ReleasedTemplateEntry = {
      templateId: plan.templateId,
      stage: plan.toStage,
      sourceType: plan.beforeEntry?.sourceType ?? detectSourceType(plan.templateId),
      parentTemplateId: plan.beforeEntry?.parentTemplateId ?? null,
      releasedAt: now,
      releasedBy: options.actor.actorId,
      releaseNotes: options.releaseNotes ?? `Promoted from ${plan.fromStage} to ${plan.toStage}`,
      signals: buildSignals(plan.templateId),
    };
    catalog.push(newEntry);

    plan.status = "promoted";
    plan.afterEntry = newEntry;
    applied.push(plan);

    // Record history
    const rollbackMetadata = buildTemplateReleaseRollbackMetadata(plan);
    const historyEntry: ReleaseHistoryEntry = {
      releasePromotionId: plan.releasePromotionId,
      templateId: plan.templateId,
      fromStage: plan.fromStage,
      toStage: plan.toStage,
      status: "promoted",
      executedAt: now,
      executedBy: options.actor.actorId,
      rollbackMetadata,
    };
    historyEntries.push(historyEntry);
    newHistory.push(historyEntry);
  }

  writeCatalog(catalog);
  writeHistory(historyEntries);

  return { applied, skipped, history: newHistory };
}

/** List release history */
export function listTemplateReleaseHistory(): ReleaseHistoryEntry[] {
  return readHistory();
}

/** Generate rollback metadata for a promotion plan */
export function buildTemplateReleaseRollbackMetadata(
  plan: ReleasePromotionPlan,
): ReleaseRollbackMetadata {
  return {
    releasePromotionId: plan.releasePromotionId,
    rollbackAction: {
      targetFile: CATALOG_PATH,
      templateId: plan.templateId,
      restoreStage: plan.fromStage,
    },
  };
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

export function buildTemplateReleaseReport(): TemplateReleaseReport {
  const catalog = readCatalog();
  const candidates = collectReleaseCandidates();
  const plans = buildTemplateReleasePlans();
  const history = readHistory();

  return {
    catalog,
    candidates,
    plans,
    history,
    summary: {
      candidateCount: candidates.length,
      devCount: catalog.filter((e) => e.stage === "dev").length,
      stagingCount: catalog.filter((e) => e.stage === "staging").length,
      prodCount: catalog.filter((e) => e.stage === "prod").length,
      totalHistory: history.length,
    },
    generatedAt: new Date().toISOString(),
  };
}

export function formatTemplateReleaseReport(
  report: TemplateReleaseReport,
): string {
  const lines: string[] = [];
  const hr = "─".repeat(80);

  lines.push(hr);
  lines.push("  TEMPLATE RELEASE MANAGEMENT REPORT");
  lines.push(hr);
  lines.push(
    `  Candidates: ${report.summary.candidateCount}  |  ` +
    `Dev: ${report.summary.devCount}  |  ` +
    `Staging: ${report.summary.stagingCount}  |  ` +
    `Prod: ${report.summary.prodCount}  |  ` +
    `History: ${report.summary.totalHistory}`,
  );

  if (report.catalog.length > 0) {
    lines.push("");
    lines.push("  RELEASE CATALOG:");
    for (const entry of report.catalog) {
      lines.push(
        `    [${entry.stage.toUpperCase().padEnd(9)}] ${entry.templateId}  ` +
        `(${entry.sourceType}) ${entry.signals.healthState} — ${entry.releaseNotes}`,
      );
    }
  }

  if (report.candidates.length > 0) {
    lines.push("");
    lines.push("  CANDIDATES:");
    for (const c of report.candidates) {
      const parent = c.parentTemplateId ? ` (from ${c.parentTemplateId})` : "";
      lines.push(`    ${c.templateId}  [${c.sourceType}]${parent}`);
    }
  }

  if (report.plans.length > 0) {
    lines.push("");
    lines.push("  PROMOTION PLANS:");
    for (const plan of report.plans) {
      const badge = plan.status === "ready" ? "[READY]" : "[SKIP]";
      lines.push(
        `    ${badge} ${plan.templateId}: ${plan.fromStage} → ${plan.toStage}`,
      );
      if (!plan.eligibility.allowed) {
        lines.push(`      reason: ${plan.eligibility.reason}`);
      }
    }
  }

  if (report.history.length > 0) {
    lines.push("");
    lines.push("  RELEASE HISTORY:");
    for (const h of report.history.slice(-10)) {
      lines.push(
        `    ${h.executedAt}  ${h.templateId}: ${h.fromStage} → ${h.toStage}  ` +
        `[${h.status.toUpperCase()}]  (${h.executedBy})`,
      );
    }
  }

  lines.push(hr);
  return lines.join("\n");
}

export function formatReleasePromotionPlans(
  plans: ReleasePromotionPlan[],
): string {
  const lines: string[] = [];
  const hr = "─".repeat(80);

  lines.push(hr);
  lines.push("  RELEASE PROMOTION PREVIEW");
  lines.push(hr);

  if (plans.length === 0) {
    lines.push("  リリースプロモーション対象はありません。");
  } else {
    for (const plan of plans) {
      const badge = plan.status === "ready"
        ? "[READY]"
        : plan.status === "promoted"
        ? "[PROMOTED]"
        : "[SKIP]";
      lines.push(
        `  ${badge} ${plan.releasePromotionId}`,
      );
      lines.push(
        `    ${plan.templateId}: ${plan.fromStage} → ${plan.toStage}`,
      );
      lines.push(`    eligibility: ${plan.eligibility.reason}`);
      if (plan.afterEntry) {
        lines.push(`    health: ${plan.afterEntry.signals.healthState}`);
        lines.push(`    regression: ${plan.afterEntry.signals.regressionStatus}`);
        if (plan.afterEntry.signals.overallRankScore !== null) {
          lines.push(
            `    rank: ${plan.afterEntry.signals.overallRankScore.toFixed(3)}`,
          );
        }
      }
    }
  }

  lines.push(hr);
  return lines.join("\n");
}
