# @saas/payments

Hardened Stripe integration primitives shared by saas-builder and generated
templates. This package exists so every call site reuses the same
already-hardened building blocks instead of re-implementing Stripe wiring
(and re-introducing bugs already recorded in `30_Knowledge/errors/`).

## Why this package and not a new `@saas/billing` package (2026-08-30)

Instruction 2026-07-15_095 asked for a `@saas/billing` module consolidating
webhook/checkout/subscription handling. This package (`@saas/payments`,
delivered by an earlier instruction, 018) already **is** that module: it is
the single import surface for the Stripe webhook handler (signature
verification), Checkout Session creation (mandatory idempotency key), and
now also the subscription conflict guard and the Product/Price creation
compensation helper (both added by instruction 095 — see below). Creating a
second `@saas/billing` package alongside it would just split one already-
working consolidation effort into two half-populated ones and reintroduce
the "which package do I import from" ambiguity this whole effort exists to
remove. So instruction 095's work extended this package instead of creating
a new one.

(Note for whoever reconciles this later: as of 2026-08-30 a separate,
concurrently-running session appears to have also started a `packages/
idempotency` package — a generic Idempotency-Key HTTP middleware +
distributed-lock package — in this same repo, referencing overlapping error
KB entries. It does not duplicate anything in this package (different
abstraction level: this package is Stripe-specific business primitives,
that one is a generic retry/concurrency guard), but the two efforts should
be reconciled by a human before both land on `main`.)

## Exports

- `getStripeClient()` — lazily-constructed, memoized Stripe client. Reads
  `STRIPE_SECRET_KEY` from the environment; throws if missing.
- `buildIdempotencyKey(parts)` — derives a stable, time-independent
  idempotency key from scoping parts.
- `createCheckoutSession(stripe, params, idempotencyKey)` — creates a
  Checkout Session.
- `verifyWebhookSignature(stripe, payload, signature, webhookSecret)` —
  verifies a webhook request signature and returns the trusted event.
- `MissingWebhookMetadataError` — thrown by webhook handlers when required
  Stripe metadata (`tenant_id` / `app_user_id`) is absent; map it to HTTP 400
  (no retry), everything else in webhook processing to HTTP 500 (retry).
- `assertNoConflictingActiveSubscription(supabase, { tenantId, userId })` —
  throws `SubscriptionConflictError` if the user already has an
  active/trialing/past_due subscription for the tenant. Call this before
  creating a Checkout Session; map the error to HTTP 409. See
  [[stripe_recurring_subscription_missing_conflict_guard]].
- `createBillingProductAndPrice(stripe, supabase, params)` — creates a
  Stripe Product+Price pair and persists `billing_products`/`billing_prices`
  rows, compensating (deactivating the Stripe objects, rolling back any
  partial DB row) on any failure so a DB error never leaves an orphaned
  Stripe object. Throws `BillingCatalogWriteError` on failure. See
  [[stripe_plan_product_price_no_rollback_on_db_fail]].

## Mandatory usage rules (required on every call site)

These rules exist because violating them has caused real production
incidents (see `30_Knowledge/errors/`). Code review should reject any call
site that doesn't follow them.

### 1. Checkout sessions REQUIRE an idempotency key

`createCheckoutSession` has no overload that omits `idempotencyKey` — it is
a required, non-empty third argument, and the function throws if you pass
an empty string. Do not bypass this by calling
`stripe.checkout.sessions.create()` directly.

Without an idempotency key, a client-side retry or a network timeout can
create a second Checkout Session (and, once paid, a second
subscription/charge) for a single user action.
See `[[stripe_checkout_idempotency_key_missing]]`.

Derive the key with `buildIdempotencyKey` from STABLE scoping parts only —
e.g. `["checkout", userId, planId, attemptId]` — and never from a
timestamp. `attemptId` should be a client-generated id minted once per
purchase attempt and reused across retries of that attempt, so retries
converge on the same key while a fresh attempt gets a new one.

### 2. Webhook signatures MUST be verified — no escape hatch

`verifyWebhookSignature` is the only supported way to turn a raw webhook
payload into a trusted `Stripe.Event`. It requires both a non-empty
signature and a non-empty webhook secret, and throws otherwise. There is
deliberately no "trust this payload"/"skip verification" mode. Treat any
throw from this function as "return HTTP 400, do not process the event, do
not tell Stripe to retry" — an invalid signature is never a transient
failure. See `[[stripe_webhook_signature_missing]]`.

### 3. Don't leak internal error detail to webhook responses

When mapping webhook processing errors to HTTP responses, distinguish
permanent/configuration errors (e.g. `MissingWebhookMetadataError` → 400,
no retry) from transient failures (DB outage, etc. → 500, so Stripe
retries) — but keep the response body generic for anything that isn't a
deliberately-thrown, safe-to-surface error. Log full error detail
server-side instead of echoing it back in the response.
See `[[stripe_webhook_transient_error_no_retry]]`.

### 4. Check for a conflicting active subscription before checkout

Call `assertNoConflictingActiveSubscription` before creating a Checkout
Session for a recurring plan. Without it, a user who already has an
active/trialing/past_due subscription can start a second one — the
`stripe_subscription_id` UNIQUE constraint only prevents the SAME Stripe
subscription id from producing two rows, it does nothing to stop two
different Stripe subscriptions being created for one user. Map
`SubscriptionConflictError` to HTTP 409.
See `[[stripe_recurring_subscription_missing_conflict_guard]]`.

### 5. Never call `stripe.products.create`/`stripe.prices.create` directly

Use `createBillingProductAndPrice` for any code that creates a billing
Product+Price pair. A bare `stripe.products.create()` followed by a DB
insert leaves the Stripe object permanently orphaned if the DB insert
fails — this helper compensates (deactivates the Stripe objects, rolls
back any partial DB row) on every failure path instead.
See `[[stripe_plan_product_price_no_rollback_on_db_fail]]`.

## Example

```ts
import {
  getStripeClient,
  buildIdempotencyKey,
  createCheckoutSession,
  verifyWebhookSignature,
} from "@saas/payments";

const stripe = getStripeClient();

const idempotencyKey = buildIdempotencyKey([
  "checkout",
  userId,
  planId,
  attemptId ?? "",
]);

const session = await createCheckoutSession(
  stripe,
  { mode: "subscription", line_items: [...], /* ... */ },
  idempotencyKey
);

// In the webhook route:
const event = verifyWebhookSignature(stripe, rawBody, signatureHeader, webhookSecret);
```
