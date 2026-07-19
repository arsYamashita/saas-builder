# Security Checklist Audit — 3 Derivatives (originally 2026-07-19, carried forward 2026-07-20)

> **2026-07-20 integration note**: this file was ported unchanged (content
> below is exactly the 2026-07-19 original, filename/date updated only)
> when M5 指示書114's two independently-staged partial implementations were
> merged in the `m5-114-security-gate-final` worktree. That integration was
> explicitly scoped to `saas-builder` itself — it did **not** re-visit
> `~/Projects/aria-for-salon-app`, `~/Projects/energy-scheduler`, or
> `~/Projects/ai-business-navigator` to re-verify the claims below are
> still accurate one day later. Treat the per-repo findings as of
> 2026-07-19 only; re-run this audit against current trees before relying
> on it for anything time-sensitive (e.g. before a derivative's launch).
> The two REAL gaps this integration DID fix live in saas-builder itself
> (`app/api/documents/diff/route.ts`,
> `app/api/projects/[projectId]/split-run-to-files/route.ts` — see
> `SECURITY_CHECKLIST.md` item 3) and are unrelated to this file's
> derivative-repo findings.

Read-only audit for M5 指示書114. Checked `~/Projects/aria-for-salon-app`,
`~/Projects/energy-scheduler` (repo directory is hyphenated;
`~/Projects/energy_scheduler` does not exist), and
`~/Projects/ai-business-navigator` against the four SECURITY_CHECKLIST.md
categories. **No file in any of these three repos was modified** — this is
a report only, per instruction.

**Note on instructions 110/111/112**: searched `~/Documents/my-vault/50_M5_Instructions/`
and the whole vault (`find ~/Documents/my-vault -iname "*110*" -o -iname
"*111*" -o -iname "*112*"`) for any trace of these instruction numbers —
found nothing (no file, no reference in
`30_Knowledge/errors/saas_builder_security_debt_inheritance.md` or
elsewhere). Cannot cross-reference gap overlap with them as requested;
either they haven't been issued yet, were archived somewhere this search
didn't reach, or use a different ID scheme. Flagging as **could not
verify** rather than guessing.

Two of the three derivatives (`aria-for-salon-app`, `energy-scheduler`) are
Firebase-based, not Supabase-based — "RLS" and "storage bucket policy" are
evaluated against their Firebase equivalents (`firestore.rules` /
`storage.rules`) where applicable, and marked N/A where the underlying
feature (e.g. Stripe billing, an AI endpoint) doesn't exist in that repo at
all. An "N/A" here is not a gap — a category can't be violated by code that
isn't there.

---

## 1. aria-for-salon-app

Stack: Firebase Functions (Node/TS) + Next.js (`apps/web`) + one Supabase
migration (`supabase/migrations/20260406000000_booking_core_tables.sql`).

| # | Category | Status | Evidence |
|---|----------|--------|----------|
| 1 | Stripe webhook signature | **OK** | `functions/src/stripe-webhook.ts:161-176` reads `req.headers['stripe-signature']`, requires `STRIPE_WEBHOOK_SECRET`, and calls `getStripe().webhooks.constructEvent(req.rawBody, sig, webhookSecret)` before processing. |
| 2 | RLS / tenant access rules | **OK** | `firestore.rules` (tenant-member/role-scoped helpers `isOwner`/`isStaff`/`isMember`, no blanket `allow ... if true` found). `storage.rules` likewise tenant + role scoped (see #4). The one Supabase migration enables RLS on all 4 tables it creates (`specialists`, `services`, `availability`, `bookings` — `supabase/migrations/20260406000000_booking_core_tables.sql:16,33,53,78`). |
| 3 | AI rate limit + input cap | **PARTIAL GAP** | `functions/src/salon-agent.ts` (the Claude-backed salon agent endpoint) has an input size cap — `SalonAgentRequestSchema` in `functions/src/lib/ai-validator.ts:10` (`message: z.string().min(1).max(2000)`) — but **no `rate-limiter.ts` import and no `rateLimit`/`rate-limit` reference anywhere in `salon-agent.ts`** (confirmed via `grep -n "^import" functions/src/salon-agent.ts`; `functions/src/rate-limiter.ts` exists and is used elsewhere — `tenant-auth.ts`, `recover-account.ts`, `invite.ts` — but not here). Partially mitigated by `functions/src/claude-usage-store.ts` + `claude-usage-guard.ts`: an atomic (Firestore-transaction) monthly token budget per tenant, which bounds cost but not request burst rate — a caller within budget can still fire many rapid requests. |
| 4 | Storage bucket policy | **OK** | `storage.rules` sets explicit per-path rules: tenant + own-user scoping, `request.resource.size` caps (2-10MB depending on path), and `contentType` validation on avatar uploads. No wildcard-open path found. |

**Recommendation**: add a `rateLimit(...)` call (reusing
`functions/src/rate-limiter.ts`, the same module already used for
auth/invite endpoints) to `salon-agent.ts` alongside the existing monthly
token budget — the two mechanisms guard different failure modes (burst vs.
cumulative cost) and this repo already has both patterns implemented
elsewhere, just not composed on this one endpoint.

## 2. energy-scheduler

Stack: pure Flutter web/mobile client + Firestore. **No Cloud Functions
backend directory exists** (`find . -iname functions -type d` returns
nothing outside `node_modules`), no Stripe/payment code, no AI/LLM client
code, and no Firebase Storage usage found anywhere in `lib/`.

| # | Category | Status | Evidence |
|---|----------|--------|----------|
| 1 | Stripe webhook signature | **N/A** | `grep -rlE "stripe|Stripe" --include="*.dart" lib` → no matches. Not monetized yet (matches its P3/no-revenue status in the M5 project priority list). |
| 2 | RLS / access rules | **OK** (Firestore rules only) | `firestore.rules` (108 lines): every collection (`users`, `schedules`, `energyData`, `app_config`) is scoped by `request.auth.uid == resource.data.userId` or an explicit `isAdmin()` role check. No `allow ... if true` pattern found. |
| 3 | AI rate limit + input cap | **N/A** | No AI/LLM client import found in `lib/` (`grep -rlE "anthropic|openai|gemini|GenerativeModel|Claude"` → no matches). |
| 4 | Storage bucket policy | **N/A** | `firebase.json` only configures `firestore` + `hosting`, no `storage` key; no `storage.rules` file; no `firebase_storage` import in `lib/`. |

**Discrepancy worth flagging**: `scripts/security-gate-core.ts` in
saas-builder (this repo) documents `[[supabase_view_rls_bypass_security_invoker]]`
as "found and fixed in `energy_scheduler`, 2026-07-06" — but the current
`~/Projects/energy-scheduler` tree has no `supabase/` directory at all and
no Postgres/Supabase usage whatsoever (confirmed via
`find . -iname supabase -not -path "*/node_modules/*"`). Either that fix
was in a since-removed backend, a different project sharing the name, or
the KB entry's project attribution is stale. Not re-investigated further
here (out of scope for this audit — flagging for whoever owns KB upkeep).

## 3. ai-business-navigator

Stack: Vite/React SPA (`src/`) + Supabase (Postgres + Edge Functions,
`supabase/functions/{rag-query,read-url,subsidy-match,_shared}`).

| # | Category | Status | Evidence |
|---|----------|--------|----------|
| 1 | Stripe webhook signature | **N/A** | `grep -rliE "stripe|checkout\.session|billing" src supabase` → zero matches anywhere in the repo. No payment integration exists yet. |
| 2 | RLS on every table | **OK** | All 6 tables across 13 migrations have RLS enabled: `intelligence` (`20260206140508_*.sql:21`), `documents` + `document_chunks` (`20260207100000_add_rag_documents.sql:36-37`, re-affirmed in `20260410000000_rls_complete_gate7.sql:23,51,78`), `subsidy_queries` (`20260405000000_add_subsidy_queries.sql:11`), `api_usage` + `api_usage_monthly` (`20260706000000_add_api_usage_limits.sql:29,71`). The migration filename `..._rls_complete_gate7.sql` indicates a prior dedicated RLS remediation pass already happened on this repo. |
| 3 | AI rate limit + input cap | **MOSTLY OK, one gap noted** | Input cap: `supabase/functions/rag-query/index.ts:4` imports `MAX_LLM_QUERY_CHARS` from `_shared/llm-input-limits.ts` and enforces it. Cost governance: `subsidy-match` requires JWT auth and calls `reserve_api_usage` (`supabase/migrations/20260706000000_add_api_usage_limits.sql:90`, an atomic per-user-per-month reservation, `EXECUTE` revoked from `anon`/`authenticated` — service-role only) before calling Claude — this is the exact fix for a previously-documented critical issue (`src/pages/SubsidyWizard.tsx:85-93` comment cites KB `vite_gemini_api_key_client_bundle_exposure`: the OLD implementation called Gemini directly from the client with a bundled API key; the CURRENT implementation routes through the guarded edge function instead). Same caveat as aria-for-salon-app: a monthly token/usage reservation bounds cumulative cost but is not a short-window burst rate limiter — no Upstash-style `rateLimit()` found on `subsidy-match` or `rag-query` themselves (the only "rate" hits in `read-url/index.ts` are about gracefully handling the Gemini API's OWN 429 responses via retry/backoff, not this app throttling its own callers). |
| 4 | Storage bucket policy | **N/A** | `grep -rn "storage\.buckets\|storage\.objects\|supabase\.storage"` across migrations and `src/` → zero matches. No Supabase Storage bucket is used by this repo. |

**Recommendation**: same pattern as aria-for-salon-app — the monthly
reservation is real and atomic, but a lightweight burst-rate-limit layer
(even a Supabase-Postgres-backed one, matching the durable-store
requirement in SECURITY_CHECKLIST.md item 3) on `subsidy-match` /
`rag-query` would close the burst-abuse gap the monthly cap alone doesn't
cover.

---

## Summary (gap counts)

| Repo | Real gaps found | N/A (feature absent) | OK |
|---|---|---|---|
| aria-for-salon-app | 1 (item 3, partial — input cap present, no burst rate limit) | 0 | 3 |
| energy-scheduler | 0 | 3 (items 1, 3, 4 — no billing/AI/storage in this repo) | 1 |
| ai-business-navigator | 1 (item 3, partial — same burst-rate-limit gap pattern) | 2 (items 1, 4) | 1 |

**Pattern across both repos with AI endpoints**: neither
aria-for-salon-app's `salon-agent.ts` nor ai-business-navigator's
`subsidy-match`/`rag-query` has a short-window burst rate limiter, even
though both correctly implement (a) an input-size cap and (b) an atomic
monthly cost-budget reservation. This is a genuine, repeated, low-severity
gap — not the same class of risk as a missing webhook signature or missing
RLS (which would be immediately exploitable), but real, and it recurs
identically across two independently-built derivatives, which is exactly
the "template-level debt inherited by every derivative" pattern
SECURITY_CHECKLIST.md item 3's advisory-only CI check
(`check-ratelimit-routes.ts`) is designed to keep surfacing rather than
silently missing.
