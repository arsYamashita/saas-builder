/**
 * Marketplace Derivation Pipeline v1
 *
 * Provides:
 *   1. Read derivation intents from marketplace
 *   2. Validate parent template eligibility
 *   3. Classify derivation type (verticalized, adjacent_domain, specialization)
 *   4. Generate derived template candidate blueprint/config
 *   5. Hand off candidates into the Factory flow
 *   6. Record derivation pipeline history
 *
 * Conservative v1 — produces candidate plans only, no auto-publish/promote.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

import {
  listMarketplaceItems,
  type MarketplaceItem,
  type DerivationIntent,
} from "./template-marketplace";
import {
  TEMPLATE_DOMAIN_MAP,
  type TemplateDomain,
} from "./template-evolution-engine";
import {
  TEMPLATE_CATALOG,
  type TemplateCatalogEntry,
} from "@/lib/templates/template-catalog";
import {
  authorizeFactoryAction,
  resolveActorRole,
  type FactoryActor,
  type FactoryRole,
} from "./team-role-approval";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DerivationType = "verticalized" | "adjacent_domain" | "specialization";
export type DerivationPlanStatus = "planned" | "skipped" | "prepared" | "handed_off";

export interface DerivationEligibility {
  allowed: boolean;
  reason: string;
}

export interface DerivedCandidateConfig {
  templateId: string;
  parentTemplateId: string;
  domain: string;
  variantType: DerivationType;
  blueprintHints: string[];
  schemaHints: string[];
  apiHints: string[];
}

export interface DerivationPlan {
  derivationId: string;
  intentId: string;
  parentTemplateId: string;
  requestedTemplateId: string;
  status: DerivationPlanStatus;
  eligibility: DerivationEligibility;
  derivedCandidate: DerivedCandidateConfig | null;
  createdAt: string;
  skipReason?: string;
}

export interface DerivationHistoryEntry {
  derivationId: string;
  intentId: string;
  parentTemplateId: string;
  requestedTemplateId: string;
  status: DerivationPlanStatus;
  executedAt: string;
  executedBy: string;
}

export interface DerivationReport {
  plans: DerivationPlan[];
  history: DerivationHistoryEntry[];
  candidates: DerivedCandidateConfig[];
  summary: {
    totalIntents: number;
    plannedCount: number;
    skippedCount: number;
    preparedCount: number;
    handedOffCount: number;
  };
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

const DATA_DIR = join(process.cwd(), "data");
const CANDIDATES_PATH = join(DATA_DIR, "derived-template-candidates.json");
const HISTORY_PATH = join(DATA_DIR, "marketplace-derivation-history.json");

function ensureDataDir(): void {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

// ---------------------------------------------------------------------------
// In-memory store (for testing)
// ---------------------------------------------------------------------------

interface MemoryState {
  candidates: DerivedCandidateConfig[];
  history: DerivationHistoryEntry[];
  /** Override marketplace items for testing */
  marketplaceItemsOverride: MarketplaceItem[] | null;
  /** Override derivation intents for testing */
  derivationIntentsOverride: DerivationIntent[] | null;
  /** Override catalog for duplicate detection */
  catalogOverride: TemplateCatalogEntry[] | null;
}

let memoryState: MemoryState | null = null;

export function useInMemoryStore(
  initial?: Partial<MemoryState>,
): void {
  memoryState = {
    candidates: initial?.candidates ?? [],
    history: initial?.history ?? [],
    marketplaceItemsOverride: initial?.marketplaceItemsOverride ?? null,
    derivationIntentsOverride: initial?.derivationIntentsOverride ?? null,
    catalogOverride: initial?.catalogOverride ?? null,
  };
}

export function clearInMemoryStore(): void {
  memoryState = null;
}

// ---------------------------------------------------------------------------
// Persistence helpers
// ---------------------------------------------------------------------------

function readCandidates(): DerivedCandidateConfig[] {
  if (memoryState !== null) return memoryState.candidates;
  try {
    const raw = readFileSync(CANDIDATES_PATH, "utf-8");
    return JSON.parse(raw) as DerivedCandidateConfig[];
  } catch {
    return [];
  }
}

function writeCandidates(candidates: DerivedCandidateConfig[]): void {
  if (memoryState !== null) {
    memoryState.candidates = candidates;
    return;
  }
  ensureDataDir();
  writeFileSync(CANDIDATES_PATH, JSON.stringify(candidates, null, 2), "utf-8");
}

