# Security Checklist (Template Baseline)

saas-builder is a **template**: `aria-for-salon-app`, `energy_scheduler` /
`energy-scheduler-web`, `ai-business-navigator`, and every future project
scaffolded via `scripts/create-app.ts` or a manual copy inherit whatever
this repo's code does — good or bad. A gap here does not stay local; it
propagates into every derived project. See
`[[saas_builder_security_debt_inheritance]]` (M5 vault
`30_Knowledge/errors/saas_builder_security_debt_inheritance.md`) and M5
指示書114 (2026-07-18, integrated 2026-07-20), which added this file plus
the CI gate below.

This file is the **short, derivation-focused** version: four categories
that are non-negotiable for any project derived from this template, plus
the procedure for checking them when you cut a new derived project. For
the full 9-item checklist (error-leak wiring, `security_invoker`,
idempotency, LLM cost governance, startup env validation, secrets
hygiene, …) with canonical implementations and KB links, see
`docs/security-checklist.md` — this file does not duplicate that one, it
narrows to the 4 categories M5 指示書114 called out as the highest-risk
inheritance path.

All four checks below run as **ONE command**, fail-closed:

```bash
npm run security:baseline
```

wired into CI via `.github/workflows/security-gate.yml` (runs on every
push/PR to `main`). There is no `security:baseline:webhook` /
`:rls` / `:storage` split — one command, one pass/fail signal. That gate
re-verifies the WHOLE tree on every run (not just new-file diffs),
specifically so a regression is caught even outside the PR that
introduced it — see `scripts/security-baseline-check.ts` / `scripts/security-baseline-core.ts`'s
header comments for the exact contract (exit 0 = clean, 1 = violation,
2 = the gate itself broke — see `[[auto_scan_output_empty_silent_success]]`).

**Provenance note (2026-07-20)**: this gate merges two independently
staged partial implementations of 指示書114 rather than picking one. Item
1's cross-file call-chain tracing and items 2 and 4 in full are ported
from a sibling worktree's `scripts/security-gate/check-*.ts` (three
rounds of Codex review already fixed several real false negatives there —
see `scripts/security-baseline-core.ts`'s inline comments for the specific
bugs each round caught). Item 3 keeps its original implementation as-is:
the sibling worktree's equivalent check was deliberately **not** ported
because it always exits 0 (advisory-only) and matches the broad
`@/lib/providers/*` path prefix, which both false-positives on
`app/api/scoreboard/route.ts` / `app/api/provider-scoreboard/route.ts`
(pure DB-aggregation, no LLM call) and — more importantly — **misses** the
worst real finding in this repo:
`app/api/documents/diff/route.ts` calls
`fetch("https://api.anthropic.com/v1/messages")` directly and imports no
`@/lib/providers/*` module at all, so the broad-prefix check never even
looks at it. This repo's item-3 implementation catches that route via a
narrower, wrapper-aware content signal (`AI_WRAPPER_IMPORT_RE` /
`AI_SDK_CONTENT_RE`) and fails the build until it's fixed.

---

## 1. Stripe webhook signature verification **[CI-enforced]**

Every file that looks like a Stripe webhook handler (references the
`stripe-signature` header or the `stripe.webhooks` namespace anywhere in
`app/`, `lib/`, or `packages/`) MUST have its request-handling entry point
(exported `GET`/`POST`/etc. for a `route.ts`, or an exported function for
a library file) actually **invoke** a call chain that reaches
`stripe.webhooks.constructEvent()` — via the raw SDK call, or through this
repo's wrapper `verifyWebhookSignature()`
(`packages/payments/src/webhook.ts`, re-exported via `@saas/payments` ->
`@/lib/payments`). A derived project using a different helper name (e.g. a
`@clan/stripe-kit`-style `constructStripeEvent()`) is also accepted, as
long as the entry point genuinely calls into something that reaches
`constructEvent` — an unverified webhook lets anyone who knows the URL
POST a forged event and, e.g., grant themselves a paid subscription for
free.

- **CI gate**: `findWebhookSignatureViolations()` in
  `scripts/security-baseline-core.ts` — this is a **call-chain-following**
  check, not a text-presence grep: it traces which specific imported/local
  symbol the entry-point function actually **calls** (up to 4 hops of
  `@/`, `@saas/`, and relative imports/re-exports), and isolates that
  symbol's own declaration body at every hop rather than scanning whole
  files. This closes three real false-negative classes a naive
  `content.includes("constructEvent(")` grep cannot:
  1. importing the verifier but never calling it (import presence ≠
     invocation);
  2. calling an *unrelated* export from a module that also happens to
     export a real verifier;
  3. a dead/unused same-file helper that calls `constructEvent` while the
     actual exported `POST` handler never does.
  If **no** file anywhere references `stripe-signature` / `stripe.webhooks`,
  that itself is reported as a violation against
  `app/api/stripe/webhook/route.ts` — this repo already has Stripe billing
  wired up (subscriptions, checkout, referrals), so total absence is the
  regression this gate exists to catch (e.g. the whole route deleted), not
  a legitimate "nothing to verify" state.
