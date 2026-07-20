# Security Checklist — Derivation Security Gate

Every SaaS derived from this repo (via `scripts/create-app.ts` or a manual
copy) inherits saas-builder's security debt along with its code — see
`[[saas_builder_security_debt_inheritance]]`. This checklist is the single
place that lists the 10 security/safety requirements a derived project (and every
PR against saas-builder itself) must satisfy, and points at the ONE
canonical implementation for each — do not re-implement any of these from
scratch at a new call site; import/reuse the linked module.

Some of these are also mechanically enforced by the CI job
**"Security Regression Gate"** (`.github/workflows/ci.yml`, running
`npm run security:gate` → `scripts/security-gate-check.ts` /
`scripts/security-gate-core.ts`) — those are marked **[CI-enforced]**
below. The rest require manual review at PR time (each item still names
the exact file/pattern reviewers should check for).

This file is a companion to `docs/error-kb-checklist.md` (the full,
auto-generated list of ALL open KB error patterns across every project) —
that one is broad and mechanical; this one is narrow, curated, and
specific to "what does a newly-derived or newly-touched saas-builder
endpoint need to have".

---

## 1. Row Level Security (RLS) enabled + tenant-scoped policy on every table

Every table created by a migration MUST enable RLS and have at least one
tenant-isolation (or per-role) policy — `USING (true)` / `WITH CHECK
(true)` "to unblock for now" is not acceptable; it passes an "RLS enabled"
audit while granting every authenticated user every row.

- **Rule**: `docs/rules/08-db-rules.md`, "Row Level Security (mandatory)"
- **Copy-paste starting point**: `docs/db/rls-migration-template.sql`
- **KB**: `[[supabase_rls_missing]]`, `[[supabase_rls_enable_migration_missing]]`,
  `[[supabase_rls_policy_too_permissive]]`, `[[supabase_rls_multitenant_incomplete]]`
- Enforcement today: manual review only (RLS-on-table-vs-migration
  correlation isn't reliably grep-able — a `CREATE TABLE` and its
  `ENABLE ROW LEVEL SECURITY` can legitimately live in different
  statements/files). Reviewers: confirm every new table in a migration PR
  has both statements before approving.

## 2. `security_invoker` on every `CREATE VIEW` **[CI-enforced]**

A Postgres/Supabase VIEW runs with the CREATOR's privileges unless
`security_invoker = true` is set (Postgres 15+ default is `false`) — the
base table's RLS is silently bypassed for anyone who queries the view
instead of the table directly, even though the view "looks" identical.

- **Canonical fix pattern**: `ALTER VIEW <view> SET (security_invoker =
  true);` right after `CREATE VIEW` (or `CREATE VIEW ... WITH
  (security_invoker = true)` on PG15+).
- **KB**: `[[supabase_view_rls_bypass_security_invoker]]` (found and fixed
  in `energy_scheduler`, 2026-07-06 — reproduction steps and a minimal
  Postgres fixture are documented there).
- **CI gate**: `scripts/security-gate-core.ts`'s
  `findMigrationViewViolations()` scans every NEW `supabase/migrations/*.sql`
  file (diffed against the PR base branch) for `CREATE VIEW` with no
  `security_invoker = true` anywhere in the same file. saas-builder's own
  migrations don't define any views today — this gate is preventive, so a
  future PR can't reintroduce this pattern unnoticed.

## 3. Stripe: signature verification + idempotent mutation, no direct SDK bypass **[CI-enforced]**

`POST /api/stripe/webhook` MUST verify `stripe-signature` before touching
the payload; any endpoint that creates a Stripe object as a side effect of
a client request MUST pass an idempotency key. Both are impossible to skip
if the call goes through `@saas/payments` — which is exactly why calling
the raw Stripe SDK directly anywhere else is the anti-pattern being
guarded against.

- **Canonical implementation**: `@saas/payments` —
  `createCheckoutSession()` / `verifyWebhookSignature()` /
  `buildIdempotencyKey()` (`packages/payments/src/checkout.ts`,
  `webhook.ts`, `idempotency.ts`; full mandatory-usage rules in
  `packages/payments/README.md`).
- **Rule**: `docs/rules/06-api-rules.md`, "Payments (Stripe) — Security
  Baseline (mandatory)"
- **KB**: `[[stripe_webhook_signature_missing]]`,
  `[[stripe_webhook_transient_error_no_retry]]`,
  `[[stripe_checkout_idempotency_key_missing]]`,
  `[[affiliate_commission_idempotency_missing]]`,
  `[[stripe_recurring_subscription_missing_conflict_guard]]`
- **CI gate**: `scripts/security-gate-core.ts`'s
  `findStripeDirectCallViolations()` — this repo's PR #33 documented the
  "`@saas/payments`-only" rule as a code-review convention
  (`packages/payments/README.md`, "Mandatory usage rules"); this gate makes
  it a permanent, automatic check instead of relying on every future
  reviewer catching it. Flags `stripe.checkout.sessions.create(...)` /
  `stripe.webhooks.constructEvent(...)` called directly anywhere under
  `app/`, `lib/`, `packages/` **except** `packages/payments/` itself.

