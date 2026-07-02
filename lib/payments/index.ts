/**
 * Payments module — the single import surface for Stripe integration code.
 *
 * This module intentionally does not reimplement anything that already
 * exists and is already hardened in @/lib/billing (signature-verified
 * Stripe client, webhook error classification). It re-exports those
 * pieces alongside the idempotency-key helper under one path so that:
 *   - new API routes in this app, and
 *   - AI-generated templates (see docs/rules/06-api-rules.md,
 *     "Payments (Stripe) — Security Baseline")
 * reuse the same hardened building blocks instead of re-inventing Stripe
 * wiring (and re-introducing bugs already recorded in
 * 30_Knowledge/errors/) per template.
 */
export { getStripeClient } from "@/lib/billing/stripe";
export { MissingWebhookMetadataError } from "@/lib/billing/webhook-errors";
export { buildIdempotencyKey } from "./idempotency";