- **Rule / KB**: `docs/security-checklist.md` #3,
  `docs/rules/06-api-rules.md` "Payments (Stripe) — Security Baseline",
  `[[stripe_webhook_signature_missing]]`.
- **Known status (2026-07-18 audit, `docs/security-checklist-audit-2026-07-20.md`)**:
  `aria-for-salon-app` PASSES (Firebase Cloud Functions
  `functions/src/stripe-webhook.ts` verifies via
  `stripe.webhooks.constructEvent`). `energy_scheduler` /
  `ai-business-navigator` have no Stripe integration (N/A, not a gap).

## 2. Supabase RLS on every table + non-permissive policy **[CI-enforced]**

Every table any migration `CREATE TABLE`s MUST have
`ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;` applied somewhere in the
migration history, **AND** at least one `CREATE POLICY` targeting it whose
predicate is not unconditional (`USING (true)` / `WITH CHECK (true)` /
`1=1` / empty — any of these grants every authenticated user every row,
defeating the entire point of RLS). Exceptions are allowed but MUST be
named with a reason, never silently skipped.

- **CI gate**: `findRlsCoverageViolations()` in
  `scripts/security-baseline-core.ts` — parses every
  `supabase/migrations/*.sql` file (not just new ones), collects every
  `CREATE TABLE` name (schema-qualified identity — `public.widgets` and
  `private.widgets` are different tables; unqualified defaults to
  `public`), every table that gets `ENABLE ROW LEVEL SECURITY` (both the
  direct literal form and this repo's dynamic `do $$ ... array['a','b',...]
  ... execute format('alter table %I enable row level security', t) ...
  end $$;` loop form — see
  `supabase/migrations/0012_enable_rls_tenant_isolation.sql`), and every
  table covered by a **non-permissive** `CREATE POLICY` (same
  literal-or-%I-loop duality). A table missing RLS, missing a policy, or
  covered only by a permissive predicate fails the build.
- **Exemptions**: an inline `-- rls-exempt: <reason>` comment on the same
  line as (or the line immediately before) the table's `CREATE TABLE`
  statement — printed in gate output, not swallowed, so it's still
  reviewable in CI. This repo uses it once, on
  `supabase/migrations/0015_commissions_idempotency.sql`'s
  `commissions_duplicates_backup` (deliberately zero-policy,
  service-role-only audit/backup table — RLS enabled, no policies, by
  design). The legacy `RLS_ALLOWLIST` array in
  `scripts/security-baseline-core.ts` (empty today) is kept as a
  secondary mechanism for callers that already depend on it, but the
  inline comment is the recommended path — it can't drift out of sync
  with which migration file actually created the table.
- **Scope note**: this only checks the grep-able half — whether a real
  ("non-permissive") predicate is present. Whether it's *correctly*
  tenant-scoped (vs. some other non-`true` but still-too-broad condition)
  is still a manual-review item — see `docs/security-checklist.md` #1 and
  `docs/rules/08-db-rules.md`.
- **Rule / KB**: `docs/db/rls-migration-template.sql` (copy-paste starting
  point), `[[supabase_rls_missing]]`, `[[supabase_rls_enable_migration_missing]]`,
  `[[supabase_rls_policy_too_permissive]]`.
- **Known status (2026-07-18 audit)**: `energy-scheduler-web` and
  `ai-business-navigator` both PASS (every table confirmed RLS-enabled with
  real policies). `energy_scheduler` (Flutter/Firebase) and
  `aria-for-salon-app` use Firestore, not Supabase — the RLS-equivalent
  there is `firestore.rules`; both checked and PASS (fail-closed default).

## 3. AI endpoint rate limiting + input size upper bound **[CI-enforced (wiring only)]**

Any API endpoint that calls a paid/metered AI provider (Claude, Gemini,
OpenAI, …) MUST be wired to a rate limiter (`lib/rate-limit.ts`'s
`rateLimit()`, or an equivalent — never a hand-rolled in-memory `Map`, see
`[[serverless_inmemory_ratelimit]]`) AND must cap the size of
attacker-controlled input it forwards to the provider (request body size,
prompt length, number of items in a batch field, etc.) — an unbounded
input size turns "rate limited to N requests/min" into "N
arbitrarily-expensive requests/min".

- **CI gate (wiring only)**: `findAiRateLimitViolations()` +
  `findRateLimitModuleViolations()` in `scripts/security-baseline-core.ts`
  — flags any `app/api/**/route.ts` under a path matching `generate-*` /
  `rewrite-brief` / `ai-*` / `llm-*`, OR that directly imports a known LLM
  SDK / this repo's LLM-calling wrapper modules
  (`@/lib/providers/task-router`, `@/lib/document-analysis/document-diff`
  — listed by exact submodule path, not a broad `@/lib/providers/*`
  prefix, so sibling pure-DB-aggregation modules
  `template-scoreboard.ts` / `provider-scoreboard.ts` don't false-positive)
  and has no `rateLimit(` / `checkRateLimit(` / `aiRatelimit(` /
  `<limiter>.limit(` call, AND separately verifies `lib/rate-limit.ts`
  itself defines an AI/generation-scoped bucket (not just a login/signup
  one). **This is CI-ENFORCED (fails the build), not advisory** — see this
  file's "Provenance note" above for why a broader-but-advisory-only
  alternative was evaluated and rejected. **Input-size-cap enforcement is
  NOT mechanically checked** — "reasonable max size" is product-specific
  and not a fixed grep pattern; this remains a manual-review item at PR
  time for any new AI endpoint.
- **Known limitation — Upstash fail-open**: `lib/rate-limit.ts` returns
  `null` (no limiter configured) and falls back to an **in-memory** Map
  when `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` are absent —
  i.e. it **fails open in that specific sense** (unbounded-across-instances
  local fallback, not "no limiting at all" — see
  `[[serverless_inmemory_ratelimit]]`) rather than refusing to serve
  requests. This is a deliberate, pre-existing tradeoff (local dev without
  Redis must still work) and is **out of scope for this integration** — it
  would affect every route using `rateLimit()`, not just the two fixed
  below, and changing it needs its own review. Anyone deploying this
  template to production MUST configure Upstash; the CI gate above cannot
  detect a production deploy missing those env vars.
- **Two real gaps fixed in this integration (2026-07-20)**:
  - `app/api/documents/diff/route.ts` had **zero** rate-limit wiring and
    called `fetch("https://api.anthropic.com/v1/messages")` directly
    (`lib/document-analysis/document-diff.ts`'s `compareDocuments()`) —
    now gated by `rateLimit(\`generate:${user.id}\`, 5, 60_000)` before
    the LLM branch runs (the `localOnly=true` local-diff path, which never
    calls Claude, is intentionally NOT rate-limited — it does no paid
    work). Input size was already bounded (`diffRequestSchema` in
    `lib/validation/document-analysis.ts` enforces `MAX_LLM_INPUT_CHARS`
    on `oldText`/`newText` when `localOnly` isn't set, plus
    `MAX_LLM_LABEL_FIELD_CHARS` on `oldLabel`/`newLabel`/`domain`/`language`
    — added by a prior instruction, 指示書043; this integration did not
    need to add a new cap here, only wire the rate limiter).
  - `app/api/projects/[projectId]/split-run-to-files/route.ts` had **zero**
    rate-limit wiring despite calling `executeTask()` (this repo's
    Claude-backed file-splitter). Now follows the exact same pattern as
    its sibling pipeline steps (`generate-schema`, `generate-blueprint`,
    `generate-api-design`, `generate-implementation`): skips the check for
    verified internal `generate-template` pipeline calls
    (`isInternalPipelineRequest()`, since the pipeline is rate-limited once
    at its own entry point and must run atomically), otherwise
    `rateLimit(\`generate:${user.id}\`, 5, 60_000)`. This route takes no
    request body (`_req: NextRequest`, unused) — its "input" is the prior
    `generate-implementation` run's `output_text`, already bounded by that
    step's own LLM call `max_tokens` (32768, `lib/providers/claude.ts`).
    As defense in depth (not because a distinct attacker-controlled
    surface exists here), the prompt-building step now also truncates
    `output_text` to `MAX_LLM_INPUT_CHARS` before interpolating it into the
    file-split prompt.
- **Rule / KB**: `docs/rules/06-api-rules.md` "Rate Limiting",
  `[[nextjs_api_routes_no_rate_limit]]`, `[[claude_api_user_cost_limit_missing]]`,
  `[[llm_api_unbounded_text_input]]`.
- **Known status (2026-07-18 audit)**: `aria-for-salon-app`'s `salonAgent`
  endpoint enforces an atomic monthly token quota (not a per-minute
  limiter, but does bound cumulative cost) — acceptable, no action.
  `ai-business-navigator`'s `subsidy-match` Edge Function PASSES (atomic
  `reserve_api_usage` RPC before calling Claude). Both, per the fuller
  2026-07-19 audit (`docs/security-checklist-audit-2026-07-20.md`), still
  lack a short-window BURST rate limiter alongside their monthly budget —
  a real but low-severity gap in the derived projects' own code, not
  inherited template code, so not filed as a saas-builder issue.

## 4. Storage bucket policy explicitly set **[CI-enforced]**

Any Supabase Storage bucket MUST have `public = false` (or `true`, but
explicitly EITHER) set at declaration time and a `storage.objects` policy
scoping access by tenant (typically via a `{tenant_id}/...` object-path
prefix) — table-level RLS does **not** cover `storage.objects`; a bucket
left at Supabase's default is world-readable regardless of how
locked-down the Postgres tables are.

- **CI gate**: `findStorageBucketPolicyViolations()` in
  `scripts/security-baseline-core.ts` — scans the full
  `supabase/migrations/*.sql` history for `insert into storage.buckets
  (...)` / `update storage.buckets set ... where id = '<id>'`. For every
  bucket found, requires BOTH the bucket statement's `public` value to be
  a **concrete `true`/`false` literal** (not merely the column being
  listed — a `NULL`, a missing value, or any non-boolean expression fails)
  AND a `CREATE POLICY ... ON storage.objects ... bucket_id = '<id>'`
  somewhere in migration history.
- **Copy-paste starting point**: `docs/db/rls-migration-template.sql`,
  "storage.objects has its own RLS" section.
- **Rule / KB**: `docs/rules/08-db-rules.md` "Row Level Security", last
  paragraph; `[[supabase_storage_bucket_policy_missing]]`.
- **Enforcement today**: saas-builder itself does not currently use
  Supabase Storage (no bucket migrations exist as of 2026-07-20), so this
  gate currently passes via the "nothing declared" branch — stated
  explicitly in gate output (`no storage.buckets declaration found —
  passes vacuously`), never silently skipped (see
  `[[auto_scan_output_empty_silent_success]]`). It exists so the FIRST
  migration that creates a bucket in this repo or a derived project
  doesn't ship without a policy, without anyone having to remember to add
  the check retroactively.

---

## Derivation checklist (run this when cutting a new derived project)

Before (or immediately after) running `scripts/create-app.ts` / manually
copying this repo to start a new project:

1. **Run the gate locally first**: `npm run security:baseline && npm run
   security:gate` in saas-builder itself — both must PASS before you
   derive from it. Deriving from a red template just inherits the red
   state.
2. **Copy `docs/security-checklist.md`, `SECURITY_CHECKLIST.md`,
   `docs/rules/*.md`, and `docs/db/rls-migration-template.sql`** into the
   new project (create-app already copies `docs/security-checklist.md` +
   `docs/rules/*.md`; make sure this file and the RLS template come along
   too if they don't yet).
3. **Copy `scripts/security-baseline-core.ts` / `security-baseline-check.ts`
   (and `security-gate-core.ts` / `security-gate-check.ts`) and wire
   `.github/workflows/security-gate.yml` (and `ci.yml`'s equivalent job)
   into the new project's own CI** — these are not auto-copied by
   `create-app` (a from-scratch scaffold has no migration history to diff
   against on day one for the regression gate, and the baseline gate's
   AI-endpoint path patterns may need adjusting for the new project's
   actual route names).
4. **Re-run `npm run security:baseline` inside the new project** as soon
   as it has its own `supabase/migrations/` and `app/api/` — confirm PASS
   before the first deploy, not after.
5. **If the derived project uses a different stack** (Firebase/Firestore
   instead of Supabase, Vite/Edge Functions instead of Next.js API
   routes, etc.), translate each of the 4 categories to the equivalent
   concept rather than skipping them:
   - RLS + policy → Firestore/Storage security rules (fail-closed default,
     no `allow read, write: if true`).
   - `app/api/.../route.ts` rate-limit wiring → whatever wraps the
     AI-calling Cloud Function / Edge Function (atomic usage-guard RPC,
     Firestore-transaction quota, etc.) — AND, per the audit below,
     consider adding a short-window burst limiter alongside a monthly
     budget, not instead of one.
   - Storage bucket policy → Firebase Storage rules / equivalent.
6. **Configure Upstash Redis before production deploy** — see item 3's
   "Known limitation" note above; the CI gate cannot detect a missing
   `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` in a deployed
   environment.
7. **Do a manual pass over items 3 and 4 above (input size caps, storage
   bucket policy content)** even where CI is green — CI here only checks
   wiring existence, not correctness of the cap/policy content.

## Derived-project audit

Full per-repo, per-file evidence lives in
`docs/security-checklist-audit-2026-07-20.md` (originally run 2026-07-19,
carried forward — see that file's own header for what was and wasn't
re-verified during the 2026-07-20 integration; audits of *other*
projects' trees were **not** re-run as part of this integration, which was
scoped to this worktree only). Summary: no CI-blocking gap found in any
of the three checked derivatives; the one recurring gap (a short-window
burst rate limiter missing alongside an existing monthly cost budget, in
`aria-for-salon-app` and `ai-business-navigator`) is real but low severity
and lives in the derived projects' own code, not inherited template code.