## 4. Rate limiting on unauthenticated auth + metered/paid endpoints **[manual review]**

Any login/signup endpoint, or any endpoint that calls a metered external
API (AI generation, etc.), MUST be rate limited via `rateLimit(key, limit,
windowMs)` — never a hand-rolled in-memory `Map` (resets per serverless
instance / cold start, so it doesn't actually bound anything once
deployed).

- **Canonical implementation**: `lib/rate-limit.ts` (Upstash Redis-backed,
  in-memory fallback for local dev only)
- **Rule**: `docs/rules/06-api-rules.md`, "Rate Limiting (mandatory for
  auth + paid-API endpoints)"
- **KB**: `[[serverless_inmemory_ratelimit]]`, `[[nextjs_api_routes_no_rate_limit]]`
- Enforcement today: manual review (a "new endpoint is metered/paid"
  determination is a product judgment call, not a grep pattern).

## 5. No internal error detail leaked to the client **[CI-enforced]**

Never forward a raw `error.message` from Supabase/Stripe/an internal
exception to the client in a `details`/`error` field — it leaks schema,
table, and constraint names. Log the real cause server-side (tagged with
an `errorId`) and return a generic message instead.

- **Canonical implementation**: `serverErrorResponse()` in
  `lib/api/errors.ts`
