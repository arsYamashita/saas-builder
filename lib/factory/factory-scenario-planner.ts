/**
 * Factory Scenario Planner v1
 *
 * Provides:
 *   1. Strategy-to-scenario conversion from portfolio strategy
 *   2. Step-by-step action plans for expand / gap_fill / stabilize
 *   3. Effort/impact estimation per scenario
 *   4. Parent template selection via Recommendation Engine
 *   5. Deterministic, explainable plan generation
 *
 * Planning only. Does NOT execute actions. No state mutation.
 */

import {
  buildPortfolioStrategyReport,
  type DomainStrategyRecord,
  type PortfolioGap,
  type PortfolioStrategyReport,
  type PortfolioInputs,
} from "./template-portfolio-strategy";
import {
  recommendBestDerivationParents,
  recommendTemplatesByDomain,
  type RecommendationRecord,
} from "./template-recommendation-engine";
import {
  buildEvolutionReport,
  TEMPLATE_DOMAIN_MAP,
  type EvolutionReport,
  type TemplateProposal,
} from "./template-evolution-engine";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ScenarioType = "expand_domain" | "fill_gap" | "stabilize_domain";

export type ScenarioStepType =
  | "derive_template"
  | "create_template"
  | "validate"
  | "release"
  | "publish"
  | "run_regression"
  | "governance_review";

export interface ScenarioStep {
  stepType: ScenarioStepType;
  description: string;
  parentTemplateId: string | null;
  targetTemplateId: string | null;
  targetStage: string | null;
}

export interface ScenarioImpact {
  coverageIncrease: number;
  portfolioStrength: number;
}

export interface FactoryScenario {
  scenarioId: string;
  type: ScenarioType;
  domain: string;
  targetTemplateCount: number;
  currentTemplateCount: number;
  gap: number;
  priorityScore: number;
  steps: ScenarioStep[];
  estimatedImpact: ScenarioImpact;
  reasons: string[];
}

