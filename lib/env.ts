import { z } from "zod";

// NOTE on Upstash (UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN):
// These stay `.optional()` here on purpose. This module is imported at
// module-init time (see app/layout.tsx), and Next.js runs route-bundle
// module-init (and `next build`, which sets NODE_ENV=production) in
// contexts where making these required would throw and crash the build or
// every route — exactly the failure mode recorded in this repo's KB as
// `startup_env_validation_prod_outage` (a prior full production outage
// caused by an import-time env requirement). Do NOT reintroduce a
// production-required superRefine here.
//
// Upstash enforcement instead happens at:
//   1. Deploy time: scripts/preflight-env.ts (run in the deploy pipeline
//      before going live, not wired into `next build`).
//   2. Runtime: lib/rate-limit.ts / lib/ratelimit.ts / middleware.ts fail
//      closed (deny requests) in production when Upstash is unset, rather
//      than silently allowing every request through.
const serverEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  STRIPE_SECRET_KEY: z.string().startsWith("sk_"),
  STRIPE_WEBHOOK_SECRET: z.string().startsWith("whsec_"),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().startsWith("pk_"),
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
  GEMINI_API_KEY: z.string().min(1).optional(),
  CLAUDE_API_KEY: z.string().min(1).optional(),
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1).optional(),
});

const result = serverEnvSchema.safeParse(process.env);

if (!result.success) {
  const formatted = result.error.flatten();
  console.error("Environment validation failed:");
  Object.entries(formatted.fieldErrors).forEach(([key, errors]) => {
    console.error(`  ${key}: ${(errors as string[]).join(", ")}`);
  });
  throw new Error(
    `Missing or invalid environment variables: ${Object.keys(formatted.fieldErrors).join(", ")}`
  );
}

export const env = result.data;
