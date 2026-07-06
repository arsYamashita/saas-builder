# Error-leak output surfaces — inventory & wiring tests

M2 指示書 2026-07-06_030 (「内部エラー漏洩の全出力経路 配線テスト」). This
document is the human-readable companion to
[`lib/api/error-leak-registry.ts`](../../lib/api/error-leak-registry.ts),
which is the machine-checked source of truth
(`app/api/__tests__/error-leak-surface-completeness.test.ts` enforces that
every route below has a registry entry, and that entry points at a real
test file).

## Relationship to PR #30 and PR #36

- **PR #30** introduced `serverErrorResponse()` (`lib/api/errors.ts`) and
  replaced 16 spots that were forwarding a raw `error.message` /
  Supabase/Stripe error to the client, with a `{ error, errorId }` shape
  that only ever logs the real cause server-side.
- **PR #36** (`m5/derivation-security-gate`) added a **static** grep-based
  CI gate (`scripts/security-gate-core.ts`, rule `no-error-detail-leak`)
  that fails the build if new source code matches `details:\s*X\.message`.
- **This work** is the **dynamic** complement: it actually invokes each
  route handler (or generated-artifact writer) with a fabricated internal
  failure and asserts the real HTTP response / file content never contains
  the fabricated table/column/constraint name, Postgres error code, or a
  stack-trace fragment. A static gate can be defeated by a differently
  shaped leak (e.g. `NextResponse.json({ error: msg })` where `msg` isn't
  literally named `.message` in the diff); a dynamic assertion on the
  actual response body cannot.

## Output-path categories audited

### ① API JSON responses — `app/api/**/route.ts`

All 37 route files were audited (see `git log` / PR description for the
full list). Every one falls into one of these three wiring shapes, and
every one now has a dedicated `<route-dir>/__tests__/error-leak.test.ts`
(enumerated machine-checked in `lib/api/error-leak-registry.ts`):

