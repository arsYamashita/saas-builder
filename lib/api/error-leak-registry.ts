/**
 * Registry of every API route file and its dedicated "internal error leak"
 * wiring test — see docs/testing/error-leak-surfaces.md for the full
 * inventory/rationale and app/api/__tests__/error-leak-surface-completeness.test.ts
 * for the enforcement (a route added without a matching entry here, or an
 * entry pointing at a test file that doesn't exist, fails CI).
 *
 * Adding a new route? Add its entry here in the same PR, plus a
 * `<route-dir>/__tests__/error-leak.test.ts` that forces at least one
 * internal failure (a Postgres-shaped error, a thrown provider/pipeline
 * error, etc.) and asserts the response via
 * `assertNoLeak()` (tests/helpers/assert-no-leak.ts) that no table/column/
 * constraint name, Postgres error code, or stack-trace fragment reaches
 * the client. See docs/testing/error-leak-surfaces.md § "新設経路の追加手順".
 */

export interface ErrorLeakSurface {
  /** route.ts file path, relative to repo root */
  route: string;
  /** test file(s) that assert this route's error paths don't leak internal detail */
  testFiles: string[];
}

export const ERROR_LEAK_SURFACES: ErrorLeakSurface[] = [
  // ── auth ──────────────────────────────────────────────────────────
  { route: "app/api/auth/login/route.ts", testFiles: ["app/api/auth/login/__tests__/error-leak.test.ts"] },
  { route: "app/api/auth/logout/route.ts", testFiles: ["app/api/auth/logout/__tests__/error-leak.test.ts"] },
  { route: "app/api/auth/me/route.ts", testFiles: ["app/api/auth/me/__tests__/error-leak.test.ts"] },
  { route: "app/api/auth/signup/route.ts", testFiles: ["app/api/auth/signup/__tests__/error-leak.test.ts"] },

  // ── billing ───────────────────────────────────────────────────────
  { route: "app/api/billing/checkout/route.ts", testFiles: ["app/api/billing/checkout/__tests__/error-leak.test.ts"] },
  { route: "app/api/billing/portal/route.ts", testFiles: ["app/api/billing/portal/__tests__/error-leak.test.ts"] },
  { route: "app/api/billing/subscriptions/route.ts", testFiles: ["app/api/billing/subscriptions/__tests__/error-leak.test.ts"] },

  // ── documents (AI-powered diff/parse) ────────────────────────────
  { route: "app/api/documents/diff/route.ts", testFiles: ["app/api/documents/diff/__tests__/error-leak.test.ts"] },
  { route: "app/api/documents/parse/route.ts", testFiles: ["app/api/documents/parse/__tests__/error-leak.test.ts"] },

  // ── domain (tenant content / membership plans) ───────────────────
  { route: "app/api/domain/content/route.ts", testFiles: ["app/api/domain/content/__tests__/error-leak.test.ts"] },
  { route: "app/api/domain/content/[contentId]/route.ts", testFiles: ["app/api/domain/content/[contentId]/__tests__/error-leak.test.ts"] },
  { route: "app/api/domain/membership-plans/route.ts", testFiles: ["app/api/domain/membership-plans/__tests__/error-leak.test.ts"] },
  { route: "app/api/domain/membership-plans/[planId]/route.ts", testFiles: ["app/api/domain/membership-plans/[planId]/__tests__/error-leak.test.ts"] },

  // ── generation-runs ───────────────────────────────────────────────
  { route: "app/api/generation-runs/[runId]/approve/route.ts", testFiles: ["app/api/generation-runs/[runId]/approve/__tests__/error-leak.test.ts"] },
  { route: "app/api/generation-runs/[runId]/promote/route.ts", testFiles: ["app/api/generation-runs/[runId]/promote/__tests__/error-leak.test.ts"] },
  { route: "app/api/generation-runs/[runId]/reject/route.ts", testFiles: ["app/api/generation-runs/[runId]/reject/__tests__/error-leak.test.ts"] },
  { route: "app/api/generation-runs/[runId]/rerun-step/route.ts", testFiles: ["app/api/generation-runs/[runId]/rerun-step/__tests__/error-leak.test.ts"] },
  { route: "app/api/generation-runs/[runId]/review-step/route.ts", testFiles: ["app/api/generation-runs/[runId]/review-step/__tests__/error-leak.test.ts"] },

  // ── projects/[projectId] ──────────────────────────────────────────
  { route: "app/api/projects/[projectId]/approve-blueprint/route.ts", testFiles: ["app/api/projects/[projectId]/approve-blueprint/__tests__/error-leak.test.ts"] },
  { route: "app/api/projects/[projectId]/blueprint/route.ts", testFiles: ["app/api/projects/[projectId]/blueprint/__tests__/error-leak.test.ts"] },
  { route: "app/api/projects/[projectId]/export-files/route.ts", testFiles: ["app/api/projects/[projectId]/export-files/__tests__/error-leak.test.ts"] },
  { route: "app/api/projects/[projectId]/generate-api-design/route.ts", testFiles: ["app/api/projects/[projectId]/generate-api-design/__tests__/error-leak.test.ts"] },
  { route: "app/api/projects/[projectId]/generate-blueprint/route.ts", testFiles: ["app/api/projects/[projectId]/generate-blueprint/__tests__/error-leak.test.ts"] },
  { route: "app/api/projects/[projectId]/generate-implementation/route.ts", testFiles: ["app/api/projects/[projectId]/generate-implementation/__tests__/error-leak.test.ts"] },
  { route: "app/api/projects/[projectId]/generate-schema/route.ts", testFiles: ["app/api/projects/[projectId]/generate-schema/__tests__/error-leak.test.ts"] },
  { route: "app/api/projects/[projectId]/generate-template/route.ts", testFiles: ["app/api/projects/[projectId]/generate-template/__tests__/error-leak.test.ts"] },
  { route: "app/api/projects/[projectId]/route.ts", testFiles: ["app/api/projects/[projectId]/__tests__/error-leak.test.ts"] },
  { route: "app/api/projects/[projectId]/run-quality-gate/route.ts", testFiles: ["app/api/projects/[projectId]/run-quality-gate/__tests__/error-leak.test.ts"] },
  { route: "app/api/projects/[projectId]/save-api-design-file/route.ts", testFiles: ["app/api/projects/[projectId]/save-api-design-file/__tests__/error-leak.test.ts"] },
  { route: "app/api/projects/[projectId]/save-schema-migration/route.ts", testFiles: ["app/api/projects/[projectId]/save-schema-migration/__tests__/error-leak.test.ts"] },
  { route: "app/api/projects/[projectId]/save-ui-file/route.ts", testFiles: ["app/api/projects/[projectId]/save-ui-file/__tests__/error-leak.test.ts"] },
  { route: "app/api/projects/[projectId]/split-run-to-files/route.ts", testFiles: ["app/api/projects/[projectId]/split-run-to-files/__tests__/error-leak.test.ts"] },

  // ── projects (top-level) ──────────────────────────────────────────
  { route: "app/api/projects/rewrite-brief/route.ts", testFiles: ["app/api/projects/rewrite-brief/__tests__/error-leak.test.ts"] },
  { route: "app/api/projects/route.ts", testFiles: ["app/api/projects/__tests__/error-leak.test.ts"] },

  // ── scoreboards ────────────────────────────────────────────────────
  { route: "app/api/provider-scoreboard/route.ts", testFiles: ["app/api/provider-scoreboard/__tests__/error-leak.test.ts"] },
  { route: "app/api/scoreboard/route.ts", testFiles: ["app/api/scoreboard/__tests__/error-leak.test.ts"] },

  // ── payments webhook ───────────────────────────────────────────────
  { route: "app/api/stripe/webhook/route.ts", testFiles: ["app/api/stripe/webhook/__tests__/error-leak.test.ts"] },
];
