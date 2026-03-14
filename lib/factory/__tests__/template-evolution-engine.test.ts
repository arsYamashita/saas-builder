/**
 * Template Evolution Engine v1 — Unit Tests
 *
 * Covers:
 * - Domain gap detection
 * - Cluster detection
 * - Proposal generation and confidence scoring
 * - Evolution rule firing
 * - Deterministic output
 * - Health context influence
 */

import { describe, it, expect } from "vitest";
import type { TemplateCatalogEntry } from "../../templates/template-catalog";
import { TEMPLATE_CATALOG } from "../../templates/template-catalog";
import type { TemplateHealthState } from "../template-health-governance";
import {
  analyzeTemplateCatalog,
  detectDomainGaps,
  deriveTemplateClusters,
  proposeTemplateCandidates,
  buildEvolutionReport,
  formatEvolutionReport,
  TEMPLATE_DOMAIN_MAP,
  ALL_DOMAINS,
  EVOLUTION_RULES,
  type TemplateDomain,
  type EvolutionContext,
} from "../template-evolution-engine";

// ── Helpers ──────────────────────────────────────────────────

function makeCatalogEntry(overrides: Partial<TemplateCatalogEntry> & {
  templateKey: string;
}): TemplateCatalogEntry {
  return {
    label: overrides.templateKey,
    shortDescription: "test",
    targetUsers: "test",
    coreEntities: [],
    includesBilling: false,
    includesAffiliate: false,
    statusBadge: "GREEN",
    recommendedFor: "test",
    ...overrides,
  };
}

// ── Domain Gap Detection ─────────────────────────────────────

describe("detectDomainGaps", () => {
  it("detects uncovered domains from full catalog", () => {
    const { coveredDomains, uncoveredDomains, coverageRatio } = detectDomainGaps();

    expect(coveredDomains.length).toBeGreaterThan(0);
    expect(uncoveredDomains.length).toBeGreaterThan(0);
    // With 5 templates covering ~5 domains out of 12
    expect(coverageRatio).toBeGreaterThan(0);
    expect(coverageRatio).toBeLessThan(1);

    // Known uncovered domains
    expect(uncoveredDomains).toContain("support");
    expect(uncoveredDomains).toContain("education");
    expect(uncoveredDomains).toContain("finance");
  });

  it("all domains covered returns empty uncovered", () => {
    // Create catalog covering all domains
    const catalog: TemplateCatalogEntry[] = ALL_DOMAINS.map((d) =>
      makeCatalogEntry({ templateKey: `${d}_template` })
    );
    // Register domain mappings by mutating (test-only pattern)
    const originalMap = { ...TEMPLATE_DOMAIN_MAP };
    for (const d of ALL_DOMAINS) {
      TEMPLATE_DOMAIN_MAP[`${d}_template`] = [d];
    }

    const { uncoveredDomains } = detectDomainGaps(catalog);
    expect(uncoveredDomains).toHaveLength(0);

    // Cleanup
    for (const d of ALL_DOMAINS) {
      delete TEMPLATE_DOMAIN_MAP[`${d}_template`];
    }
  });

  it("empty catalog returns all domains as uncovered", () => {
    const { uncoveredDomains, coverageRatio } = detectDomainGaps([]);
    expect(uncoveredDomains).toEqual(ALL_DOMAINS);
    expect(coverageRatio).toBe(0);
  });
});

// ── Cluster Detection ────────────────────────────────────────

describe("deriveTemplateClusters", () => {
  it("detects membership cluster from full catalog", () => {
    const clusters = deriveTemplateClusters();

    // membership_content_affiliate and community_membership_saas share "membership"
    const membershipCluster = clusters.find((c) => c.name === "membership_cluster");
    expect(membershipCluster).toBeDefined();
    expect(membershipCluster!.memberTemplates).toContain("membership_content_affiliate");
    expect(membershipCluster!.memberTemplates).toContain("community_membership_saas");
  });

  it("clusters include expansion opportunities", () => {
    const clusters = deriveTemplateClusters();
    const withExpansions = clusters.filter((c) => c.expansionOpportunities.length > 0);
    expect(withExpansions.length).toBeGreaterThan(0);
  });

  it("empty catalog produces no clusters", () => {
    const clusters = deriveTemplateClusters([]);
    expect(clusters).toHaveLength(0);
  });
});

// ── Proposal Generation ──────────────────────────────────────

