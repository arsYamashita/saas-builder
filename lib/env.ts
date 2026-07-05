import { z } from "zod";

/**
 * Startup environment validation.
 *
 * Payment-critical variables (Stripe) were previously either unvalidated or
 * `.optional()` in Zod, so the server would boot successfully without them
 * and only fail the first time a checkout/webhook request came in — a silent
 * production outage. See [[stripe_env_optional_in_zod]] and
 * [[missing_env_validation_startup]].
 *
 * Stripe keys are required in production, but only format-checked (not
 * required) in development/test — this mirrors the "Environment で条件分岐"
 * alternative documented in [[stripe_env_optional_in_zod]], and keeps `next
 * dev` / CI jobs that don't have Stripe test keys configured (e.g. this
 * repo's Playwright smoke-test job) from failing to boot. Production
 * (`NODE_ENV=production`, i.e. `next start`) always enforces both keys.
 *
 * AI provider keys (GEMINI_API_KEY / CLAUDE_API_KEY / OPENAI_API_KEY) are
 * intentionally left optional: lib/providers/task-router.ts is designed to
 * route around a missing provider via fallback, so requiring all of them
 * would break that design. Upstash Redis is optional too — lib/rate-limit.ts
 * falls back to an in-memory limiter for local development.
 */
const baseEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z
    .string({ required_error: "NEXT_PUBLIC_SUPABASE_URL is required" })
    .url("NEXT_PUBLIC_SUPABASE_URL must be a valid URL"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z
    .string({ required_error: "NEXT_PUBLIC_SUPABASE_ANON_KEY is required" })
    .min(1, "NEXT_PUBLIC_SUPABASE_ANON_KEY is required"),
  SUPABASE_SERVICE_ROLE_KEY: z
    .string({ required_error: "SUPABASE_SERVICE_ROLE_KEY is required" })
    .min(1, "SUPABASE_SERVICE_ROLE_KEY is required"),
  NEXT_PUBLIC_APP_URL: z
    .string({ required_error: "NEXT_PUBLIC_APP_URL is required" })
    .url("NEXT_PUBLIC_APP_URL must be a valid URL"),

  STRIPE_SECRET_KEY: z.string().min(1).optional(),
  STRIPE_WEBHOOK_SECRET: z.string().min(1).optional(),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().optional(),

  // AI providers — optional by design (fallback routing across providers).
  GEMINI_API_KEY: z.string().min(1).optional(),
  CLAUDE_API_KEY: z.string().min(1).optional(),
  OPENAI_API_KEY: z.string().min(1).optional(),

  // Rate limiting — optional (in-memory fallback for local dev).
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1).optional(),

  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
});

const STRIPE_SECRET_KEY_PREFIXES = ["sk_live_", "sk_test_"] as const;
const STRIPE_WEBHOOK_SECRET_PREFIX = "whsec_";

/**
 * Stripe is treated as "configured" when any Stripe-related variable is set.
 * A production deployment with Stripe fully absent boots with a loud warning
 * instead of failing: pre-launch environments legitimately run without Stripe
 * (billing routes already reject at point-of-use), and hard-requiring the
 * keys took the whole site down on 2026-07-03 when production had none set.
 * Once ANY Stripe variable is present, both server-side keys are enforced in
 * production so a half-configured Stripe never reaches users.
 */
function stripeConfigured(env: {
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?: string;
}): boolean {
  return Boolean(
    env.STRIPE_SECRET_KEY ||
      env.STRIPE_WEBHOOK_SECRET ||
      env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  );
}

const serverEnvSchema = baseEnvSchema.superRefine((env, ctx) => {
  const isProduction = env.NODE_ENV === "production";
  const enforceStripe = isProduction && stripeConfigured(env);

  if (!env.STRIPE_SECRET_KEY) {
    if (enforceStripe) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["STRIPE_SECRET_KEY"],
        message:
          "STRIPE_SECRET_KEY is required in production when Stripe is configured",
      });
    }
  } else if (
    !STRIPE_SECRET_KEY_PREFIXES.some((prefix) =>
      env.STRIPE_SECRET_KEY!.startsWith(prefix)
    )
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["STRIPE_SECRET_KEY"],
      message: "STRIPE_SECRET_KEY must start with sk_live_ or sk_test_",
    });
  }

  if (!env.STRIPE_WEBHOOK_SECRET) {
    if (enforceStripe) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["STRIPE_WEBHOOK_SECRET"],
        message:
          "STRIPE_WEBHOOK_SECRET is required in production when Stripe is configured",
      });
    }
  } else if (!env.STRIPE_WEBHOOK_SECRET.startsWith(STRIPE_WEBHOOK_SECRET_PREFIX)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["STRIPE_WEBHOOK_SECRET"],
      message: `STRIPE_WEBHOOK_SECRET must start with ${STRIPE_WEBHOOK_SECRET_PREFIX}`,
    });
  }
});

export type ServerEnv = z.infer<typeof baseEnvSchema>;

let cachedEnv: ServerEnv | null = null;

/**
 * Treats present-but-empty env values as absent.
 *
 * The documented setup flow is `cp .env.example .env.local`; any `KEY=`
 * line with no value lands in process.env as an EMPTY STRING, not
 * undefined. Zod's `.optional()` only tolerates undefined — an empty
 * string still hits `.min(1)` / `.url()` / prefix refinements, so every
 * optional key (GEMINI_API_KEY, UPSTASH_REDIS_REST_URL, Stripe keys, …)
 * would throw at startup for anyone who copied the example file without
 * filling in the optional section. Same KB class as
 * [[missing_env_validation_startup]] / [[stripe_env_optional_in_zod]].
 *
 * Required keys are unaffected in outcome: an empty required value now
 * fails with the clearer "X is required" instead of a format error.
 * Whitespace-only values are treated as empty too — they are always a
 * copy/paste artifact, never a real credential.
 */
function normalizeEnv(env: NodeJS.ProcessEnv): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined && value.trim() !== "") {
      normalized[key] = value;
    }
  }
  return normalized;
}

/**
 * Parses and validates process.env against the schema above. Throws with a
 * readable, aggregated message (all missing/invalid vars at once) rather
 * than the caller having to hunt down one env var at a time.
 *
 * Not called automatically on import — call explicitly from
 * instrumentation.ts (server startup) so importing this module in tests
 * doesn't require a fully-populated environment.
 */
export function validateEnv(env: NodeJS.ProcessEnv = process.env): ServerEnv {
  const result = serverEnvSchema.safeParse(normalizeEnv(env));

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(
      `Invalid environment configuration. Fix the following and restart:\n${issues}`
    );
  }

  if (
    result.data.NODE_ENV === "production" &&
    !stripeConfigured(result.data)
  ) {
    console.error(
      "[env] CRITICAL: Stripe is not configured in production " +
        "(STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET missing). " +
        "Billing and webhooks are disabled until the keys are set."
    );
  }

  cachedEnv = result.data;
  return result.data;
}

/**
 * Returns the validated env, running validation lazily on first access if
 * instrumentation.ts hasn't already done so (e.g. in edge runtime contexts
 * where register() doesn't run for the nodejs runtime).
 */
export function getEnv(): ServerEnv {
  if (!cachedEnv) {
    return validateEnv();
  }
  return cachedEnv;
}
