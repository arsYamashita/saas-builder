/**
 * Template Evolution Engine v1
 *
 * Deterministic system that proposes new SaaS template opportunities
 * by analyzing the existing catalog, detecting domain gaps, and
 * identifying template cluster patterns.
 *
 * Pure logic layer — does NOT generate templates, only proposes them.
 * No DB changes, no catalog mutations, no external APIs, no ML.
 *
 * Evolution rules:
 *   A. Workflow template exists but support missing → support_ticket_saas
 *   B. Community templates exist → course_platform_saas
 *   C. Reservation exists → booking_marketplace_saas
 *   D. CRM exists → invoicing_saas
 *   E. Multiple related templates → verticalized variants
 */

import {
  TEMPLATE_CATALOG,
  type TemplateCatalogEntry,
} from "../templates/template-catalog";
import type { TemplateHealthState } from "./template-health-governance";

// ── Domain Classification ────────────────────────────────────

export type TemplateDomain =
  | "membership"
  | "commerce"
  | "crm"
  | "reservation"
  | "operations"
  | "community"
  | "support"
  | "education"
  | "marketplace"
  | "finance"
  | "analytics"
  | "communication";

/**
 * Maps template keys to their primary domains.
 * Used for gap detection and cluster analysis.
 */
export const TEMPLATE_DOMAIN_MAP: Record<string, TemplateDomain[]> = {
  membership_content_affiliate: ["membership", "commerce"],
  reservation_saas: ["reservation"],
  community_membership_saas: ["community", "membership"],
  simple_crm_saas: ["crm"],
  internal_admin_ops_saas: ["operations"],
};

/**
 * All known SaaS domains the Factory could serve.
 */
export const ALL_DOMAINS: TemplateDomain[] = [
  "membership",
  "commerce",
  "crm",
  "reservation",
  "operations",
  "community",
  "support",
  "education",
  "marketplace",
  "finance",
  "analytics",
  "communication",
];

// ── Template Proposal Model ──────────────────────────────────

export interface TemplateProposal {
  templateId: string;
  domain: TemplateDomain;
  description: string;
  relatedTemplates: string[];
  confidence: number;
  reasons: string[];
  suggestedPipelineConfig: {
    blueprintHints: string[];
    schemaHints: string[];
    apiHints: string[];
  };
}

// ── Cluster Pattern Model ────────────────────────────────────

export interface TemplateCluster {
  name: string;
  memberTemplates: string[];
  domains: TemplateDomain[];
  expansionOpportunities: string[];
}

// ── Evolution Report ─────────────────────────────────────────

export interface EvolutionReport {
  analyzedTemplateCount: number;
  coveredDomains: TemplateDomain[];
  uncoveredDomains: TemplateDomain[];
  clusters: TemplateCluster[];
  proposals: TemplateProposal[];
  evaluatedAt: string;
}

// ── Cluster Expansion Rules ──────────────────────────────────

/**
 * Deterministic rules that propose new templates based on existing
 * catalog composition. Each rule fires when its preconditions are met.
 */
interface EvolutionRule {
  id: string;
  /** Domain tags that must be present in the catalog */
  requiredDomains: TemplateDomain[];
  /** Template keys that trigger this rule (at least one must exist) */
  triggerTemplates?: string[];
  /** The proposal generated when this rule fires */
  proposal: Omit<TemplateProposal, "confidence" | "reasons">;
  /** Base confidence (0–1) for this rule */
  baseConfidence: number;
  /** Reasons explaining why this proposal is generated */
  reasonTemplates: string[];
}

