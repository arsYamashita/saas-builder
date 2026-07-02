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
 * Builds a deterministic idempotency key for a Stripe mutation.
 *
 * The key is scoped to the caller-supplied parts (e.g. userId + planId)
 * plus a coarse time bucket, so:
 *  - a double-click / client retry / network timeout within the same
 *    bucket reuses the key and Stripe returns the original object instead
 *    of creating a duplicate one
 *  - a genuinely new request in a later bucket gets a fresh key, so the
 *    key does not permanently block a legitimate repeat purchase
 *
 * @param parts - ordered list of scoping values, e.g. [userId, planId]
 * @param bucketMs - time bucket size in ms (default 60_000 = 1 minute)
 */
export function buildIdempotencyKey(
  parts: Array<string | number>,
  bucketMs = 60_000
): string {
  const cleanParts = parts.map((p) => String(p).trim()).filter(Boolean);

  if (cleanParts.length === 0) {
    throw new Error(
      "buildIdempotencyKey requires at least one non-empty part"
    );
  }

  if (!Number.isFinite(bucketMs) || bucketMs <= 0) {
    throw new Error("buildIdempotencyKey requires a positive bucketMs");
  }

  const bucket = Math.floor(Date.now() / bucketMs);
  return [...cleanParts, bucket].join(":");
}
