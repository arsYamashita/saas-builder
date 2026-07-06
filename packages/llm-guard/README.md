# @saas/llm-guard

Shared LLM governance primitives for saas-builder and generated templates:

1. **Tenant-scoped daily + monthly token cost guard** — atomic reservation
   (reserve → finalize/release), 429-shaped rejection, and overage alerting.
2. **Common Claude model ID constants** (`MODELS`) + a silent-model-degradation
   guard (`assertValidModel`).

Built by consolidating (指示書 `2026-07-06_025` + `2026-07-06_031`) three
independent implementations that all emerged from the same KB entry —
`30_Knowledge/errors/claude_api_user_cost_limit_missing.md` — because nobody
had a shared place to put this logic:

| Source | What it contributed | Where it lives now |
|---|---|---|
| `packages/gov-doc-engine/src/analyzer/usage-guard.ts` (this repo) | Storage-agnostic pure functions (`applyReservation`, `reservationAdjustment`), the `TenantUsageGuard` interface, `InMemoryTenantUsageGuard` reference impl | Moved into `src/core/reservation.ts`. gov-doc-engine's file is now a thin re-export of this package (see below) — no behavior change, just deduplication. |
| `aria-for-salon-app/functions/src/claude-usage-store.ts` | Firestore adapter: `runTransaction`, `sha256(tenantId)`-prefixed fixed-length doc IDs (Firestore's 1500-byte doc-ID limit workaround) | Ported into `src/adapters/firestore.ts`, extended to two collections (`llm_usage_daily` / `llm_usage_monthly`) checked atomically in one transaction. |
| `ai-business-navigator/supabase/functions/_shared/usage-guard.ts` + migration `20260706000000_add_api_usage_limits.sql` | Supabase adapter: `reserve_api_usage()` / `adjust_api_usage()` RPCs, `INSERT ... ON CONFLICT DO UPDATE ... WHERE` atomic upsert (fixes the TOCTOU race of read-check-insert) | Ported into `src/adapters/supabase.ts` + `sql/supabase-usage-schema.sql`, extended to a `reserve_llm_usage()` RPC that checks daily + monthly limits in one call and returns which axis was exceeded (for `AlertSink`). |

None of the three source implementations had a **daily** limit (only
monthly) or a dedicated **overage AlertSink** (they only did
`console.error`) — both are new in this package, added per instruction
`2026-07-06_025`.

**aria-for-salon-app and ai-business-navigator are separate repositories and
were not modified by this change** — they still run their own copies. This
package is the shared implementation for saas-builder itself (gov-doc-engine)
and for any new generated template. Migrating the two existing repos onto
`@saas/llm-guard` is a follow-up (they'd need to add it as a dependency,
which isn't possible from inside this monorepo) — noted as a TODO, not done
here.

## Usage

```ts
import {
  MODELS,
  assertValidModel,
  checkAndReserveUsage,
  InMemoryTenantUsageGuard,
  ConsoleAlertSink,
  DEFAULT_DAILY_TOKEN_LIMIT,
  DEFAULT_MONTHLY_TOKEN_LIMIT,
} from "@saas/llm-guard";

const guard = new InMemoryTenantUsageGuard(
  DEFAULT_DAILY_TOKEN_LIMIT,
  DEFAULT_MONTHLY_TOKEN_LIMIT,
  () => new Date(),
  new ConsoleAlertSink(),
);

const check = await checkAndReserveUsage(guard, tenantId, estimatedTokens);
if (!check.allowed) {
  return Response.json({ error: check.message }, { status: check.status });
}

const model = MODELS.opus;
assertValidModel(model); // throws UnknownModelError on unknown/empty/old-gen IDs
```

For production, swap `InMemoryTenantUsageGuard` for `firestoreUsageStore(db,
opts)` or `supabaseUsageStore(client, opts)` — both implement the same
`TenantUsageGuard` interface.

## Limits are placeholders

`DEFAULT_DAILY_TOKEN_LIMIT` (70,000) and `DEFAULT_MONTHLY_TOKEN_LIMIT`
(2,000,000) are **placeholders carried over from the pre-existing
implementations** (day_care_web_app's original guess). Actual cost tolerance
is a human/product decision — see `src/core/limits.ts` for the full
rationale. Override via the adapter's `options.dailyTokenLimit` /
`options.monthlyTokenLimit`.

## Model IDs

`MODELS` is the single source of truth for which Claude model string to call.
`assertValidModel()` is an **allowlist** check (not a version-number
blocklist) — it only accepts the exact values in `MODELS`. This is
deliberate: pattern-matching on version suffixes (e.g. rejecting anything
ending in `-4-5`) would incorrectly reject `claude-haiku-4-5-20251001`, which
is still the current Haiku generation. Any ID outside the allowlist —
unknown, empty, or an old generation like `claude-sonnet-4-5` — throws
`UnknownModelError` (generic user-facing message; full detail goes to
`console.error` only, per `api_error_message_internal_leak` KB guidance).

`packages/gov-doc-engine/src/config/models.ts` and `lib/ai/models.ts` both
re-export from this module — see those files for the app-level wiring.