export const EVOLUTION_RULES: EvolutionRule[] = [
  // Rule A: workflow exists but support missing
  {
    id: "support_from_ops",
    requiredDomains: ["operations"],
    proposal: {
      templateId: "support_ticket_saas",
      domain: "support",
      description: "Helpdesk and ticket management SaaS with SLA tracking and agent assignment",
      relatedTemplates: ["internal_admin_ops_saas", "simple_crm_saas"],
      suggestedPipelineConfig: {
        blueprintHints: ["ticket lifecycle", "SLA rules", "agent queue"],
        schemaHints: ["tickets", "agents", "sla_policies", "ticket_comments"],
        apiHints: ["ticket CRUD", "assignment", "SLA monitoring"],
      },
    },
    baseConfidence: 0.78,
    reasonTemplates: [
      "operations template exists but support workflow missing",
      "high success patterns in workflow templates",
      "common SaaS category",
    ],
  },

  // Rule B: community exists → course platform
  {
    id: "course_from_community",
    requiredDomains: ["community"],
    proposal: {
      templateId: "course_platform_saas",
      domain: "education",
      description: "Online course platform with curriculum management, student progress, and certification",
      relatedTemplates: ["community_membership_saas", "membership_content_affiliate"],
      suggestedPipelineConfig: {
        blueprintHints: ["course structure", "lesson progression", "quiz/assessment"],
        schemaHints: ["courses", "lessons", "enrollments", "progress", "certificates"],
        apiHints: ["enrollment", "progress tracking", "certificate generation"],
      },
    },
    baseConfidence: 0.74,
    reasonTemplates: [
      "community template exists with membership patterns",
      "course platform extends community with structured learning",
      "high demand SaaS vertical",
    ],
  },

  // Rule C: reservation exists → booking marketplace
  {
    id: "marketplace_from_reservation",
    requiredDomains: ["reservation"],
    proposal: {
      templateId: "booking_marketplace_saas",
      domain: "marketplace",
      description: "Multi-vendor booking marketplace with vendor profiles, availability, and commission management",
      relatedTemplates: ["reservation_saas"],
      suggestedPipelineConfig: {
        blueprintHints: ["vendor onboarding", "availability calendar", "commission split"],
        schemaHints: ["vendors", "listings", "bookings", "reviews", "payouts"],
        apiHints: ["vendor CRUD", "availability search", "booking flow", "payout calculation"],
      },
    },
    baseConfidence: 0.68,
    reasonTemplates: [
      "reservation template exists as foundation",
      "marketplace extends reservation with multi-vendor support",
      "high-value SaaS vertical",
    ],
  },

  // Rule D: CRM exists → invoicing
  {
    id: "invoicing_from_crm",
    requiredDomains: ["crm"],
    proposal: {
      templateId: "invoicing_saas",
      domain: "finance",
      description: "Invoice management SaaS with client billing, payment tracking, and recurring invoices",
      relatedTemplates: ["simple_crm_saas"],
      suggestedPipelineConfig: {
        blueprintHints: ["invoice lifecycle", "payment terms", "recurring schedules"],
        schemaHints: ["invoices", "line_items", "payments", "clients", "recurring_schedules"],
        apiHints: ["invoice CRUD", "payment recording", "PDF generation", "overdue alerts"],
      },
    },
    baseConfidence: 0.72,
    reasonTemplates: [
      "CRM template exists but finance workflow missing",
      "invoicing is natural extension of client management",
      "common SaaS need for small businesses",
    ],
  },

  // Rule E: reservation → restaurant vertical
  {
    id: "restaurant_from_reservation",
    requiredDomains: ["reservation"],
    proposal: {
      templateId: "restaurant_reservation_saas",
      domain: "reservation",
      description: "Restaurant-specific reservation system with table management, waitlist, and menu integration",
      relatedTemplates: ["reservation_saas"],
      suggestedPipelineConfig: {
        blueprintHints: ["table layout", "seating capacity", "waitlist queue"],
        schemaHints: ["tables", "reservations", "waitlist_entries", "menus", "time_slots"],
        apiHints: ["table availability", "waitlist management", "reservation with party size"],
      },
    },
    baseConfidence: 0.62,
    reasonTemplates: [
      "reservation template exists as horizontal foundation",
      "restaurant vertical adds domain-specific entities (tables, menus)",
      "verticalized templates increase conversion",
    ],
  },

  // Rule: membership + commerce → subscription box
  {
    id: "subscription_box_from_membership",
    requiredDomains: ["membership", "commerce"],
    proposal: {
      templateId: "subscription_box_saas",
      domain: "commerce",
      description: "Subscription box management with product curation, shipping schedules, and subscriber preferences",
      relatedTemplates: ["membership_content_affiliate"],
      suggestedPipelineConfig: {
        blueprintHints: ["box curation", "shipping cycle", "subscriber preferences"],
        schemaHints: ["boxes", "products", "subscriptions", "shipments", "preferences"],
        apiHints: ["box CRUD", "subscription management", "shipment tracking"],
      },
    },
    baseConfidence: 0.58,
    reasonTemplates: [
      "membership and commerce patterns exist",
      "subscription box extends membership with physical product curation",
      "growing SaaS niche",
    ],
  },

  // Rule: community + membership → event management
  {
    id: "event_from_community",
    requiredDomains: ["community", "membership"],
    proposal: {
      templateId: "event_management_saas",
      domain: "community",
      description: "Event planning and management SaaS with registration, ticketing, and attendee management",
      relatedTemplates: ["community_membership_saas"],
      suggestedPipelineConfig: {
        blueprintHints: ["event creation", "ticket types", "check-in flow"],
        schemaHints: ["events", "tickets", "registrations", "venues", "speakers"],
        apiHints: ["event CRUD", "registration flow", "ticket validation"],
      },
    },
    baseConfidence: 0.65,
    reasonTemplates: [
      "community and membership patterns exist",
      "event management extends community with scheduling and ticketing",
      "natural complement to community platforms",
    ],
  },

  // Rule: CRM + operations → project management
  {
    id: "project_mgmt_from_crm_ops",
    requiredDomains: ["crm", "operations"],
    proposal: {
      templateId: "project_management_saas",
      domain: "operations",
      description: "Project and task management SaaS with timelines, assignments, and progress tracking",
      relatedTemplates: ["simple_crm_saas", "internal_admin_ops_saas"],
      suggestedPipelineConfig: {
        blueprintHints: ["project lifecycle", "task dependencies", "milestone tracking"],
        schemaHints: ["projects", "tasks", "milestones", "assignments", "time_entries"],
        apiHints: ["project CRUD", "task management", "timeline view", "progress reports"],
      },
    },
    baseConfidence: 0.70,
    reasonTemplates: [
      "CRM and operations templates provide workflow foundation",
      "project management combines client tracking with task workflow",
      "high-demand SaaS category",
    ],
  },
];

