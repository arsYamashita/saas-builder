/**
 * Re-exports MissingWebhookMetadataError from @saas/payments. Kept as a
 * local path so existing call sites keep working unchanged after the
 * extraction — see packages/payments/.
 */
export { MissingWebhookMetadataError } from "@saas/payments";