function readHistory(): DerivationHistoryEntry[] {
  if (memoryState !== null) return memoryState.history;
  try {
    const raw = readFileSync(HISTORY_PATH, "utf-8");
    return JSON.parse(raw) as DerivationHistoryEntry[];
  } catch {
    return [];
  }
}

function writeHistory(history: DerivationHistoryEntry[]): void {
  if (memoryState !== null) {
    memoryState.history = history;
    return;
  }
  ensureDataDir();
  writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2), "utf-8");
}

// ---------------------------------------------------------------------------
// Data source helpers
// ---------------------------------------------------------------------------

function getMarketplaceItems(): MarketplaceItem[] {
  if (memoryState?.marketplaceItemsOverride !== null && memoryState !== null) {
    return memoryState.marketplaceItemsOverride;
  }
  return listMarketplaceItems();
}

function getDerivationIntents(): DerivationIntent[] {
  if (memoryState?.derivationIntentsOverride !== null && memoryState !== null) {
    return memoryState.derivationIntentsOverride;
  }
  // Read from marketplace's storage via import
  // For real usage, we read from the marketplace module
  return listMarketplaceItems().length >= 0 ? getDerivationIntentsFromFile() : [];
}

function getDerivationIntentsFromFile(): DerivationIntent[] {
  try {
    const raw = readFileSync(
      join(process.cwd(), "data", "template-derivation-intents.json"),
      "utf-8",
    );
    return JSON.parse(raw) as DerivationIntent[];
  } catch {
    return [];
  }
}

function getCatalogTemplateKeys(): Set<string> {
  if (memoryState?.catalogOverride !== null && memoryState !== null) {
    return new Set(memoryState.catalogOverride.map((c) => c.templateKey));
  }
  return new Set(TEMPLATE_CATALOG.map((c) => c.templateKey));
}

// ---------------------------------------------------------------------------
// Derivation classification
// ---------------------------------------------------------------------------

/** Deterministic hint-based candidate generation */
const VERTICAL_HINTS: Record<string, {
  blueprintHints: string[];
  schemaHints: string[];
  apiHints: string[];
}> = {
  restaurant_reservation_saas: {
    blueprintHints: ["restaurant booking flow", "table management", "menu/service category support"],
    schemaHints: ["tables", "party_size", "seating_preference", "menu_categories"],
    apiHints: ["reserve table", "list available slots", "assign seating"],
  },
  clinic_reservation_saas: {
    blueprintHints: ["clinic appointment flow", "doctor/department selection", "patient records"],
    schemaHints: ["doctors", "departments", "appointment_types", "patient_records"],
    apiHints: ["book appointment", "list available doctors", "manage patient"],
  },
  salon_reservation_saas: {
    blueprintHints: ["salon booking flow", "stylist selection", "service menu management"],
    schemaHints: ["stylists", "service_menus", "booking_slots"],
    apiHints: ["book stylist", "list services", "manage staff schedule"],
  },
  online_school_saas: {
    blueprintHints: ["course management", "student enrollment", "content delivery"],
    schemaHints: ["courses", "lessons", "enrollments", "progress_tracking"],
    apiHints: ["enroll student", "list courses", "track progress"],
  },
  media_subscription_saas: {
    blueprintHints: ["media content library", "subscription tiers", "content access control"],
    schemaHints: ["media_items", "subscription_tiers", "access_rules"],
    apiHints: ["subscribe to tier", "list media", "check access"],
  },
  fan_community_saas: {
    blueprintHints: ["fan community hub", "exclusive content access", "event management"],
    schemaHints: ["fan_profiles", "exclusive_content", "events", "tiers"],
    apiHints: ["join community", "access content", "register event"],
  },
  learning_community_saas: {
    blueprintHints: ["learning group management", "course sharing", "peer discussion"],
    schemaHints: ["study_groups", "shared_courses", "discussions", "assignments"],
    apiHints: ["create group", "share course", "post discussion"],
  },
  real_estate_crm_saas: {
    blueprintHints: ["property listing management", "lead tracking", "showing scheduling"],
    schemaHints: ["properties", "leads", "showings", "offers"],
    apiHints: ["list property", "track lead", "schedule showing"],
  },
  recruitment_crm_saas: {
    blueprintHints: ["candidate pipeline", "job posting management", "interview scheduling"],
    schemaHints: ["candidates", "job_postings", "interviews", "pipeline_stages"],
    apiHints: ["add candidate", "post job", "schedule interview"],
  },
  helpdesk_ops_saas: {
    blueprintHints: ["ticket management", "SLA tracking", "knowledge base"],
    schemaHints: ["tickets", "sla_rules", "knowledge_articles", "agents"],
    apiHints: ["create ticket", "assign agent", "search knowledge base"],
  },
  facility_management_saas: {
    blueprintHints: ["facility booking", "maintenance requests", "asset tracking"],
    schemaHints: ["facilities", "bookings", "maintenance_requests", "assets"],
    apiHints: ["book facility", "submit maintenance", "track asset"],
  },
};