// ── Catalog Analysis ─────────────────────────────────────────

/**
 * Analyzes the template catalog and returns covered domains.
 */
export function analyzeTemplateCatalog(
  catalog?: TemplateCatalogEntry[]
): {
  templates: TemplateCatalogEntry[];
  coveredDomains: TemplateDomain[];
  templateDomains: Map<string, TemplateDomain[]>;
} {
  const templates = catalog ?? TEMPLATE_CATALOG;
  const domainSet = new Set<TemplateDomain>();
  const templateDomains = new Map<string, TemplateDomain[]>();

  for (const entry of templates) {
    const domains = TEMPLATE_DOMAIN_MAP[entry.templateKey] ?? [];
    templateDomains.set(entry.templateKey, domains);
    for (const d of domains) domainSet.add(d);
  }

  return {
    templates,
    coveredDomains: Array.from(domainSet),
    templateDomains,
  };
}

// ── Domain Gap Detection ─────────────────────────────────────

/**
 * Detects uncovered SaaS domains by comparing catalog coverage
 * against the full domain list.
 */
export function detectDomainGaps(
  catalog?: TemplateCatalogEntry[]
): {
  coveredDomains: TemplateDomain[];
  uncoveredDomains: TemplateDomain[];
  coverageRatio: number;
} {
  const { coveredDomains } = analyzeTemplateCatalog(catalog);
  const coveredSet = new Set(coveredDomains);
  const uncoveredDomains = ALL_DOMAINS.filter((d) => !coveredSet.has(d));

  return {
    coveredDomains,
    uncoveredDomains,
    coverageRatio: Math.round((coveredDomains.length / ALL_DOMAINS.length) * 100) / 100,
  };
}

// ── Cluster Detection ────────────────────────────────────────

/**
 * Derives template clusters based on shared domains.
 * Templates sharing at least one domain are grouped.
 */
export function deriveTemplateClusters(
  catalog?: TemplateCatalogEntry[]
): TemplateCluster[] {
  const { templates, templateDomains } = analyzeTemplateCatalog(catalog);
  const clusters: TemplateCluster[] = [];

  // Group by shared domains
  const domainToTemplates = new Map<TemplateDomain, string[]>();
  for (const [key, domains] of Array.from(templateDomains.entries())) {
    for (const d of domains) {
      const existing = domainToTemplates.get(d) ?? [];
      existing.push(key);
      domainToTemplates.set(d, existing);
    }
  }

  // Build clusters from domains with 2+ templates
  for (const [domain, members] of Array.from(domainToTemplates.entries())) {
    if (members.length >= 2) {
      const allDomains = new Set<TemplateDomain>();
      for (const m of members) {
        for (const d of templateDomains.get(m) ?? []) allDomains.add(d);
      }

      // Find evolution rules that these templates could trigger
      const expansions: string[] = [];
      for (const rule of EVOLUTION_RULES) {
        const hasTrigger = rule.requiredDomains.every((rd) => allDomains.has(rd));
        if (hasTrigger) expansions.push(rule.proposal.templateId);
      }

      clusters.push({
        name: `${domain}_cluster`,
        memberTemplates: members,
        domains: Array.from(allDomains),
        expansionOpportunities: expansions,
      });
    }
  }

  return clusters;
}

// ── Proposal Generation ──────────────────────────────────────

/**
 * Confidence modifiers based on catalog health signals.
 */
export interface EvolutionContext {
  /** Health states per template (from governance) */
  templateHealthStates?: Map<string, TemplateHealthState>;
  /** Number of GREEN templates in the catalog */
  greenTemplateCount?: number;
}

/**
 * Proposes new template candidates by evaluating evolution rules
 * against the current catalog.
 *
 * Confidence is adjusted based on:
 * - Number of related GREEN templates (more = higher)
 * - Health state of related templates (degraded = lower)
 * - Domain gap priority (uncovered domain = higher)
 */
