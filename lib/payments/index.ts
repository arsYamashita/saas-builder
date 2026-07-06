/**
 * Payments module — the single import surface for Stripe integration code
 * used by this app.
 *
 * The actual implementation now lives in the @saas/payments workspace
 * package (packages/payments/) so it can be shared with generated
 * templates too. This module re-exports it under the app's existing
 * `@/lib/payments` path so:
 *   - existing call sites,
 *   - existing test mocks (`vi.mock("@/lib/payments", ...)`), and
 *   - new API routes / AI-generated templates (see
 *     docs/rules/06-api-rules.md, "Payments (Stripe) — Security Baseline")
 * keep working unchanged and reuse the same hardened building blocks
 * instead of re-inventing Stripe wiring (and re-introducing bugs already
 * recorded in 30_Knowledge/errors/) per template.
 *
 * See packages/payments/README.md for the mandatory usage rules
 * (idempotencyKey required on checkout, signature verification required on
 * webhooks).
 */
export {
  getStripeClient,
  buildIdempotencyKey,
  createCheckoutSession,
  verifyWebhookSignature,
  MissingWebhookMetadataError,
} from "@saas/payments";
