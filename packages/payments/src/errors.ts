/**
 * Thrown when required Stripe metadata (tenant_id / app_user_id) is missing.
 * The webhook handler maps this to HTTP 400 (no retry): a metadata gap is a
 * configuration error, not a transient failure, so retrying won't help.
 * See [[stripe_webhook_empty_string_metadata_fallback]].
 */
export class MissingWebhookMetadataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MissingWebhookMetadataError";
  }
}