export function proposeTemplateCandidates(
  catalog?: TemplateCatalogEntry[],
  context?: EvolutionContext
): TemplateProposal[] {
  const { coveredDomains, templateDomains } = analyzeTemplateCatalog(catalog);
  const coveredSet = new Set(coveredDomains);
  const existingTemplateKeys = new Set(
    Array.from(templateDomains.keys())
  );

  const proposals: TemplateProposal[] = [];

  for (const rule of EVOLUTION_RULES) {
    // Check if all required domains are covered
    const allDomainsMet = rule.requiredDomains.every((d) => coveredSet.has(d));
    if (!allDomainsMet) continue;

    // Check trigger templates if specified
    if (rule.triggerTemplates) {
      const hasTrigger = rule.triggerTemplates.some((t) => existingTemplateKeys.has(t));
      if (!hasTrigger) continue;
    }

    // Skip if proposed template already exists
    if (existingTemplateKeys.has(rule.proposal.templateId)) continue;

    // Compute adjusted confidence
    let confidence = rule.baseConfidence;

    // Boost: target domain is uncovered
    if (!coveredSet.has(rule.proposal.domain)) {
      confidence += 0.05;
    }

    // Boost/penalty from health context
    if (context?.templateHealthStates) {
      const relatedHealth = rule.proposal.relatedTemplates
        .map((t) => context.templateHealthStates!.get(t))
        .filter((h): h is TemplateHealthState => h != null);

      const greenRelated = relatedHealth.filter((h) => h === "green").length;
      const degradedRelated = relatedHealth.filter(
        (h) => h === "degraded" || h === "demoted"
      ).length;

      confidence += greenRelated * 0.03;
      confidence -= degradedRelated * 0.05;
    }

    // Boost: more GREEN templates in catalog = more mature factory
    if (context?.greenTemplateCount != null && context.greenTemplateCount >= 4) {
      confidence += 0.02;
    }

    // Clamp confidence
    confidence = Math.round(Math.min(1, Math.max(0, confidence)) * 100) / 100;

    // Build reasons with template substitution
    const reasons = rule.reasonTemplates.map((r) => r);

    proposals.push({
      ...rule.proposal,
      confidence,
      reasons,
    });
  }

  // Sort by confidence descending
  proposals.sort((a, b) => b.confidence - a.confidence);

  return proposals;
}

// ── Evolution Report ─────────────────────────────────────────

/**
 * Builds a complete evolution report: catalog analysis, gaps,
 * clusters, and proposals.
 */
export function buildEvolutionReport(
  catalog?: TemplateCatalogEntry[],
  context?: EvolutionContext
): EvolutionReport {
  const { coveredDomains } = analyzeTemplateCatalog(catalog);
  const { uncoveredDomains } = detectDomainGaps(catalog);
  const clusters = deriveTemplateClusters(catalog);
  const proposals = proposeTemplateCandidates(catalog, context);

  return {
    analyzedTemplateCount: (catalog ?? TEMPLATE_CATALOG).length,
    coveredDomains,
    uncoveredDomains,
    clusters,
    proposals,
    evaluatedAt: new Date().toISOString(),
  };
}

// ── Console Report Formatting ────────────────────────────────

export function formatEvolutionReport(report: EvolutionReport): string {
  const lines: string[] = [];

  lines.push("=== TEMPLATE EVOLUTION ENGINE ===");
  lines.push("");
  lines.push(`Templates analyzed: ${report.analyzedTemplateCount}`);
  lines.push(`Covered domains:    ${report.coveredDomains.join(", ")}`);
  lines.push(`Uncovered domains:  ${report.uncoveredDomains.join(", ") || "none"}`);
  lines.push("");

  if (report.clusters.length > 0) {
    lines.push("── Clusters ──");
    for (const c of report.clusters) {
      lines.push(`  ${c.name}: ${c.memberTemplates.join(", ")}`);
      if (c.expansionOpportunities.length > 0) {
        lines.push(`    → expansions: ${c.expansionOpportunities.join(", ")}`);
      }
    }
    lines.push("");
  }

  lines.push("── Proposals ──");
  if (report.proposals.length === 0) {
    lines.push("  (no proposals)");
  } else {
    for (const p of report.proposals) {
      lines.push(`  ${p.templateId} [${p.domain}] confidence=${p.confidence}`);
      lines.push(`    ${p.description}`);
      lines.push(`    related: ${p.relatedTemplates.join(", ")}`);
      lines.push(`    reasons:`);
      for (const r of p.reasons) {
        lines.push(`      - ${r}`);
      }
      lines.push("");
    }
  }

  lines.push("=== SUMMARY ===");
  lines.push(`Total proposals: ${report.proposals.length}`);
  if (report.proposals.length > 0) {
    lines.push(`Top proposal:    ${report.proposals[0].templateId} (${report.proposals[0].confidence})`);
  }

  return lines.join("\n");
}
