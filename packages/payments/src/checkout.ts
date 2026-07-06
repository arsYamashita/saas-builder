import type Stripe from "stripe";

/**
 * Create a Stripe Checkout Session with a MANDATORY idempotency key.
 *
 * This is the package's only supported entry point for creating Checkout
 * Sessions. There is deliberately no overload or variant that omits
 * `idempotencyKey` — every retried/duplicated client request must resolve
 * to the same underlying Stripe object rather than creating a second one.
 * See [[stripe_checkout_idempotency_key_missing]].
 *
 * Callers derive `idempotencyKey` with `buildIdempotencyKey` from stable
 * scoping parts (user id, plan id, a client-generated per-attempt id) —
 * never from a timestamp.
 *
 * @param stripe - a Stripe client (see `getStripeClient`)
 * @param params - Stripe Checkout Session creation params
 * @param idempotencyKey - REQUIRED, non-empty idempotency key
 */
export async function createCheckoutSession(
  stripe: Stripe,
  params: Stripe.Checkout.SessionCreateParams,
  idempotencyKey: string
): Promise<Stripe.Checkout.Session> {
  if (!idempotencyKey || !idempotencyKey.trim()) {
    throw new Error(
      "createCheckoutSession requires a non-empty idempotencyKey " +
        "(see buildIdempotencyKey) — checkout sessions must never be " +
        "created without one."
    );
  }

  return stripe.checkout.sessions.create(params, { idempotencyKey });
}
