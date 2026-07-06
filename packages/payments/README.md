# @saas/payments

Hardened Stripe integration primitives shared by saas-builder and generated
templates. This package exists so every call site reuses the same
already-hardened building blocks instead of re-implementing Stripe wiring
(and re-introducing bugs already recorded in `30_Knowledge/errors/`).

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