/**
 * Classify derivation type based on parent/child relationship.
 */
export function classifyDerivationType(
  parentTemplateId: string,
  requestedTemplateId: string,
): DerivationType {
  const parentDomains = TEMPLATE_DOMAIN_MAP[parentTemplateId] ?? [];

  // Check if the requested template name contains a domain keyword not in parent
  const requestedLower = requestedTemplateId.toLowerCase();
  const parentLower = parentTemplateId.toLowerCase();

  // If the child name shares the parent's core word (e.g., "reservation" in both)
  // it's a verticalization or specialization
  const parentCoreWords = parentLower.replace(/_saas$/, "").split("_");
  const childCoreWords = requestedLower.replace(/_saas$/, "").split("_");

  // Count shared core words
  const shared = parentCoreWords.filter((w) => childCoreWords.includes(w));

  if (shared.length === 0) {
    // No overlap in naming → adjacent domain
    return "adjacent_domain";
  }

  // Check if child adds a domain-specific prefix (e.g., "restaurant_" + "reservation")
  if (childCoreWords.length > parentCoreWords.length) {
    return "verticalized";
  }

  // Child specializes by swapping a generic word for a specific one
  return "specialization";
}

// ---------------------------------------------------------------------------
// Eligibility
// ---------------------------------------------------------------------------

/**
 * Evaluate whether a parent template is eligible for derivation.
 */
export function evaluateDerivationEligibility(
  parentTemplateId: string,
  requestedTemplateId: string,
): DerivationEligibility {
  const items = getMarketplaceItems();
  const parentItem = items.find((i) => i.templateId === parentTemplateId);

  if (!parentItem) {
    return {
      allowed: false,
      reason: `Parent template "${parentTemplateId}" not found in marketplace`,
    };
  }

  if (parentItem.status !== "published") {
    return {
      allowed: false,
      reason: `Parent template is ${parentItem.status}, must be published`,
    };
  }

  if (parentItem.healthState !== "green") {
    return {
      allowed: false,
      reason: `Parent template health is ${parentItem.healthState}, must be green`,
    };
  }

  if (parentItem.maturity !== "production_ready") {
    return {
      allowed: false,
      reason: `Parent template maturity is ${parentItem.maturity}, must be production_ready`,
    };
  }

  // Check if requested template already exists in catalog
  const existingKeys = getCatalogTemplateKeys();
  if (existingKeys.has(requestedTemplateId)) {
    return {
      allowed: false,
      reason: `Requested template "${requestedTemplateId}" already exists in template catalog`,
    };
  }

  // Check if already planned/prepared in history
  const history = readHistory();
  const alreadyProcessed = history.find(
    (h) =>
      h.requestedTemplateId === requestedTemplateId &&
      (h.status === "prepared" || h.status === "handed_off"),
  );
  if (alreadyProcessed) {
    return {
      allowed: false,
      reason: `Requested template "${requestedTemplateId}" already processed (${alreadyProcessed.status})`,
    };
  }

  return {
    allowed: true,
    reason: "Parent template is published, green, and production_ready",
  };
}

// ---------------------------------------------------------------------------
// Candidate generation
// ---------------------------------------------------------------------------

/**
 * Generate a derived candidate config from a parent template and intent.
 */