- **KB**: `[[api_error_message_internal_leak]]`
- **CI gate**: `scripts/security-gate-core.ts`'s
  `findSilentErrorPatternViolations()` flags `details:\s*<expr>.message` in
  server-side code (Route Handlers, `lib/`, `packages/`; Client Components
  are out of scope — see the function's doc comment).
- **Scope note (see item below marked "025/027/030")**: this CI gate only
  covers the `details:` field of a JSON API response — it is NOT the full
  "every output path" wiring test (report.json `errors` sections,
  SSE/websocket streams, etc.). **TODO: reserved link — update once
  instruction `2026-07-06_030_error_leak_wiring_test_saas_energy` (未実施)
  lands its full output-path inventory + wiring test for saas-builder /
  energy_scheduler.**

## 6. `parseJsonBody` instead of `req.json().catch(() => ({}))` **[CI-enforced]**

Route handlers must not swallow a malformed/empty request body into a
silent `{}` (which then surfaces as a confusing "field is undefined"
downstream instead of a clear 400) or let `req.json()` throw straight into
an unrelated generic 500.

- **Canonical implementation**: `parseJsonBody()` in `lib/api/errors.ts`
- **KB**: `[[request_json_parse_silent_fallback]]`
- **CI gate**: `scripts/security-gate-core.ts`'s
  `findSilentErrorPatternViolations()` flags `.catch(() => ({}))` and
  `.catch(() => {})` in server-side code (same scope as item 5).

## 7. LLM / metered-API tenant cost upper bound **[manual review]**

Any endpoint that calls a metered LLM API (Claude, Gemini, etc.) on behalf
of a tenant/user MUST enforce a monthly (or daily) token budget via an
atomic reserve-before-call pattern — a read-check-insert (`SELECT sum` →
compare → call → `INSERT`) is a TOCTOU race that lets concurrent requests
from the same tenant all pass the same pre-insert check.

- **Canonical implementation**: `TenantUsageGuard` /
  `applyReservation()` / `reservationAdjustment()` in
  `packages/gov-doc-engine/src/analyzer/usage-guard.ts` (reserve → call →
  finalize/release; `InMemoryTenantUsageGuard` is a single-process
  reference implementation for tests only — a real deployment needs a DB
  atomic upsert equivalent, e.g. an `INSERT ... ON CONFLICT DO UPDATE ...
  WHERE` reservation RPC).
- **KB**: `[[claude_api_user_cost_limit_missing]]`
- Enforcement today: manual review — wiring a specific product's LLM-calling
  endpoint to a `TenantUsageGuard` implementation is product-specific and
  not mechanically checkable from saas-builder alone. **TODO: reserved
  link — update once instruction
  `2026-07-06_025_saas_builder_llm_cost_secret_governance` (未実施)
  promotes this into a shared `packages/` LLM-cost-guard module with
  429-on-exceeded wiring.**

## 8. Startup environment validation (fail fast, never silently no-op) **[manual review + tested]**

Do not read a required or payment-critical env var via a bare
`process.env.X!` inside a route handler or client constructor — add it to
the shared Zod schema so a misconfigured deployment fails at startup
instead of on the first request that touches it (or, worse, boots
successfully and silently no-ops).

- **Canonical implementation**: `validateEnv()` / `getEnv()` /
  `normalizeEnv()` in `lib/env.ts`, wired via `instrumentation.ts`
- **Rule**: `docs/rules/06-api-rules.md`, "Environment Variables (mandatory)"
- **KB**: `[[missing_env_validation_startup]]`, `[[stripe_env_optional_in_zod]]`,
  `[[startup_env_validation_prod_outage]]`
- **⚠️ Deploy-time gate, not a CI gate**: `startup_env_validation_prod_outage`
  is the lesson that flipping an env var to "required" is itself a
  production risk if the target deployment doesn't actually have it set.
  Before merging/deploying a change to `lib/env.ts`'s required-ness rules,
  confirm the variable is genuinely present in the target environment
  (e.g. `vercel env ls production`) — this cannot be a CI check because CI
  has no visibility into the production environment's actual variables.

## 9. Secrets never tracked in git **[manual review]**

`.env` / `.env.local` must stay out of version control (`.gitignore`
already covers `.env`, `.env.local`, `.env.*.local`) and no real secret may
ever land in `.env.example`, a fixture, a test, or a committed script —
only in the actual (untracked) environment.

- **Canonical reference**: `.gitignore` (already covers the standard `.env*`
  patterns), `.env.example` (placeholders/comments only, never a real key)
- **KB**: `[[gitignore_env_unprotected]]`, `[[env_secrets_in_git_history]]`
- Enforcement today: manual review + `git log --all -- .env .env.local`
  before any release. **TODO: reserved link — update once instruction
  `2026-07-06_027_secret_guard_reusable_package` (未実施) lands
  `packages/secret-guard/` (gitleaks CI template + reusable secret-masking
  helpers) — that will make this item CI-enforced too.**

## 10. Type safety: hand-written DB types must not drift from the real schema **[CI-enforced, partially]**

A hand-written row type (`export type Foo = { ... }`) that stops matching
the real schema doesn't fail loudly — reading a field the type declares
but the real row doesn't have returns `undefined` **silently** at
runtime, not a compile error, not a thrown exception. First diagnosed as
`[[daycare_dashboard_type_schema_drift]]`; same failure family as
`aria_app_collection_drift` in the Firestore world (UI/webhook collection
name mismatches).

- **Canonical pattern**: generated-types-as-source-of-truth. Full guide:
  `docs/schema-drift-guide.md`.
- **Supabase-based projects**: `supabase gen types typescript` output is
  committed (`<template>/src/types/database.generated.ts`); hand-written
  named types (`database.ts`) are diffed against it via an explicit
  `{ HandTypeName: "table_name" }` mapping
  (`schema-drift.config.json`) — never inferred from pluralization.
- **Firestore-based projects (aria_app family)**:
  `scripts/firestore-drift-gate-core.ts` — a copy-and-wire template asset
  (not applicable to saas-builder itself, which has no Firestore usage);
  see `docs/schema-drift-guide.md`, "Firestore-based derivatives".
- **KB**: `[[daycare_dashboard_type_schema_drift]]`, `aria_app_collection_drift`
- **CI gate**: `scripts/schema-drift-gate-check.ts` (`npm run
  schema:drift:gate`) — offline, deterministic diff of the two committed
  files above, registered per-target in `scripts/schema-drift-targets.json`.
  **Hard-blocking** for `community_membership_saas` (confirmed 0 drift as
  of this PR). A SEPARATE, non-blocking (`continue-on-error: true`) CI job
  (`scripts/schema-drift/regen-and-diff.sh`) checks that the committed
  generated snapshot is itself still fresh against live migrations — kept
  informational because it depends on Postgres + Docker networking inside
  CI, a class of environment flakiness that must never block an unrelated
  PR. See `docs/schema-drift-guide.md`, "Two-stage rollout", for why new
  targets should start in `"mode": "warning"` before promoting to `"hard"`.

---

## Reserved links (未実施 dependencies — do not duplicate)

The following M2 instructions are **not yet executed** as of this PR. Items
5, 7, and 9 above intentionally stop short of duplicating what those
instructions will deliver — once each lands, update the corresponding
"TODO: reserved link" above instead of re-implementing:

- `2026-07-06_025_saas_builder_llm_cost_secret_governance` — promotes a
  shared LLM-cost-guard module + secrets governance to `packages/`.
- `2026-07-06_027_secret_guard_reusable_package` — `packages/secret-guard/`
  (gitleaks CI template, TS/Dart secret-masking helpers).
- `2026-07-06_030_error_leak_wiring_test_saas_energy` — full output-path
  inventory + wiring test for internal-error leakage across saas-builder /
  energy_scheduler (this PR's CI gate only covers the `details:` JSON
  response field, one of several output paths that instruction will
  enumerate).

## For derived apps (`scripts/create-app.ts`)

`create-app` copies this checklist into every scaffolded app
(`docs/security-checklist.md`) alongside `docs/rules/*.md`, so a derived
project keeps the same reviewable list even after it diverges from
saas-builder. The CI-enforced items above are grep-pattern checks a
derived app can re-run for itself by copying
`scripts/security-gate-core.ts` / `scripts/security-gate-check.ts` and
wiring them into its own CI — they are not (yet) auto-copied by
`create-app`, since a from-scratch scaffold has no git history to diff
new migrations against on day one.
