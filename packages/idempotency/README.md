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
  // Both REQUIRED, no default for either — see "Tenant isolation" below.
  getScope: async (req) => (await getTenantIdFromSession(req)) ?? "anonymous",
  namespace: "orders.create",
});
```

- Missing `Idempotency-Key` header → `400` (pass `required: false` to make
  the header optional and skip the guard when absent).
- Same key, prior call already completed → the **exact same** status +
  body + content-type is replayed, `handlePost` is **not** re-run. (Other
  headers — `Set-Cookie`, `Location`, caching headers, etc. — are NOT
  replayed; a route that needs those preserved on replay can't rely on
  `withRoute` alone for them.)
- Same key, prior call still running → `409 { error: "request_in_progress" }`.
- `handlePost` succeeded but the claim was lost mid-flight (see "At-most-once
  is a lease, not a guarantee" below) → `500 { error: "idempotency_claim_lost" }`
  — the response was already sent back to `handlePost`'s original caller in
  that unlucky race, but a retry must not be assumed to just replay it.

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
permanently stuck. A call whose `fn` *succeeds* but loses the claim
mid-flight throws `IdempotencyClaimLostError` instead of either silently
returning the result or releasing — see "At-most-once is a lease, not a
guarantee" below.

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
  async (signal) => { /* ... call Stripe Connect create-account, ideally passing `signal` through (e.g. fetch(url, { signal })) ... */ },
  { redis, ttlMs: 120_000 } // >= p99 of the guarded call, per the KB above
);
```

Omit `redis` to use an in-process fallback for local dev without Redis
configured (single-instance only — same caveat as `lib/step-lock.ts`). If
the heartbeat detects the lock was lost (reclaimed by someone else) while
`fn` is still running, `fn`'s `AbortSignal` fires and `withLock` throws
`LockLostError` once `fn` settles — see "At-most-once is a lease, not a
guarantee" below.

## Tenant isolation

Every stored row is keyed by `(scope, key)`, and `scope` is a first-class,
separate argument from `key` everywhere in this package's API — it is
never folded into the key string. **Whenever the idempotency key itself is
client- or caller-supplied**, `scope` MUST be derived from the
authenticated tenant (or another value the caller cannot forge). Two
different tenants independently choosing the same `Idempotency-Key`
header value (a client picking `"retry-1"`, say) must land on two
different rows — if they collided, tenant B could receive tenant A's
replayed response (a cross-tenant data leak, not just a correctness bug).

`withRoute` enforces this at the type level, not just by convention
(Codex review gpt-5.6-sol, 2026-08-30 P1: an earlier revision silently
defaulted `scope` to a single fixed value when the caller omitted
`getScope`, which is exactly the "forgot to scope this route" mistake
this section warns against): **`getScope` and `namespace` are both
required, non-optional parameters** — there is no default to fall back
to. `getScope` isolates tenants from each other; `namespace` (a static
string per `withRoute` call site, e.g. `"orders.create"`) additionally
isolates ROUTES from each other within the same tenant — without it, two
different endpoints sharing one `getScope` and receiving the same
client-chosen key would collide with each other, which `scope` alone
does not prevent. The two are combined as the stored `scope` value
(`` `${callerScope}:${namespace}` ``); a genuinely tenant-less route must
say so explicitly (`getScope: () => "system"`) rather than relying on an
implicit default.

`withIdempotency`/`withStripeCall`'s `opts.scope` remains optional and
defaults to a shared `"system"` scope — appropriate for call sites where
the key is NOT client-supplied (e.g. `owner_digest:${communityId}:${date}`,
already unique on its own) and there is no per-tenant collision risk to
begin with; it is `withRoute` specifically, built around a short,
client-supplied header value, where an implicit default is dangerous.

`db/idempotency_keys` has `PRIMARY KEY (scope, key)`, so once `scope` is
computed correctly the partitioning itself is enforced at the DB level,
not just convention.

## At-most-once is a lease, not a guarantee

Be precise about what this package promises: the DB-level fencing token
(`store.ts`) guarantees a stale claim can never *clobber* a newer one, and
the heartbeat (`withIdempotency`, `withLock`) keeps a claim/lock alive for
as long as `fn` is genuinely still running rather than betting everything
on a single upfront TTL guess. Neither of those is the same as a hard
"`fn` runs at most once, no matter what" guarantee (Codex review
gpt-5.6-sol, 2026-08-30 High) — two residual gaps remain, both surfaced
as distinct, documented errors rather than silently mishandled:

1. **Claim/lock lost while `fn` is still running.** If the heartbeat
   itself stalls badly enough (event-loop starvation, a Redis/DB outage
   longer than `ttlMs`), another caller can legitimately reclaim the
   (scope, key)/lock while the original `fn` is still executing —
   `withIdempotency` cannot forcibly cancel a non-cooperative `fn`, so
   both the original and the new caller's side effects may run. This
   package cannot make that impossible; what it does do is *detect* it
   (via the fencing token / compare-and-extend) and throw
   `IdempotencyClaimLostError` / `LockLostError` instead of returning as
   if nothing happened — treat either as "unknown outcome, investigate",
   not as "safe to retry".
2. **`fn` succeeds but `store.complete()` itself fails** (e.g. a DB outage
   at exactly the wrong moment). The side effect already happened; this
   package refuses to either (a) silently report success while secretly
   unable to prevent a future duplicate run, or (b) release the claim
   (which would let a genuine retry re-run `fn` and double the side
   effect that already succeeded). Both cases throw
   `IdempotencyClaimLostError` — its `.result` carries `fn`'s successful
   return value when available, for callers that want to recover it
   despite the bookkeeping failure.

For a side effect where *true* exactly-once matters more than this
package's best-effort lease (e.g. moving money), pair it with a real
DB-level natural-key constraint (`docs/rules/08-db-rules.md`) as the
actual source of truth, and treat this package's guard as a
defense-in-depth layer that avoids most duplicate *attempts* rather than
the sole line of defense against a duplicate *effect*.

## Retention

Completed rows are kept in `idempotency_keys` indefinitely by this
package — there is no cleanup job in this PR. Operationally, schedule a
periodic `DELETE FROM idempotency_keys WHERE expires_at < now()` (a
completed row's `expires_at` reflects its original claim TTL, not a
retention window — extend it at completion time first if you want replay
to survive longer than the processing TTL) once row volume warrants it.
