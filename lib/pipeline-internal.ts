import { createHmac, timingSafeEqual } from "crypto";

/**
 * Internal-pipeline request marker.
 *
 * generate-template drives the blueprint -> implementation -> schema ->
 * api-design chain via internal HTTP calls to its own step endpoints. Those
 * steps each enforce a per-user rate limit for external callers, but one
 * pipeline run must be atomic: if the user consumed part of their `generate`
 * budget just before starting the pipeline, an internal step must not hit
 * 429 halfway through (after paid LLM work has already run) and fail the
 * whole generation run.
 *
 * Internal calls therefore carry a token in the X-Pipeline-Internal header,
 * and step endpoints skip their rate-limit check when the token verifies.
 * The token is an HMAC derived from SUPABASE_SERVICE_ROLE_KEY (server-only,
 * required at startup — see lib/env.ts), so external callers cannot forge it
 * without already having full database access. Authentication/authorization
 * in the step endpoints is NOT bypassed — only the rate limit is.
 */

export const INTERNAL_PIPELINE_HEADER = "x-pipeline-internal";

const TOKEN_CONTEXT = "saas-builder:pipeline-internal:v1";

/**
 * Returns the internal-pipeline token, or null when the secret it is
 * derived from is not configured (in which case internal calls simply
 * consume the normal rate limit — fail safe, never fail open).
 */
export function getInternalPipelineToken(): string | null {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) {
    return null;
  }
  return createHmac("sha256", secret).update(TOKEN_CONTEXT).digest("hex");
}

/**
 * True when the request carries a valid internal-pipeline token.
 * Uses a timing-safe comparison.
 */
export function isInternalPipelineRequest(req: Request): boolean {
  const provided = req.headers.get(INTERNAL_PIPELINE_HEADER);
  const expected = getInternalPipelineToken();

  if (!provided || !expected) {
    return false;
  }

  const providedBuf = Buffer.from(provided);
  const expectedBuf = Buffer.from(expected);

  if (providedBuf.length !== expectedBuf.length) {
    return false;
  }

  return timingSafeEqual(providedBuf, expectedBuf);
}
