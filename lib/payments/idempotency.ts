/**
 * Re-exports buildIdempotencyKey from @saas/payments. Kept as a local path
 * so existing relative imports (`../idempotency`) and tests keep working
 * unchanged after the extraction — see packages/payments/.
 */
export { buildIdempotencyKey } from "@saas/payments";