1. **`serverErrorResponse()`-based** (22 routes: billing/checkout,
   documents/{diff,parse}, generation-runs/[runId]/{approve,promote,reject,
   rerun-step,review-step}, projects/[projectId]/{approve-blueprint,
   blueprint,export-files,generate-api-design,generate-blueprint,
   generate-implementation,generate-schema,generate-template,
   run-quality-gate}, stripe/webhook's event-processing branch). Safe by
   construction — proven once in `lib/api/__tests__/errors.test.ts` — but
   each route gets its own wiring test to confirm the *call site* actually
   routes its error through `serverErrorResponse()` (or an equivalent
   whitelisted-message branch) rather than some other, unmasked path.
2. **Manual "log real cause, return fixed generic message" pattern**
   (pre-dates `serverErrorResponse()`, still safe): auth/*, billing/portal,
   billing/subscriptions, domain/content(/[contentId]),
   domain/membership-plans(/[planId]), projects/[projectId]/route,
   projects/[projectId]/{save-api-design-file,save-schema-migration,
   save-ui-file,split-run-to-files}, projects/{rewrite-brief,route},
   provider-scoreboard, scoreboard. These `console.error(realCause)` then
   `NextResponse.json({ error: "Failed to ..." })` — the raw cause never
   touches the response. Confirmed dynamically per-route.
3. **Deliberate, reviewed exception** — `stripe/webhook`'s
   *signature-verification* branch (not the event-processing branch)
   forwards `error.message` raw in the 400 body. This is intentional: the
   message can only originate from `packages/payments/src/webhook.ts`'s two
   static guard strings or Stripe's own `constructEvent()` SDK — never our
   Postgres/Supabase layer — and the caller is Stripe's servers, not an
   end-user browser. `app/api/stripe/webhook/__tests__/error-leak.test.ts`
   locks in that this message never contains a PG error code, table name,
   or `node_modules` stack fragment, even for a hostile/malformed thrown
   error. **Residual risk (documented, not fixed in this pass):** if a
   future Stripe SDK version ever attaches richer diagnostic detail to a
   `constructEvent` throw, it would still be forwarded raw. Low severity
   (machine-to-machine, no DB detail possible today) — recommend revisiting
   if/when the Stripe SDK is next upgraded.

### ② Generated-artifact files (export/report paths)

- `POST /api/projects/[projectId]/export-files` writes the tenant's own
  AI-generated source files to `exports/projects/<id>/...` on disk. The
  written content is the generated code itself, not an error report — no
  "errors" section exists in these artifacts. The route's own JSON error
  responses are covered under ① (already in the registry).
- `POST /api/projects/[projectId]/run-quality-gate` runs `npm install` /
  lint / `tsc` / Playwright **inside the tenant's own generated project**
  and returns the raw combined stdout/stderr as part of the JSON response.
  This is an intentional product feature — showing the user their own
  generated project's build/lint/test output — not an internal-error leak
  channel, since the errors being surfaced are about the *user's own code*,
  not our Supabase schema or infra. It is explicitly **out of scope** for
  the masking policy in `lib/api/errors.ts`. The route's *own* internal
  failure paths (`getLatestGenerationRun`, `createQualityRun`, etc.
  throwing) still go through `serverErrorResponse()` and are covered under
  ① in the registry.
  - **Residual risk (documented, not fixed in this pass):** if `npm`/`tsc`
    ever emit an absolute host filesystem path (vs. a path relative to the
    tenant project dir), that would reveal server directory structure to
    the client. Recommend a follow-up KB entry
    (`quality_gate_build_log_host_path_leak`?) if this needs closing later;
    not the same class of leak as table/column/constraint disclosure, so
    left out of this pass's forbidden-word list.
- No other route writes a persisted "report" artifact containing error
  detail; quality-run results reached via `projects/[projectId]/route` and
  `scoreboard`/`provider-scoreboard` are pass-throughs of the same
  in-memory result, not a second on-disk artifact.

### ③ SSE / WebSocket

None exist in this codebase today (confirmed by a repo-wide grep for
`ReadableStream`, `EventSource`, `text/event-stream`, `WebSocket`,
`socket.io` under `app/` and `lib/` — zero matches). The completeness test
(`app/api/__tests__/error-leak-surface-completeness.test.ts`, "has no
un-inventoried SSE/WebSocket streaming surface") re-runs that grep on every
CI run as a canary: if a streaming endpoint is added later, this doc and
the registry MUST be updated (with a leak test asserting an aborted/errored
stream never emits a raw-error event payload) before that canary will pass
again.

### ④ Stripe webhook error return

Covered under ① item 3 above (`app/api/stripe/webhook/route.ts`) — both its
signature-verification branch (400, deliberate exception, documented) and
its event-processing branch (500/400, `serverErrorResponse`-equivalent,
generic message only) have dedicated leak assertions in
`app/api/stripe/webhook/__tests__/error-leak.test.ts`.

## Forbidden-word methodology

Each `error-leak.test.ts` fabricates a realistic internal failure (a
Postgres-shaped error via `fakePostgresError()` naming a real-looking
table/column/constraint, or a thrown `Error` embedding a fake stack/provider
detail) and asserts the response through
[`assertNoLeak()`](../../tests/helpers/assert-no-leak.ts), which checks:

- universal patterns (any test, any route): a `node_modules/` stack-frame
  fragment, a generic `at file:line:col` stack frame, and Postgres/PostgREST
  error-code shapes (`\b(?:[0-9]{5}|PGRST\d{3})\b`);
- route-specific forbidden fragments passed in per test: the fabricated
  table/column/constraint name, the distinguishing phrase from the fake
  error message, the fake PG code.

**Pitfall to avoid when adding a new route's test:** don't pick a bare
table/column name that's also an ordinary English word that legitimately
appears in the route's own safe generic message (e.g. a `contents` table
next to a `"Failed to fetch contents"` message) — that's a false positive,
not a leak. Prefer distinctive fragments (an unlikely column name, the full
`relation ... does not exist` phrase, the PG code).

## CI wiring (item 3 — no "偽成功")

These tests run under the existing `npm run test:unit` (`vitest run`) job,
which is already a **required** CI job (`.github/workflows/ci.yml`
`unit-tests`, and the `playwright` job's `needs: [typecheck, unit-tests]`
means a red `unit-tests` blocks the pipeline). No new workflow entry was
needed. Two protections against a silent/empty "pass":

- Vitest's default `passWithNoTests` is `false` (not overridden anywhere in
  `vitest.config.ts`) — if test collection ever returns 0 files, `vitest run`
  exits non-zero instead of reporting success.
- `error-leak-surface-completeness.test.ts` asserts
  `ERROR_LEAK_SURFACES.length >= 37` (the current known route count) and
  that the registry's route list exactly matches the routes actually found
  on disk — an accidentally emptied/truncated registry, or a new route
  added without a matching entry, fails CI rather than silently passing.

## 新設経路の追加手順 (adding a new output path)

1. Write the route/handler.
2. Add `<route-dir>/__tests__/error-leak.test.ts`: mock every dependency
   the route touches, force at least one internal failure (DB error,
   thrown provider/pipeline error, etc.), assert the response via
   `assertNoLeak()` with route-specific forbidden fragments (see pitfall
   above).
3. Add a `{ route, testFiles }` entry to
   [`lib/api/error-leak-registry.ts`](../../lib/api/error-leak-registry.ts).
4. Bump `MIN_KNOWN_SURFACE_COUNT` in
   `app/api/__tests__/error-leak-surface-completeness.test.ts` up to the
   new total (never down, except when removing a route).
5. If the new surface is a generated artifact (not a JSON API response) or
   a streaming channel, add a short section here describing what "leak"
   means for that channel and how the test proves it doesn't happen —
   follow the ② / ③ sections above as templates.
6. Run `npm run test:unit` locally before opening the PR.
