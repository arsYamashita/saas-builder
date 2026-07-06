/**
 * Idempotency key helpers for Stripe mutation calls.
 *
 * stripe.checkout.sessions.create() (and other Stripe mutation endpoints)
 * accept an `idempotencyKey` request option: a repeated call with the same
 * key returns the original response instead of creating a duplicate object.
 * Without it, a client-side retry or network timeout can create two
 * Checkout Sessions (and, once paid, two subscriptions/charges) for a
 * single user action. See [[stripe_checkout_idempotency_key_missing]].
 */

/**
 * Builds a deterministic idempotency key for a Stripe mutation from a set
 * of STABLE scoping parts (e.g. ["checkout", userId, planId, attemptId]).
 *
 * The key is a pure function of its parts — it deliberately contains NO
 * time component. An earlier revision bucketed the key by minute, which
 * meant a request timing out at 12:00:59 and retried at 12:01:01 fell into
 * a different bucket, got a different key, and created a duplicate Checkout
 * Session — exactly the failure the key exists to prevent. Stripe keeps
 * idempotency keys valid for 24 hours, so no time component is needed:
 * retries of the same attempt reuse the same key for the whole window.
 *
 * To distinguish two GENUINELY separate purchase attempts by the same user
 * for the same plan, the caller must include a stable per-attempt
 * identifier in `parts` (e.g. a client-generated UUID minted when the
 * purchase UI is rendered and reused across retries of that attempt) —
 * never a timestamp.
 *
 * @param parts - ordered list of stable scoping values,
 *   e.g. ["checkout", userId, planId, attemptId]
 */
export function buildIdempotencyKey(parts: Array<string | number>): string {
  const cleanParts = parts.map((p) => String(p).trim()).filter(Boolean);

  if (cleanParts.length === 0) {
    throw new Error(
      "buildIdempotencyKey requires at least one non-empty part"
    );
  }

  return cleanParts.join(":");
}