export interface ScenarioReport {
  expansionScenarios: FactoryScenario[];
  gapFillScenarios: FactoryScenario[];
  stabilizationScenarios: FactoryScenario[];
  summary: {
    totalScenarios: number;
    expansionCount: number;
    gapFillCount: number;
    stabilizationCount: number;
    totalNewTemplates: number;
    averagePriority: number;
  };
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export interface ScenarioInputs {
  portfolioReport: PortfolioStrategyReport;
  evolutionReport: EvolutionReport;
  portfolioInputs?: Partial<PortfolioInputs>;
}

function collectInputs(overrides?: Partial<ScenarioInputs>): ScenarioInputs {
  return {
    portfolioReport: overrides?.portfolioReport ?? buildPortfolioStrategyReport(),
    evolutionReport: overrides?.evolutionReport ?? buildEvolutionReport(),
    portfolioInputs: overrides?.portfolioInputs,
  };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default target template count per domain for expansion */
const DEFAULT_TARGET_COUNT = 3;

/** Max templates to suggest creating per scenario */
const MAX_NEW_TEMPLATES_PER_SCENARIO = 3;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate expansion scenarios for domains with "expand" strategy.
 */
export function generateExpansionScenarios(
  overrides?: Partial<ScenarioInputs>,
): FactoryScenario[] {
  const inputs = collectInputs(overrides);
  const { portfolioReport, evolutionReport } = inputs;

  return portfolioReport.expansionPriorities.map((domain) => {
    const gap = Math.max(DEFAULT_TARGET_COUNT - domain.templateCount, 1);
    const templatesNeeded = Math.min(gap, MAX_NEW_TEMPLATES_PER_SCENARIO);

    // Find best parent in this domain
    const domainRecs = recommendTemplatesByDomain(domain.domain, inputs.portfolioInputs);
    const derivParents = recommendBestDerivationParents(inputs.portfolioInputs);
    const domainParent = domainRecs.length > 0 ? domainRecs[0]! : null;
    const bestParent = derivParents.find((p) => {
      const parentDomains = TEMPLATE_DOMAIN_MAP[p.templateId] ?? [];
      return parentDomains.includes(domain.domain as any);
    }) ?? domainParent;

    // Find evolution proposals for this domain
    const proposals = evolutionReport.proposals.filter(
      (p) => p.domain === domain.domain,
    );

    const steps = buildExpansionSteps(
      domain, bestParent, proposals, templatesNeeded,
    );
    const impact = estimateScenarioImpact(domain, templatesNeeded, "expand_domain");

    const reasons: string[] = [];
    reasons.push("High expansion priority domain");
    if (bestParent) reasons.push(`Strong base template: ${bestParent.templateId}`);
    if (domain.templateCount <= 1) reasons.push("Low current breadth");
    if (domain.averageHealthScore >= 0.8) reasons.push("Strong existing quality");
    if (domain.derivationPotential >= 0.5) reasons.push("Good derivation potential");
    if (proposals.length > 0) reasons.push(`${proposals.length} evolution proposal(s) available`);

    return {
      scenarioId: `expand-${domain.domain}-${DEFAULT_TARGET_COUNT}`,
      type: "expand_domain" as ScenarioType,
      domain: domain.domain,
      targetTemplateCount: DEFAULT_TARGET_COUNT,
      currentTemplateCount: domain.templateCount,
      gap,
      priorityScore: domain.expansionPriorityScore,
      steps,
      estimatedImpact: impact,
      reasons,
    };
  });
}

/**
 * Generate gap-fill scenarios for uncovered domains.
 */
export function generateGapFillScenarios(
  overrides?: Partial<ScenarioInputs>,
): FactoryScenario[] {
  const inputs = collectInputs(overrides);
  const { portfolioReport, evolutionReport } = inputs;

  return portfolioReport.gaps.map((gap) => {
    // Find evolution proposals for this gap domain
    const proposals = evolutionReport.proposals.filter(
      (p) => p.domain === gap.domain,
    );

    // Find best parent from adjacent domains
    const derivParents = recommendBestDerivationParents(inputs.portfolioInputs);
    const adjacentParent = derivParents.find((p) => {
      const parentDomains = TEMPLATE_DOMAIN_MAP[p.templateId] ?? [];
      return gap.adjacentDomains.some((adj) => parentDomains.includes(adj as any));
    });

    const steps = buildGapFillSteps(gap, adjacentParent ?? null, proposals);
    const impact = estimateScenarioImpact(
      { domain: gap.domain, templateCount: 0, coverageScore: 0 } as DomainStrategyRecord,
      1,
      "fill_gap",
    );

    const reasons: string[] = [];
    reasons.push(`Domain "${gap.domain}" has no templates`);
    if (gap.adjacentTemplateCount > 0) {
      reasons.push(`${gap.adjacentTemplateCount} adjacent template(s) available`);
    }
    if (proposals.length > 0) {
      reasons.push(`${proposals.length} evolution proposal(s) with avg confidence ${gap.averageProposalConfidence}`);
    }
    if (adjacentParent) {
      reasons.push(`Adjacent parent available: ${adjacentParent.templateId}`);
    }

    return {
      scenarioId: `gap-fill-${gap.domain}`,
      type: "fill_gap" as ScenarioType,
      domain: gap.domain,
      targetTemplateCount: 1,
      currentTemplateCount: 0,
      gap: 1,
      priorityScore: gap.fillPriority,
      steps,
      estimatedImpact: impact,
      reasons,
    };
  });
}

/**
 * Generate stabilization scenarios for weak-quality domains.
 */
export function generateStabilizationScenarios(
  overrides?: Partial<ScenarioInputs>,
): FactoryScenario[] {
  const inputs = collectInputs(overrides);
  const { portfolioReport } = inputs;

  return portfolioReport.stabilizationPriorities.map((domain) => {
    const steps = buildStabilizationSteps(domain);
    const impact = estimateScenarioImpact(domain, 0, "stabilize_domain");

    const reasons: string[] = [];
    if (domain.averageHealthScore < 0.6) {
      reasons.push(`Low average health (${domain.averageHealthScore})`);
    }
    if (domain.averageStabilityScore < 0.5) {
      reasons.push(`Low average stability (${domain.averageStabilityScore})`);
    }
    if (domain.greenCount < domain.templateCount) {
      reasons.push(`Only ${domain.greenCount}/${domain.templateCount} templates are green`);
    }
    reasons.push("Prioritize quality improvement before expansion");

    return {
      scenarioId: `stabilize-${domain.domain}`,
      type: "stabilize_domain" as ScenarioType,
      domain: domain.domain,
      targetTemplateCount: domain.templateCount,
      currentTemplateCount: domain.templateCount,
      gap: 0,
      priorityScore: 1.0 - domain.averageHealthScore, // lower health = higher priority
      steps,
      estimatedImpact: impact,
      reasons,
    };
  });
}

/**
 * Estimate the impact of a scenario.
 */
export function estimateScenarioImpact(
  domain: Pick<DomainStrategyRecord, "templateCount" | "coverageScore">,
  newTemplates: number,
  type: ScenarioType,
): ScenarioImpact {
  const currentCount = domain.templateCount;
  const newCount = currentCount + newTemplates;

  let coverageIncrease: number;
  let portfolioStrength: number;

  switch (type) {
    case "expand_domain": {
      // Coverage increase proportional to new templates relative to target
      coverageIncrease = newTemplates > 0
        ? round(Math.min(newTemplates / DEFAULT_TARGET_COUNT, 1.0) * 0.3)
        : 0;
      // Portfolio strength from broader coverage
      portfolioStrength = round(
        (newCount / DEFAULT_TARGET_COUNT) * 0.2 +
        (domain.coverageScore * 0.1),
      );
      break;
    }
    case "fill_gap": {
      // Filling a gap has outsized coverage impact
      coverageIncrease = round(1.0 / 12); // 1 domain out of 12 total
      portfolioStrength = round(0.15);
      break;
    }
    case "stabilize_domain": {
      // Stabilization improves quality, not coverage
      coverageIncrease = 0;
      portfolioStrength = round((1.0 - domain.coverageScore) * 0.15);
      break;
    }
  }

  return {
    coverageIncrease: round(coverageIncrease),
    portfolioStrength: round(portfolioStrength),
  };
}

/**
 * Build all scenarios from portfolio strategy.
 */
export function buildFactoryScenarios(
  overrides?: Partial<ScenarioInputs>,
): {
  expansionScenarios: FactoryScenario[];
  gapFillScenarios: FactoryScenario[];
  stabilizationScenarios: FactoryScenario[];
} {
  const inputs = collectInputs(overrides);

  return {
    expansionScenarios: generateExpansionScenarios(inputs),
    gapFillScenarios: generateGapFillScenarios(inputs),
    stabilizationScenarios: generateStabilizationScenarios(inputs),
  };
}

/**
 * Build a full scenario report with summary.
 */
export function buildScenarioReport(
  overrides?: Partial<ScenarioInputs>,
): ScenarioReport {
  const all = buildFactoryScenarios(overrides);

  const allScenarios = [
    ...all.expansionScenarios,
    ...all.gapFillScenarios,
    ...all.stabilizationScenarios,
  ];

  const totalNewTemplates = allScenarios.reduce((s, sc) => s + sc.gap, 0);
  const avgPriority = allScenarios.length > 0
    ? allScenarios.reduce((s, sc) => s + sc.priorityScore, 0) / allScenarios.length
    : 0;

  return {
    ...all,
    summary: {
      totalScenarios: allScenarios.length,
      expansionCount: all.expansionScenarios.length,
      gapFillCount: all.gapFillScenarios.length,
      stabilizationCount: all.stabilizationScenarios.length,
      totalNewTemplates,
      averagePriority: round(avgPriority),
    },
    generatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

export function formatScenario(scenario: FactoryScenario): string {
  const lines: string[] = [];
  const badge = scenario.type === "expand_domain" ? "EXPAND"
    : scenario.type === "fill_gap" ? "GAP FILL"
    : "STABILIZE";

  lines.push(`  [${badge}] ${scenario.scenarioId}`);
  lines.push(
    `    Domain: ${scenario.domain}  |  ` +
    `Current: ${scenario.currentTemplateCount}  →  Target: ${scenario.targetTemplateCount}  ` +
    `(gap: ${scenario.gap})`,
  );
  lines.push(
    `    Priority: ${scenario.priorityScore}  |  ` +
    `Impact: coverage +${scenario.estimatedImpact.coverageIncrease}, ` +
    `strength +${scenario.estimatedImpact.portfolioStrength}`,
  );
  lines.push(`    Reasons: ${scenario.reasons.join("; ")}`);

  if (scenario.steps.length > 0) {
    lines.push("    Steps:");
    for (let i = 0; i < scenario.steps.length; i++) {
      const step = scenario.steps[i]!;
      const parent = step.parentTemplateId ? ` (parent: ${step.parentTemplateId})` : "";
      const target = step.targetTemplateId ? ` → ${step.targetTemplateId}` : "";
      const stage = step.targetStage ? ` [${step.targetStage}]` : "";
      lines.push(`      ${i + 1}. [${step.stepType}] ${step.description}${parent}${target}${stage}`);
    }
  }

  return lines.join("\n");
}

export function formatScenarioReport(report: ScenarioReport): string {
  const lines: string[] = [];
  const hr = "─".repeat(70);

  lines.push(hr);
  lines.push("  FACTORY SCENARIO PLANNER REPORT");
  lines.push(hr);
  lines.push(
    `  Scenarios: ${report.summary.totalScenarios}  |  ` +
    `Expand: ${report.summary.expansionCount}  |  ` +
    `Gap Fill: ${report.summary.gapFillCount}  |  ` +
    `Stabilize: ${report.summary.stabilizationCount}  |  ` +
    `New Templates: ${report.summary.totalNewTemplates}  |  ` +
    `Avg Priority: ${report.summary.averagePriority}`,
  );

  if (report.expansionScenarios.length > 0) {
    lines.push("");
    lines.push("  EXPANSION SCENARIOS:");
    for (const sc of report.expansionScenarios) {
      lines.push(formatScenario(sc));
    }
  }

  if (report.gapFillScenarios.length > 0) {
    lines.push("");
    lines.push("  GAP FILL SCENARIOS:");
    for (const sc of report.gapFillScenarios) {
      lines.push(formatScenario(sc));
    }
  }

  if (report.stabilizationScenarios.length > 0) {
    lines.push("");
    lines.push("  STABILIZATION SCENARIOS:");
    for (const sc of report.stabilizationScenarios) {
      lines.push(formatScenario(sc));
    }
  }

  lines.push(hr);
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Internal Step Builders
// ---------------------------------------------------------------------------

function buildExpansionSteps(
  domain: DomainStrategyRecord,
  bestParent: RecommendationRecord | null,
  proposals: TemplateProposal[],
  templatesNeeded: number,
): ScenarioStep[] {
  const steps: ScenarioStep[] = [];
  const parentId = bestParent?.templateId ?? null;

  // Generate derive/create steps
  for (let i = 0; i < templatesNeeded; i++) {
    const proposal = proposals[i];

    if (parentId && proposal) {
      steps.push({
        stepType: "derive_template",
        description: `Derive ${proposal.templateId} from ${parentId}`,
        parentTemplateId: parentId,
        targetTemplateId: proposal.templateId,
        targetStage: null,
      });
    } else if (parentId) {
      const targetId = `${domain.domain}_variant_${i + 1}_saas`;
      steps.push({
        stepType: "derive_template",
        description: `Derive ${targetId} from ${parentId}`,
        parentTemplateId: parentId,
        targetTemplateId: targetId,
        targetStage: null,
      });
    } else if (proposal) {
      steps.push({
        stepType: "create_template",
        description: `Create ${proposal.templateId} for ${domain.domain}`,
        parentTemplateId: null,
        targetTemplateId: proposal.templateId,
        targetStage: null,
      });
    } else {
      const targetId = `${domain.domain}_new_${i + 1}_saas`;
      steps.push({
        stepType: "create_template",
        description: `Create new template for ${domain.domain}`,
        parentTemplateId: null,
        targetTemplateId: targetId,
        targetStage: null,
      });
    }
  }

  // Validation and release steps
  steps.push({
    stepType: "validate",
    description: "Run regression and governance review",
    parentTemplateId: null,
    targetTemplateId: null,
    targetStage: null,
  });

  steps.push({
    stepType: "release",
    description: "Release to dev environment",
    parentTemplateId: null,
    targetTemplateId: null,
    targetStage: "dev",
  });

  steps.push({
    stepType: "publish",
    description: "Publish to marketplace",
    parentTemplateId: null,
    targetTemplateId: null,
    targetStage: null,
  });

  return steps;
}

function buildGapFillSteps(
  gap: PortfolioGap,
  adjacentParent: RecommendationRecord | null,
  proposals: TemplateProposal[],
): ScenarioStep[] {
  const steps: ScenarioStep[] = [];
  const proposal = proposals[0];

  if (adjacentParent && proposal) {
    steps.push({
      stepType: "derive_template",
      description: `Derive ${proposal.templateId} from adjacent parent ${adjacentParent.templateId}`,
      parentTemplateId: adjacentParent.templateId,
      targetTemplateId: proposal.templateId,
      targetStage: null,
    });
  } else if (proposal) {
    steps.push({
      stepType: "create_template",
      description: `Create ${proposal.templateId} for ${gap.domain}`,
      parentTemplateId: null,
      targetTemplateId: proposal.templateId,
      targetStage: null,
    });
  } else {
    const targetId = `${gap.domain}_saas`;
    steps.push({
      stepType: "create_template",
      description: `Create initial template for ${gap.domain}`,
      parentTemplateId: adjacentParent?.templateId ?? null,
      targetTemplateId: targetId,
      targetStage: null,
    });
  }

  steps.push({
    stepType: "validate",
    description: "Run regression and governance review",
    parentTemplateId: null,
    targetTemplateId: null,
    targetStage: null,
  });

  steps.push({
    stepType: "release",
    description: "Release to dev environment",
    parentTemplateId: null,
    targetTemplateId: null,
    targetStage: "dev",
  });

  return steps;
}

function buildStabilizationSteps(
  domain: DomainStrategyRecord,
): ScenarioStep[] {
  const steps: ScenarioStep[] = [];

  steps.push({
    stepType: "run_regression",
    description: `Run full regression suite for ${domain.domain} templates`,
    parentTemplateId: null,
    targetTemplateId: null,
    targetStage: null,
  });

  steps.push({
    stepType: "governance_review",
    description: `Review governance health for ${domain.domain}`,
    parentTemplateId: null,
    targetTemplateId: null,
    targetStage: null,
  });

  if (domain.averageHealthScore < 0.6) {
    steps.push({
      stepType: "validate",
      description: "Re-validate quality gates and baselines",
      parentTemplateId: null,
      targetTemplateId: null,
      targetStage: null,
    });
  }

  return steps;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
