/**
 * Template Marketplace v1
 *
 * Provides:
 *   1. Marketplace catalog built from eligible templates
 *   2. Discovery listing with filters
 *   3. Publish/unpublish/experimental controls
 *   4. Adoption intent recording
 *   5. Derivation intent recording
 *   6. Marketplace report
 *
 * Conservative v1 — no auto-generation, no payments, no external publishing.
 * Adopt and derive only record intent metadata.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

import {
  TEMPLATE_CATALOG,
  type TemplateCatalogEntry,
} from "@/lib/templates/template-catalog";
import {
  TEMPLATE_REGISTRY,
} from "@/lib/templates/template-registry";
import {
  evaluateAllTemplateHealth,
  type TemplateHealthSignals,
  type TemplateGovernanceResult,
} from "@/lib/factory/template-health-governance";
import {
  REGRESSION_CONFIG_REGISTRY,
} from "@/lib/regression/template-regression-config";
import {
  TEMPLATE_DOMAIN_MAP,
  type TemplateDomain,
} from "@/lib/factory/template-evolution-engine";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MarketplaceStatus = "published" | "unpublished" | "experimental";
export type MarketplaceMaturity = "production_ready" | "experimental" | "unavailable";
export type MarketplaceAction =
  | "publish_template"
  | "unpublish_template"
  | "mark_experimental"
  | "adopt_template"
  | "derive_template_intent";

export interface MarketplaceItem {
  templateId: string;
  title: string;
  domain: string;
  status: MarketplaceStatus;
  healthState: string;
  maturity: MarketplaceMaturity;
  description: string;
  capabilities: string[];
  sourceSignals: {
    governanceState: string;
    regressionStatus: string;
    greenEligible: boolean;
  };
  derivationHints: string[];
  publishedAt: string | null;
}

export interface AdoptionIntent {
  intentId: string;
  templateId: string;
  action: "adopt_template";
  requestedAt: string;
  requestedBy: string;
}

export interface DerivationIntent {
  intentId: string;
  parentTemplateId: string;
  requestedTemplateId: string;
  action: "derive_template_intent";
  requestedAt: string;
  requestedBy: string;
}

export interface MarketplaceReport {
  items: MarketplaceItem[];
  adoptionIntents: AdoptionIntent[];
  derivationIntents: DerivationIntent[];
  summary: {
    totalItems: number;
    publishedCount: number;
    experimentalCount: number;
    unpublishedCount: number;
    adoptionIntentCount: number;
    derivationIntentCount: number;
  };
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

const DATA_DIR = join(process.cwd(), "data");
const MARKETPLACE_PATH = join(DATA_DIR, "template-marketplace.json");
const ADOPTION_INTENTS_PATH = join(DATA_DIR, "template-adoption-intents.json");
const DERIVATION_INTENTS_PATH = join(DATA_DIR, "template-derivation-intents.json");

function ensureDataDir(): void {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

// ---------------------------------------------------------------------------
// In-memory store (for testing)
// ---------------------------------------------------------------------------

interface MemoryState {
  /** Status overrides keyed by templateId */
  statusOverrides: Record<string, MarketplaceStatus>;
  /** Publish timestamps keyed by templateId */
  publishTimestamps: Record<string, string>;
  adoptionIntents: AdoptionIntent[];
  derivationIntents: DerivationIntent[];
  /** Override catalog entries for testing */
  catalogOverride: TemplateCatalogEntry[] | null;
  /** Override governance results for testing */
  governanceOverride: TemplateGovernanceResult[] | null;
}

let memoryState: MemoryState | null = null;

export function useInMemoryStore(
  initial?: Partial<MemoryState>,
): void {
  memoryState = {
    statusOverrides: initial?.statusOverrides ?? {},
    publishTimestamps: initial?.publishTimestamps ?? {},
    adoptionIntents: initial?.adoptionIntents ?? [],
    derivationIntents: initial?.derivationIntents ?? [],
    catalogOverride: initial?.catalogOverride ?? null,
    governanceOverride: initial?.governanceOverride ?? null,
  };
}