export function prepareDerivedTemplateCandidate(
  parentTemplateId: string,
  requestedTemplateId: string,
): DerivedCandidateConfig {
  const parentDomains = TEMPLATE_DOMAIN_MAP[parentTemplateId] ?? [];
  const domain = parentDomains[0] ?? "general";
  const variantType = classifyDerivationType(parentTemplateId, requestedTemplateId);

  // Use known hints if available, otherwise generate from parent
  const knownHints = VERTICAL_HINTS[requestedTemplateId];

  if (knownHints) {
    return {
      templateId: requestedTemplateId,
      parentTemplateId,
      domain,
      variantType,
      blueprintHints: knownHints.blueprintHints,
      schemaHints: knownHints.schemaHints,
      apiHints: knownHints.apiHints,
    };
  }

  // Generate generic hints from parent catalog entry
  const catalogEntry = getCatalogEntryForParent(parentTemplateId);
  const coreEntities = catalogEntry?.coreEntities ?? [];
  const childLabel = requestedTemplateId
    .replace(/_saas$/, "")
    .replace(/_/g, " ");

  return {
    templateId: requestedTemplateId,
    parentTemplateId,
    domain,
    variantType,
    blueprintHints: [
      `${childLabel} management workflow`,
      `derived from ${parentTemplateId}`,
      `${variantType} variant`,
    ],
    schemaHints: [...coreEntities],
    apiHints: coreEntities.map((e) => `manage ${e}`),
  };
}

