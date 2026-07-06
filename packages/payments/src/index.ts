/**
 * @saas/payments — the hardened Stripe integration surface shared by
 * saas-builder and generated templates.
 *
 * See this package's README.md for the mandatory usage rules
 * (idempotencyKey required on checkout, signature verification required on
 * webhooks) before using any of these exports.
 */
export { getStripeClient } from "./stripe-client";
export { buildIdempotencyKey } from "./idempotency";
export { createCheckoutSession } from "./checkout";
export { verifyWebhookSignature } from "./webhook";
export { MissingWebhookMetadataError } from "./errors";
export type { default as Stripe } from "stripe";