export function clearInMemoryStore(): void {
  memoryState = null;
}

// ---------------------------------------------------------------------------
// Persistence helpers
// ---------------------------------------------------------------------------

interface PersistedMarketplace {
  statusOverrides: Record<string, MarketplaceStatus>;
  publishTimestamps: Record<string, string>;
}

function readMarketplaceStore(): PersistedMarketplace {
  if (memoryState !== null) {
    return {
      statusOverrides: memoryState.statusOverrides,
      publishTimestamps: memoryState.publishTimestamps,
    };
  }
  try {
    const raw = readFileSync(MARKETPLACE_PATH, "utf-8");
    return JSON.parse(raw) as PersistedMarketplace;
  } catch {
    return { statusOverrides: {}, publishTimestamps: {} };
  }
}

function writeMarketplaceStore(store: PersistedMarketplace): void {
  if (memoryState !== null) {
    memoryState.statusOverrides = store.statusOverrides;
    memoryState.publishTimestamps = store.publishTimestamps;
    return;
  }
  ensureDataDir();
  writeFileSync(MARKETPLACE_PATH, JSON.stringify(store, null, 2), "utf-8");
}

function readAdoptionIntents(): AdoptionIntent[] {
  if (memoryState !== null) return memoryState.adoptionIntents;
  try {
    const raw = readFileSync(ADOPTION_INTENTS_PATH, "utf-8");
    return JSON.parse(raw) as AdoptionIntent[];
  } catch {
    return [];
  }
}

function writeAdoptionIntents(intents: AdoptionIntent[]): void {
  if (memoryState !== null) {
    memoryState.adoptionIntents = intents;
    return;
  }
  ensureDataDir();
  writeFileSync(ADOPTION_INTENTS_PATH, JSON.stringify(intents, null, 2), "utf-8");
}

function readDerivationIntents(): DerivationIntent[] {
  if (memoryState !== null) return memoryState.derivationIntents;
  try {
    const raw = readFileSync(DERIVATION_INTENTS_PATH, "utf-8");
    return JSON.parse(raw) as DerivationIntent[];
  } catch {
    return [];
  }
}

function writeDerivationIntents(intents: DerivationIntent[]): void {
  if (memoryState !== null) {
    memoryState.derivationIntents = intents;
    return;
  }
  ensureDataDir();
  writeFileSync(DERIVATION_INTENTS_PATH, JSON.stringify(intents, null, 2), "utf-8");
}

// ---------------------------------------------------------------------------
// Governance evaluation helper
// ---------------------------------------------------------------------------

