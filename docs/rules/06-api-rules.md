# API Rules

## General
- use Route Handlers
- return JSON only
- validate input with zod
- enforce tenant boundary
- enforce role boundary
- return appropriate HTTP status codes

## Allowed Domain APIs
### Content
- GET /api/domain/content
- POST /api/domain/content
- GET /api/domain/content/[contentId]
- PATCH /api/domain/content/[contentId]

### Membership Plans
- GET /api/domain/membership-plans
- POST /api/domain/membership-plans
- GET /api/domain/membership-plans/[planId]
- PATCH /api/domain/membership-plans/[planId]

### Billing
- POST /api/billing/checkout
- POST /api/billing/portal
- GET /api/billing/subscriptions

### Stripe
- POST /api/stripe/webhook

## Response Shape
### Success List
{
  "contents": [...]
}
or
{
  "plans": [...]
}

### Success Single
{
  "content": {...}
}
or
{
  "plan": {...}
}

### Error
{
  "error": "Human readable error",
  "details": "More details if available"
}

## Mutation Rule
Every POST/PATCH for domain objects must write audit log.

## Tenant Rule
Every query must include tenant_id where applicable.

## Forbidden API Patterns
- do not use GraphQL
- do not introduce server actions for domain CRUD in this template
- do not use RPC as default
- do not create bulk endpoints unless explicitly requested

## Payments (Stripe) — Security Baseline (mandatory)
Do not re-implement Stripe wiring from scratch. Import the Stripe client,
webhook error types, and idempotency-key helper from `@/lib/payments`.

- `POST /api/stripe/webhook` MUST verify the `stripe-signature` header via
  `stripe.webhooks.constructEvent()` inside its own try/catch that always
  returns 400 on failure (Stripe does not retry a 400, and an invalid
  signature is never a transient condition). See
  [[stripe_webhook_signature_missing]].
- Webhook event *processing* MUST be a SEPARATE try/catch from signature
  verification: transient failures (DB outage, etc.) return 500 so Stripe
  retries for up to 3 days; known-permanent errors (missing metadata /
  config problems, e.g. `MissingWebhookMetadataError`) return 400, since
  retrying a config error will not help. Do not collapse both into one
  catch block that always returns 400 — that silently drops events during
  transient outages. See [[stripe_webhook_transient_error_no_retry]].
- Any DB write triggered by a Stripe webhook or Checkout Session
  (subscriptions, purchases, commissions, points, etc.) MUST be
  idempotent against redelivery: upsert with `onConflict` on the Stripe
  id, or a pre-insert existence check, backed by the DB UNIQUE constraint
  required in DB Rules below. See
  [[affiliate_commission_idempotency_missing]],
  [[stripe_recurring_subscription_missing_conflict_guard]].
- Any endpoint that creates a Stripe object as a side effect of a client
  request (`checkout.sessions.create`, `paymentIntents.create`, etc.)
  MUST pass an `idempotencyKey` (use `buildIdempotencyKey()` from
  `@/lib/payments`) so a client retry or network timeout does not create a
  duplicate Stripe object / duplicate charge. The key MUST be built only
  from STABLE parts — never a timestamp or time bucket (a retry that
  crosses the bucket boundary gets a new key and defeats the protection;
  Stripe keys stay valid for 24h, so no time component is needed). To
  separate genuinely distinct purchase attempts, have the client mint a
  per-attempt id (e.g. `crypto.randomUUID()` once per page mount, reused
  across retries) and include it in the key — see
  `app/api/billing/checkout/route.ts` for the reference implementation.
  See [[stripe_checkout_idempotency_key_missing]].

## Rate Limiting (mandatory for auth + paid-API endpoints)
Any endpoint that is (a) unauthenticated auth (login/signup) or (b) calls
a metered/paid external API (AI generation, etc.) MUST be rate limited via
`rateLimit(key, limit, windowMs)` from `@/lib/rate-limit`, which is backed
by a persistent store (Upstash Redis) in production and falls back to an
in-memory limiter only for local dev. Do NOT hand-roll a local `Map` /
in-memory counter as the production rate limiter — it resets per
serverless instance (each cold start / concurrent instance gets its own
counter) and does not actually bound anything once deployed. See
[[serverless_inmemory_ratelimit]] and [[nextjs_api_routes_no_rate_limit]].

## Environment Variables (mandatory)
Do not read a required or payment-critical env var via a bare
`process.env.X!` non-null assertion inside a route handler or Stripe
client constructor. Add the variable to the shared Zod schema in
`@/lib/env.ts` (`validateEnv()` / `getEnv()`) so a misconfigured
deployment fails fast at server startup instead of on the first request
that touches it (or, worse, boots successfully and silently no-ops). See
[[missing_env_validation_startup]] and [[stripe_env_optional_in_zod]].
