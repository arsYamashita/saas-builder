/**
 * Re-exports the hardened Stripe client from @saas/payments. Kept as a
 * local path so existing call sites / test mocks (`vi.mock("@/lib/billing/stripe", ...)`)
 * keep working unchanged after the extraction — see packages/payments/.
 */
export { getStripeClient } from "@saas/payments";
