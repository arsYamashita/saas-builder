// Simulates a file that lives INSIDE packages/payments/ (the test assigns
// this content the logical path "packages/payments/src/checkout.ts") —
// direct Stripe SDK calls are expected and allowed here; this is the one
// place that is allowed to call the raw SDK.
import Stripe from "stripe";

export function createCheckoutSession(
  stripe: Stripe,
  params: Stripe.Checkout.SessionCreateParams,
  idempotencyKey: string
) {
  return stripe.checkout.sessions.create(params, { idempotencyKey });
}
