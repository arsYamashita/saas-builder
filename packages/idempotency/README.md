# @saas/idempotency

Shared idempotency guard for saas-builder and generated templates.

## Why this exists

The error KB accumulated six-plus instances of the same root pattern —
"a retry or concurrent execution double-runs a money or externally-visible
side effect" — solved independently, per call site, each time:
[[stripe_recurring_subscription_missing_conflict_guard]],
[[cron_owner_digest_no_idempotency]],
[[affiliate_commission_idempotency_missing]],
[[redis_nx_lock_ttl_too_short]]. This package solves it once, with tests,
instead of re-solving it the next time it shows up.

It does **not** replace the DB-level `UNIQUE` + `ON CONFLICT` fix
documented in `docs/rules/08-db-rules.md` for tables populated by a single
well-known natural key (e.g. `commissions (subscription_id, affiliate_id)`)
— that remains the right fix when a natural key already exists. This
package is for the other half of the pattern: a **client- or
caller-supplied** idempotency key (an HTTP `Idempotency-Key` header, or an
ad-hoc key built at a call site) protecting a side effect that doesn't map
onto one natural DB key, plus the distributed-lock half of the pattern
(concurrent execution of the same *logical* operation, not just duplicate
inserts).

## Setup

1. Apply `supabase/migrations/0017_idempotency_keys.sql` (creates the
   `idempotency_keys` table with RLS enabled, service-role-only — see the
   migration for the policy rationale).
2. Construct a store once per process/request and share it:

   ```ts
   import { createIdempotency, createSupabaseIdempotencyStore } from "@saas/idempotency";
   import { createAdminClient } from "@/lib/db/supabase/admin";

   const idempotency = createIdempotency(
     createSupabaseIdempotencyStore(createAdminClient())
   );
   ```

## 1. HTTP middleware — `withRoute`

Wraps a Next.js App Router Route Handler with `Idempotency-Key` semantics:
records the key, replays the stored response for a retried request with
the same key, and returns `409` if a request with that key is currently
mid-flight.

```ts
// app/api/orders/route.ts
import { withRoute } from "@saas/idempotency";

async function handlePost(req: Request) {
  // ... create the order, charge the card, etc. ...
  return Response.json({ orderId }, { status: 201 });
}

export const POST = withRoute(handlePost, {
  store: idempotency.store,
  // REQUIRED for any tenant-scoped route — see "Tenant isolation" below.
  getScope: async (req) => (await getTenantIdFromSession(req)) ?? "anonymous",
});
```

- Missing `Idempotency-Key` header → `400` (pass `required: false` to make
  the header optional and skip the guard when absent).
- Same key, prior call already completed → the **exact same** status +
  JSON body is replayed, `handlePost` is **not** re-run.
- Same key, prior call still running → `409 { error: "request_in_progress" }`.

## 2. Generic side-effect guard — `withIdempotency` / `withStripeCall`

For non-HTTP call sites (a cron job body, a queue consumer, an internal
function) where there's no request/response to wrap, just a side effect
to run at most once per key:

```ts
await idempotency.withIdempotency(dedupeKey, async () => {
  await sendOwnerDigestEmail(community);
});
```

For Stripe mutation calls specifically, `withStripeCall` hands the *same*
key to both the DB-level guard and the Stripe call, so there's no risk of
deriving two different keys (the actual defect class
[[stripe_checkout_idempotency_key_missing]] and this package's own tests
guard against — see `src/__tests__/core.test.ts`'s `withStripeCall` suite):

```ts
const key = buildIdempotencyKey(["checkout", userId, planId, attemptId]); // from @saas/payments
const session = await idempotency.withStripeCall(key, (idempotencyKey) =>
  stripe.checkout.sessions.create(params, { idempotencyKey })
);
```

A `withIdempotency`/`withStripeCall` call whose `fn` throws **releases**
the claim (not completes it) — a failed attempt must be retryable, not
permanently stuck.

## 3. Distributed lock — `withLock`

Redis `SET NX` + `PX` (TTL) with heartbeat-based TTL extension, addressing
[[redis_nx_lock_ttl_too_short]] directly: rather than betting lock safety
on guessing a TTL that covers the wrapped work's worst-case duration,
`withLock` renews the TTL (`ttlMs / 3` by default) for as long as the
wrapped function is still running.

```ts
import { withLock } from "@saas/idempotency";
import { Redis } from "@upstash/redis";

const redis = new Redis({ url: ..., token: ... }); // structurally compatible, no adapter needed

await withLock(
  `stripe-connect-account:${userId}`,
  async () => { /* ... call Stripe Connect create-account ... */ },
  { redis, ttlMs: 120_000 } // >= p99 of the guarded call, per the KB above
);
```

Omit `redis` to use an in-process fallback for local dev without Redis
configured (single-instance only — same caveat as `lib/step-lock.ts`).

## Tenant isolation

Every stored row is keyed by `(scope, key)`, and `scope` is a first-class,
separate argument from `key` everywhere in this package's API — it is
never folded into the key string. **Whenever the idempotency key itself is
client- or caller-supplied**, `scope` MUST be derived from the
authenticated tenant (or another value the caller cannot forge), never
left at the default. Two different tenants independently choosing the same
`Idempotency-Key` header value (a client picking `"retry-1"`, say) must
land on two different rows — if they collided, tenant B could receive
tenant A's replayed response (a cross-tenant data leak, not just a
correctness bug). `withRoute`'s `getScope` option and
`withIdempotency`/`withStripeCall`'s `opts.scope` exist specifically for
this; `db/idempotency_keys` has `PRIMARY KEY (scope, key)`, so the
partitioning is also enforced at the DB level, not just convention.

## Retention

Completed rows are kept in `idempotency_keys` indefinitely by this
package — there is no cleanup job in this PR. Operationally, schedule a
periodic `DELETE FROM idempotency_keys WHERE expires_at < now()` (a
completed row's `expires_at` reflects its original claim TTL, not a
retention window — extend it at completion time first if you want replay
to survive longer than the processing TTL) once row volume warrants it.
