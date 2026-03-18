/**
 * Template Smoke Registry — defines per-template Playwright smoke scenarios.
 *
 * Each template can declare lightweight smoke scenarios that validate
 * template-specific UI paths still work. These run after the common
 * Playwright suite during quality gate execution.
 *
 * Adding smoke coverage for a new template:
 *   1. Add a TemplateSmokeEntry to TEMPLATE_SMOKE_REGISTRY
 *   2. Create a spec file at tests/playwright/template-smoke/<templateKey>.smoke.spec.ts
 *   3. The runner picks it up automatically
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SmokeScenario {
  /** Unique scenario key, e.g. "reservation-main-flow" */
  key: string;
  /** Human-readable label for reporting */
  label: string;
  /** Whether this scenario is active. Set false to skip temporarily. */
  enabled: boolean;
}

export interface TemplateSmokeEntry {
  templateKey: string;
  /** Spec file path relative to project root */
  specFile: string;
  scenarios: SmokeScenario[];
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const TEMPLATE_SMOKE_REGISTRY: TemplateSmokeEntry[] = [
  {
    templateKey: "reservation_saas",
    specFile: "tests/playwright/template-smoke/reservation-saas.smoke.spec.ts",
    scenarios: [
      {
        key: "reservation-list-renders",
        label: "Reservation list page renders",
        enabled: true,
      },
      {
        key: "reservation-new-form",
        label: "New reservation form accessible",
        enabled: true,
      },
    ],
  },
  {
    templateKey: "community_membership_saas",
    specFile: "tests/playwright/template-smoke/community-membership.smoke.spec.ts",
    scenarios: [
      {
        key: "community-area-renders",
        label: "Community/member area renders",
        enabled: true,
      },
      {
        key: "community-navigation",
        label: "Community-specific navigation works",
        enabled: true,
      },
    ],
  },
  {
    templateKey: "simple_crm_saas",
    specFile: "tests/playwright/template-smoke/simple-crm.smoke.spec.ts",
    scenarios: [
      {
        key: "crm-lead-list",
        label: "Lead/customer list renders",
        enabled: true,
      },
      {
        key: "crm-detail-flow",
        label: "CRM detail/create flow accessible",
        enabled: true,
      },
    ],
  },
  {
    templateKey: "internal_admin_ops_saas",
    specFile: "tests/playwright/template-smoke/internal-admin-ops.smoke.spec.ts",
    scenarios: [
      {
        key: "admin-dashboard-renders",
        label: "Operational dashboard renders",
        enabled: true,
      },
      {
        key: "admin-task-entry",
        label: "Admin task/workflow entry accessible",
        enabled: true,
      },
    ],
  },
  {
    templateKey: "membership_content_affiliate",
    specFile: "tests/playwright/template-smoke/membership-content-affiliate.smoke.spec.ts",
    scenarios: [
      {
        key: "content-listing",
        label: "Content listing page renders",
        enabled: true,
      },
      {
        key: "affiliate-entry",
        label: "Affiliate area accessible",
        enabled: true,
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

const REGISTRY_MAP = new Map(
  TEMPLATE_SMOKE_REGISTRY.map((e) => [e.templateKey, e])
);

/** Get smoke entry for a template. Returns undefined if none registered. */
export function getTemplateSmokeEntry(templateKey: string): TemplateSmokeEntry | undefined {
  return REGISTRY_MAP.get(templateKey);
}

/** Get enabled scenarios for a template. Returns empty array if none. */
export function getEnabledScenarios(templateKey: string): SmokeScenario[] {
  const entry = REGISTRY_MAP.get(templateKey);
  if (!entry) return [];
  return entry.scenarios.filter((s) => s.enabled);
}

/** Check if a template has any enabled smoke scenarios. */
export function hasTemplateSmokeTests(templateKey: string): boolean {
  return getEnabledScenarios(templateKey).length > 0;
}

/** All template keys that have smoke scenarios registered. */
export function getTemplateKeysWithSmoke(): string[] {
  return TEMPLATE_SMOKE_REGISTRY.map((e) => e.templateKey);
}
