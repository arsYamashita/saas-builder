import type Stripe from "stripe";

/**
 * Verify a Stripe webhook request signature and return the constructed
 * event. This is the package's only supported entry point for turning a
 * raw webhook payload into a trusted `Stripe.Event` — there is deliberately
 * no "skip verification" / "trust this payload" escape hatch. An
 * unsigned or wrongly-signed payload must never be processed as a real
 * Stripe event. See [[stripe_webhook_signature_missing]].
 *
 * Signature verification failures (including a missing signature) throw;
 * callers should treat any throw here as "return HTTP 400, do not process,
 * do not ask Stripe to retry" (an invalid signature is never transient).
 *
 * @param stripe - a Stripe client (see `getStripeClient`)
 * @param payload - the raw (unparsed) request body
 * @param signature - the `stripe-signature` request header. REQUIRED —
 *   pass the actual header value, never a default/empty string.
 * @param webhookSecret - the endpoint's signing secret
 *   (`STRIPE_WEBHOOK_SECRET`). REQUIRED.
 */
export function verifyWebhookSignature(
  stripe: Stripe,
  payload: string | Buffer,
  signature: string,
  webhookSecret: string
): Stripe.Event {
  if (!signature) {
    throw new Error(
      "verifyWebhookSignature requires a non-empty stripe-signature header"
    );
  }
  if (!webhookSecret) {
    throw new Error(
      "verifyWebhookSignature requires a non-empty webhookSecret"
    );
  }

  return stripe.webhooks.constructEvent(payload, signature, webhookSecret);
}