function getCatalogEntryForParent(
  parentTemplateId: string,
): TemplateCatalogEntry | undefined {
  if (memoryState?.catalogOverride !== null && memoryState !== null) {
    return memoryState.catalogOverride.find(
      (c) => c.templateKey === parentTemplateId,
    );
  }
  return TEMPLATE_CATALOG.find((c) => c.templateKey === parentTemplateId);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Collect all pending derivation intents from marketplace.
 */
export function collectDerivationIntents(): DerivationIntent[] {
  return getDerivationIntents();
}

/**
 * Build derivation plans for all pending intents (dry-run).
 */
export function buildDerivationPlans(): DerivationPlan[] {
  const intents = getDerivationIntents();
  const plans: DerivationPlan[] = [];

  for (const intent of intents) {
    const derivationId = `derive-plan-${intent.parentTemplateId}-to-${intent.requestedTemplateId}`;
    const eligibility = evaluateDerivationEligibility(
      intent.parentTemplateId,
      intent.requestedTemplateId,
    );

    if (!eligibility.allowed) {
      plans.push({
        derivationId,
        intentId: intent.intentId,
        parentTemplateId: intent.parentTemplateId,
        requestedTemplateId: intent.requestedTemplateId,
        status: "skipped",
        eligibility,
        derivedCandidate: null,
        createdAt: new Date().toISOString(),
        skipReason: eligibility.reason,
      });
      continue;
    }

    const candidate = prepareDerivedTemplateCandidate(
      intent.parentTemplateId,
      intent.requestedTemplateId,
    );

    plans.push({
      derivationId,
      intentId: intent.intentId,
      parentTemplateId: intent.parentTemplateId,
      requestedTemplateId: intent.requestedTemplateId,
      status: "planned",
      eligibility,
      derivedCandidate: candidate,
      createdAt: new Date().toISOString(),
    });
  }

  return plans;
}

/**
 * Execute handoff: write eligible candidates to store and record history.
 *
 * Requires authorization: marketplace.derive (enforced when actor is provided).
 */
export function handoffDerivedCandidates(
  options: {
    intentId?: string;
    executedBy?: string;
    actor?: FactoryActor;
  } = {},
): {
  prepared: DerivationPlan[];
  skipped: DerivationPlan[];
  history: DerivationHistoryEntry[];
} {
  const executedBy = options.executedBy ?? "user";

  // Authorization check
  if (options.actor) {
    const authResult = authorizeFactoryAction(options.actor, "marketplace.derive");
    if (!authResult.allowed) {
      return {
        prepared: [],
        skipped: [],
        history: [],
      };
    }
  }

  let plans = buildDerivationPlans();

  // Filter to single intent if specified
  if (options.intentId) {
    plans = plans.filter((p) => p.intentId === options.intentId);
  }

  const candidates = readCandidates();
  const historyStore = readHistory();
  const prepared: DerivationPlan[] = [];
  const skipped: DerivationPlan[] = [];
  const newHistory: DerivationHistoryEntry[] = [];

  for (const plan of plans) {
    if (plan.status === "skipped" || !plan.derivedCandidate) {
      skipped.push(plan);
      continue;
    }

    // Check if already in candidate store
    const alreadyExists = candidates.find(
      (c) => c.templateId === plan.requestedTemplateId,
    );
    if (alreadyExists) {
      plan.status = "skipped";
      plan.skipReason = "Candidate already exists in store";
      skipped.push(plan);
      continue;
    }

    // Write candidate
    candidates.push(plan.derivedCandidate);
    plan.status = "handed_off";

    const entry: DerivationHistoryEntry = {
      derivationId: plan.derivationId,
      intentId: plan.intentId,
      parentTemplateId: plan.parentTemplateId,
      requestedTemplateId: plan.requestedTemplateId,
      status: "handed_off",
      executedAt: new Date().toISOString(),
      executedBy,
    };
    newHistory.push(entry);
    historyStore.push(entry);
    prepared.push(plan);
  }

  writeCandidates(candidates);
  writeHistory(historyStore);

  return { prepared, skipped, history: newHistory };
}

/**
 * List derivation pipeline history.
 */
export function listDerivationHistory(): DerivationHistoryEntry[] {
  return readHistory();
}

/**
 * Build a derivation report.
 */
export function buildDerivationReport(): DerivationReport {
  const plans = buildDerivationPlans();
  const history = readHistory();
  const candidates = readCandidates();

  return {
    plans,
    history,
    candidates,
    summary: {
      totalIntents: plans.length,
      plannedCount: plans.filter((p) => p.status === "planned").length,
      skippedCount: plans.filter((p) => p.status === "skipped").length,
      preparedCount: plans.filter((p) => p.status === "prepared").length,
      handedOffCount: history.filter((h) => h.status === "handed_off").length,
    },
    generatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function statusBadge(status: DerivationPlanStatus): string {
  const badges: Record<DerivationPlanStatus, string> = {
    planned: "[PLANNED]",
    skipped: "[SKIPPED]",
    prepared: "[PREPARED]",
    handed_off: "[HANDED_OFF]",
  };
  return badges[status];
}

export function formatDerivationReport(report: DerivationReport): string {
  const lines: string[] = [];
  const hr = "─".repeat(60);

  lines.push(hr);
  lines.push("  MARKETPLACE DERIVATION PIPELINE REPORT");
  lines.push(hr);
  lines.push(
    `  Total: ${report.summary.totalIntents}  |  ` +
    `Planned: ${report.summary.plannedCount}  |  ` +
    `Skipped: ${report.summary.skippedCount}  |  ` +
    `Handed Off: ${report.summary.handedOffCount}`,
  );
  lines.push("");

  if (report.plans.length === 0) {
    lines.push("  派生パイプラインの対象はありません。");
  } else {
    for (const plan of report.plans) {
      lines.push(`  ${statusBadge(plan.status)} ${plan.derivationId}`);
      lines.push(`    intent:    ${plan.intentId}`);
      lines.push(`    parent:    ${plan.parentTemplateId}`);
      lines.push(`    requested: ${plan.requestedTemplateId}`);
      lines.push(
        `    eligible:  ${plan.eligibility.allowed ? "Yes" : "No"} — ${plan.eligibility.reason}`,
      );
      if (plan.derivedCandidate) {
        lines.push(`    type:      ${plan.derivedCandidate.variantType}`);
        lines.push(`    domain:    ${plan.derivedCandidate.domain}`);
        lines.push(`    blueprint: ${plan.derivedCandidate.blueprintHints.join(", ")}`);
      }
      if (plan.skipReason) {
        lines.push(`    reason:    ${plan.skipReason}`);
      }
      lines.push("");
    }
  }

  if (report.candidates.length > 0) {
    lines.push(hr);
    lines.push("  DERIVED CANDIDATES");
    lines.push(hr);
    for (const c of report.candidates) {
      lines.push(`  ${c.templateId} (from ${c.parentTemplateId})`);
      lines.push(`    domain:  ${c.domain}  |  type: ${c.variantType}`);
      lines.push(`    schema:  ${c.schemaHints.join(", ")}`);
    }
    lines.push("");
  }

  if (report.history.length > 0) {
    lines.push(hr);
    lines.push("  DERIVATION HISTORY");
    lines.push(hr);
    for (const h of report.history) {
      lines.push(
        `  ${h.executedAt}  ${h.derivationId}  ${h.status.toUpperCase()}  (${h.executedBy})`,
      );
    }
    lines.push("");
  }

  lines.push(hr);
  return lines.join("\n");
}
