/**
 * Next.js instrumentation hook — runs once when the server process starts
 * (both `next dev` and `next start`), before any request is handled.
 *
 * Used here to fail fast on missing/invalid required environment variables
 * (Stripe keys, Supabase config) instead of booting successfully and only
 * failing at the first checkout/webhook request in production.
 * See [[missing_env_validation_startup]] / [[stripe_env_optional_in_zod]].
 *
 * Requires `experimental.instrumentationHook: true` in next.config.js
 * (Next.js 14; this becomes the default in Next.js 15+).
 */
export async function register() {
  // Only validate in the Node.js runtime (not edge / middleware runtime),
  // and skip during `next build`'s static analysis pass to avoid failing a
  // build in CI where secrets aren't injected. Production `next start` and
  // `next dev` still validate on real boot.
  if (
    process.env.NEXT_RUNTIME === "nodejs" &&
    process.env.NEXT_PHASE !== "phase-production-build"
  ) {
    const { validateEnv } = await import("./lib/env");
    validateEnv();
  }
}