function buildDefaultSignals(catalogEntry: TemplateCatalogEntry): TemplateHealthSignals {
  const isGreen = catalogEntry.statusBadge === "GREEN";
  return {
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
}

function getGovernanceResults(): TemplateGovernanceResult[] {
  if (memoryState?.governanceOverride !== null && memoryState !== null) {
    return memoryState.governanceOverride;
  }
  const catalog = getCatalog();
  const templatesWithSignals = catalog.map((entry) => ({
    templateKey: entry.templateKey,
    signals: buildDefaultSignals(entry),
  }));
  return evaluateAllTemplateHealth(templatesWithSignals).results;
}

function getCatalog(): TemplateCatalogEntry[] {
  if (memoryState?.catalogOverride !== null && memoryState !== null) {
    return memoryState.catalogOverride;
  }
  return TEMPLATE_CATALOG;
}

// ---------------------------------------------------------------------------
// Derivation hints
// ---------------------------------------------------------------------------

const DERIVATION_HINT_MAP: Record<string, string[]> = {
  reservation_saas: [
    "restaurant_reservation_saas",
    "clinic_reservation_saas",
    "salon_reservation_saas",
  ],
  membership_content_affiliate: [
    "online_school_saas",
    "media_subscription_saas",
  ],
  community_membership_saas: [
    "fan_community_saas",
    "learning_community_saas",
  ],
  simple_crm_saas: [
    "real_estate_crm_saas",
    "recruitment_crm_saas",
  ],
  internal_admin_ops_saas: [
    "helpdesk_ops_saas",
    "facility_management_saas",
  ],
};

// ---------------------------------------------------------------------------
// Eligibility
// ---------------------------------------------------------------------------

export interface EligibilityResult {
  templateId: string;
  eligible: boolean;
  maturity: MarketplaceMaturity;
  reasons: string[];
}

export function evaluateMarketplaceEligibility(
  templateId: string,
): EligibilityResult {
  const catalog = getCatalog();
  const catalogEntry = catalog.find((c) => c.templateKey === templateId);
  if (!catalogEntry) {
    return {
      templateId,
      eligible: false,
      maturity: "unavailable",
      reasons: ["Template not found in catalog"],
    };
  }

  const governance = getGovernanceResults();
  const govResult = governance.find((g) => g.templateKey === templateId);
  if (!govResult) {
    return {
      templateId,
      eligible: false,
      maturity: "unavailable",
      reasons: ["No governance result available"],
    };
  }

  const reasons: string[] = [];

  // Check health state
  if (govResult.nextState === "degraded" || govResult.nextState === "demoted") {
    reasons.push(`Health state is ${govResult.nextState}`);
    return {
      templateId,
      eligible: false,
      maturity: "unavailable",
      reasons,
    };
  }

  // Check regression status
  const regConfig = REGRESSION_CONFIG_REGISTRY.find(
    (r) => r.templateKey === templateId,
  );
  if (!regConfig) {
    reasons.push("No regression config found");
  }

  // Check required metadata
  const manifest = TEMPLATE_REGISTRY[templateId];
  if (!manifest) {
    reasons.push("No template manifest found");
    return {
      templateId,
      eligible: false,
      maturity: "unavailable",
      reasons,
    };
  }

  // Green = production_ready, at_risk = experimental
  if (govResult.nextState === "green") {
    return {
      templateId,
      eligible: true,
      maturity: "production_ready",
      reasons: ["Health state is green", "All governance checks passed"],
    };
  }

  if (govResult.nextState === "at_risk") {
    return {
      templateId,
      eligible: true,
      maturity: "experimental",
      reasons: ["Health state is at_risk — limited availability"],
    };
  }

  // candidate
  return {
    templateId,
    eligible: false,
    maturity: "unavailable",
    reasons: [`Health state is ${govResult.nextState} — not eligible for publishing`],
  };
}

// ---------------------------------------------------------------------------
// Marketplace catalog builder
// ---------------------------------------------------------------------------

export function buildMarketplaceCatalog(): MarketplaceItem[] {
  const catalog = getCatalog();
  const governance = getGovernanceResults();
  const store = readMarketplaceStore();

  const items: MarketplaceItem[] = [];

  for (const entry of catalog) {
    const govResult = governance.find((g) => g.templateKey === entry.templateKey);
    const manifest = TEMPLATE_REGISTRY[entry.templateKey];
    const eligibility = evaluateMarketplaceEligibility(entry.templateKey);

    const healthState = govResult?.nextState ?? "candidate";
    const domains = TEMPLATE_DOMAIN_MAP[entry.templateKey] ?? [];
    const domainStr = domains.join(" / ") || "general";

    // Determine status from store overrides or eligibility
    let status: MarketplaceStatus = "unpublished";
    if (store.statusOverrides[entry.templateKey]) {
      status = store.statusOverrides[entry.templateKey]!;
    }

    // Determine maturity
    let maturity: MarketplaceMaturity = eligibility.maturity;
    if (status === "experimental") {
      maturity = "experimental";
    } else if (status === "unpublished") {
      maturity = "unavailable";
    }

    const regressionStatus = govResult
      ? (govResult.signals.latestRegressionStatus ?? "unknown")
      : "unknown";

    items.push({
      templateId: entry.templateKey,
      title: manifest?.label ?? entry.label,
      domain: domainStr,
      status,
      healthState,
      maturity,
      description: entry.shortDescription,
      capabilities: entry.coreEntities,
      sourceSignals: {
        governanceState: healthState,
        regressionStatus,
        greenEligible: eligibility.eligible && eligibility.maturity === "production_ready",
      },
      derivationHints: DERIVATION_HINT_MAP[entry.templateKey] ?? [],
      publishedAt: store.publishTimestamps[entry.templateKey] ?? null,
    });
  }

  return items;
}

// ---------------------------------------------------------------------------
// Listing with filters
// ---------------------------------------------------------------------------

export interface MarketplaceFilters {
  domain?: string;
  healthState?: string;
  status?: MarketplaceStatus;
  maturity?: MarketplaceMaturity;
}

export function listMarketplaceItems(
  filters?: MarketplaceFilters,
): MarketplaceItem[] {
  let items = buildMarketplaceCatalog();

  if (filters?.domain) {
    items = items.filter((i) => i.domain.includes(filters.domain!));
  }
  if (filters?.healthState) {
    items = items.filter((i) => i.healthState === filters.healthState);
  }
  if (filters?.status) {
    items = items.filter((i) => i.status === filters.status);
  }
  if (filters?.maturity) {
    items = items.filter((i) => i.maturity === filters.maturity);
  }

  return items;
}

// ---------------------------------------------------------------------------
// Publish / Unpublish / Experimental
// ---------------------------------------------------------------------------

export interface PublishResult {
  templateId: string;
  action: MarketplaceAction;
  success: boolean;
  reason: string;
  status: MarketplaceStatus;
}

export function publishTemplate(templateId: string): PublishResult {
  const eligibility = evaluateMarketplaceEligibility(templateId);

  if (!eligibility.eligible) {
    return {
      templateId,
      action: "publish_template",
      success: false,
      reason: eligibility.reasons.join("; "),
      status: "unpublished",
    };
  }

  if (eligibility.maturity !== "production_ready") {
    return {
      templateId,
      action: "publish_template",
      success: false,
      reason: "Template is not production_ready — use mark_experimental instead",
      status: "unpublished",
    };
  }

  const store = readMarketplaceStore();
  store.statusOverrides[templateId] = "published";
  store.publishTimestamps[templateId] = new Date().toISOString();
  writeMarketplaceStore(store);

  return {
    templateId,
    action: "publish_template",
    success: true,
    reason: "Published as production_ready",
    status: "published",
  };
}

export function unpublishTemplate(templateId: string): PublishResult {
  const store = readMarketplaceStore();
  store.statusOverrides[templateId] = "unpublished";
  delete store.publishTimestamps[templateId];
  writeMarketplaceStore(store);

  return {
    templateId,
    action: "unpublish_template",
    success: true,
    reason: "Unpublished from marketplace",
    status: "unpublished",
  };
}

export function markExperimental(templateId: string): PublishResult {
  const eligibility = evaluateMarketplaceEligibility(templateId);

  if (!eligibility.eligible) {
    return {
      templateId,
      action: "mark_experimental",
      success: false,
      reason: eligibility.reasons.join("; "),
      status: "unpublished",
    };
  }

  const store = readMarketplaceStore();
  store.statusOverrides[templateId] = "experimental";
  store.publishTimestamps[templateId] = new Date().toISOString();
  writeMarketplaceStore(store);

  return {
    templateId,
    action: "mark_experimental",
    success: true,
    reason: "Marked as experimental",
    status: "experimental",
  };
}

// ---------------------------------------------------------------------------
// Adoption intent
// ---------------------------------------------------------------------------

export function recordTemplateAdoptionIntent(
  templateId: string,
  requestedBy: string = "user",
): AdoptionIntent {
  const intent: AdoptionIntent = {
    intentId: `adopt-${templateId}-${Date.now()}`,
    templateId,
    action: "adopt_template",
    requestedAt: new Date().toISOString(),
    requestedBy,
  };

  const intents = readAdoptionIntents();
  intents.push(intent);
  writeAdoptionIntents(intents);

  return intent;
}

// ---------------------------------------------------------------------------
// Derivation intent
// ---------------------------------------------------------------------------

export function recordTemplateDerivationIntent(
  parentTemplateId: string,
  requestedTemplateId: string,
  requestedBy: string = "user",
): DerivationIntent {
  const intent: DerivationIntent = {
    intentId: `derive-${parentTemplateId}-${requestedTemplateId}-${Date.now()}`,
    parentTemplateId,
    requestedTemplateId,
    action: "derive_template_intent",
    requestedAt: new Date().toISOString(),
    requestedBy,
  };

  const intents = readDerivationIntents();
  intents.push(intent);
  writeDerivationIntents(intents);

  return intent;
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

export function buildMarketplaceReport(): MarketplaceReport {
  const items = buildMarketplaceCatalog();
  const adoptionIntents = readAdoptionIntents();
  const derivationIntents = readDerivationIntents();

  return {
    items,
    adoptionIntents,
    derivationIntents,
    summary: {
      totalItems: items.length,
      publishedCount: items.filter((i) => i.status === "published").length,
      experimentalCount: items.filter((i) => i.status === "experimental").length,
      unpublishedCount: items.filter((i) => i.status === "unpublished").length,
      adoptionIntentCount: adoptionIntents.length,
      derivationIntentCount: derivationIntents.length,
    },
    generatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function statusBadge(status: MarketplaceStatus): string {
  const badges: Record<MarketplaceStatus, string> = {
    published: "[PUBLISHED]",
    unpublished: "[UNPUBLISHED]",
    experimental: "[EXPERIMENTAL]",
  };
  return badges[status];
}

export function formatMarketplaceReport(report: MarketplaceReport): string {
  const lines: string[] = [];
  const hr = "─".repeat(60);

  lines.push(hr);
  lines.push("  TEMPLATE MARKETPLACE REPORT");
  lines.push(hr);
  lines.push(
    `  Total: ${report.summary.totalItems}  |  ` +
    `Published: ${report.summary.publishedCount}  |  ` +
    `Experimental: ${report.summary.experimentalCount}  |  ` +
    `Unpublished: ${report.summary.unpublishedCount}`,
  );
  lines.push(
    `  Adoption Intents: ${report.summary.adoptionIntentCount}  |  ` +
    `Derivation Intents: ${report.summary.derivationIntentCount}`,
  );
  lines.push("");

  if (report.items.length === 0) {
    lines.push("  マーケットプレースアイテムはありません。");
  } else {
    for (const item of report.items) {
      lines.push(`  ${statusBadge(item.status)} ${item.templateId}`);
      lines.push(`    title:      ${item.title}`);
      lines.push(`    domain:     ${item.domain}`);
      lines.push(`    health:     ${item.healthState}`);
      lines.push(`    maturity:   ${item.maturity}`);
      lines.push(`    desc:       ${item.description}`);
      if (item.capabilities.length > 0) {
        lines.push(`    entities:   ${item.capabilities.join(", ")}`);
      }
      if (item.derivationHints.length > 0) {
        lines.push(`    hints:      ${item.derivationHints.join(", ")}`);
      }
      lines.push("");
    }
  }

  if (report.adoptionIntents.length > 0) {
    lines.push(hr);
    lines.push("  ADOPTION INTENTS");
    lines.push(hr);
    for (const a of report.adoptionIntents) {
      lines.push(`  ${a.requestedAt}  ${a.templateId}  (${a.requestedBy})`);
    }
    lines.push("");
  }

  if (report.derivationIntents.length > 0) {
    lines.push(hr);
    lines.push("  DERIVATION INTENTS");
    lines.push(hr);
    for (const d of report.derivationIntents) {
      lines.push(
        `  ${d.requestedAt}  ${d.parentTemplateId} → ${d.requestedTemplateId}  (${d.requestedBy})`,
      );
    }
    lines.push("");
  }

  lines.push(hr);
  return lines.join("\n");
}