describe("proposeTemplateCandidates", () => {
  it("generates proposals from full catalog", () => {
    const proposals = proposeTemplateCandidates();
    expect(proposals.length).toBeGreaterThan(0);

    // Each proposal should have required fields
    for (const p of proposals) {
      expect(p.templateId).toBeDefined();
      expect(p.domain).toBeDefined();
      expect(p.description.length).toBeGreaterThan(0);
      expect(p.confidence).toBeGreaterThan(0);
      expect(p.confidence).toBeLessThanOrEqual(1);
      expect(p.reasons.length).toBeGreaterThan(0);
    }
  });

  it("proposals are sorted by confidence descending", () => {
    const proposals = proposeTemplateCandidates();
    for (let i = 1; i < proposals.length; i++) {
      expect(proposals[i - 1].confidence).toBeGreaterThanOrEqual(proposals[i].confidence);
    }
  });

  it("does not propose templates that already exist", () => {
    const proposals = proposeTemplateCandidates();
    const existingKeys = new Set(TEMPLATE_CATALOG.map((e) => e.templateKey));
    for (const p of proposals) {
      expect(existingKeys.has(p.templateId)).toBe(false);
    }
  });

  it("fires Rule A: support_ticket_saas when operations exists", () => {
    const proposals = proposeTemplateCandidates();
    const support = proposals.find((p) => p.templateId === "support_ticket_saas");
    expect(support).toBeDefined();
    expect(support!.domain).toBe("support");
  });

  it("fires Rule B: course_platform_saas when community exists", () => {
    const proposals = proposeTemplateCandidates();
    const course = proposals.find((p) => p.templateId === "course_platform_saas");
    expect(course).toBeDefined();
    expect(course!.domain).toBe("education");
  });

  it("fires Rule C: booking_marketplace_saas when reservation exists", () => {
    const proposals = proposeTemplateCandidates();
    const booking = proposals.find((p) => p.templateId === "booking_marketplace_saas");
    expect(booking).toBeDefined();
    expect(booking!.domain).toBe("marketplace");
  });

  it("fires Rule D: invoicing_saas when crm exists", () => {
    const proposals = proposeTemplateCandidates();
    const invoicing = proposals.find((p) => p.templateId === "invoicing_saas");
    expect(invoicing).toBeDefined();
    expect(invoicing!.domain).toBe("finance");
  });

  it("fires Rule E: restaurant_reservation_saas as vertical", () => {
    const proposals = proposeTemplateCandidates();
    const restaurant = proposals.find((p) => p.templateId === "restaurant_reservation_saas");
    expect(restaurant).toBeDefined();
    expect(restaurant!.relatedTemplates).toContain("reservation_saas");
  });

  it("generates no proposals from empty catalog", () => {
    const proposals = proposeTemplateCandidates([]);
    expect(proposals).toHaveLength(0);
  });
});

// ── Confidence Scoring ───────────────────────────────────────

describe("confidence scoring", () => {
  it("boosts confidence when target domain is uncovered", () => {
    const proposals = proposeTemplateCandidates();
    // support domain is uncovered → support_ticket_saas should get boost
    const support = proposals.find((p) => p.templateId === "support_ticket_saas");
    expect(support).toBeDefined();
    // Base is 0.78 + 0.05 (uncovered) = 0.83 minimum
    expect(support!.confidence).toBeGreaterThan(0.78);
  });

  it("adjusts confidence based on template health context", () => {
    const healthStates = new Map<string, TemplateHealthState>();
    healthStates.set("simple_crm_saas", "green");

    const withGreen = proposeTemplateCandidates(undefined, {
      templateHealthStates: healthStates,
    });

    healthStates.set("simple_crm_saas", "degraded");
    const withDegraded = proposeTemplateCandidates(undefined, {
      templateHealthStates: healthStates,
    });

    const invoicingGreen = withGreen.find((p) => p.templateId === "invoicing_saas");
    const invoicingDegraded = withDegraded.find((p) => p.templateId === "invoicing_saas");

    expect(invoicingGreen).toBeDefined();
    expect(invoicingDegraded).toBeDefined();
    expect(invoicingGreen!.confidence).toBeGreaterThan(invoicingDegraded!.confidence);
  });

  it("boosts confidence with high GREEN template count", () => {
    const withoutContext = proposeTemplateCandidates(undefined, undefined);
    const withContext = proposeTemplateCandidates(undefined, { greenTemplateCount: 5 });

    // At least some proposals should have higher confidence
    const p1 = withoutContext.find((p) => p.templateId === "support_ticket_saas");
    const p2 = withContext.find((p) => p.templateId === "support_ticket_saas");
    expect(p2!.confidence).toBeGreaterThanOrEqual(p1!.confidence);
  });
});

// ── Deterministic Output ─────────────────────────────────────

describe("determinism", () => {
  it("same input produces same proposals", () => {
    const r1 = proposeTemplateCandidates();
    const r2 = proposeTemplateCandidates();

    expect(r1.map((p) => p.templateId)).toEqual(r2.map((p) => p.templateId));
    expect(r1.map((p) => p.confidence)).toEqual(r2.map((p) => p.confidence));
  });
});

// ── Evolution Report ─────────────────────────────────────────

describe("buildEvolutionReport", () => {
  it("builds complete report", () => {
    const report = buildEvolutionReport();

    expect(report.analyzedTemplateCount).toBe(TEMPLATE_CATALOG.length);
    expect(report.coveredDomains.length).toBeGreaterThan(0);
    expect(report.uncoveredDomains.length).toBeGreaterThan(0);
    expect(report.proposals.length).toBeGreaterThan(0);
    expect(report.evaluatedAt).toBeDefined();
  });

  it("formatEvolutionReport produces readable output", () => {
    const report = buildEvolutionReport();
    const text = formatEvolutionReport(report);

    expect(text).toContain("TEMPLATE EVOLUTION ENGINE");
    expect(text).toContain("Proposals");
    expect(text).toContain("SUMMARY");
    expect(text).toContain("confidence=");
  });
});

// ── Catalog Analysis ─────────────────────────────────────────

describe("analyzeTemplateCatalog", () => {
  it("maps templates to domains correctly", () => {
    const { templateDomains, coveredDomains } = analyzeTemplateCatalog();

    expect(templateDomains.get("simple_crm_saas")).toEqual(["crm"]);
    expect(templateDomains.get("reservation_saas")).toEqual(["reservation"]);
    expect(coveredDomains).toContain("crm");
    expect(coveredDomains).toContain("reservation");
    expect(coveredDomains).toContain("membership");
  });
});
