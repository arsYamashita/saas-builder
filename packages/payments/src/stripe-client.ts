import Stripe from "stripe";

let stripeClient: Stripe | null = null;

/**
 * Lazily-constructed, memoized Stripe client.
 *
 * Reads `STRIPE_SECRET_KEY` from the environment. Throws (rather than
 * returning a half-configured client) when the key is missing, so a
 * misconfigured deployment fails loudly at the first Stripe call instead of
 * silently no-op-ing.
 */
export function getStripeClient(): Stripe {
  if (!stripeClient) {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      throw new Error("STRIPE_SECRET_KEY is missing");
    }

    stripeClient = new Stripe(secretKey, {
      apiVersion: "2025-02-24.acacia" as Stripe.LatestApiVersion,
    });
  }

  return stripeClient;
}
