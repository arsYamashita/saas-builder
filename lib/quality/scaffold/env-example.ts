export function getScaffoldEnvExample() {
  // Scaffold-specific .env.example — NOT a copy of this repo's own
  // .env.example. Two deliberate differences:
  //
  // 1. Optional keys are COMMENTED OUT, not written as empty `KEY=` lines.
  //    The documented setup flow is `cp .env.example .env.local`; an empty
  //    `GEMINI_API_KEY=` line becomes a *present empty string* in
  //    process.env, which (before lib/env.ts learned to normalize empty
  //    strings) turned "optional" keys into a startup throw. Commenting
  //    them out keeps `cp` + fill-in-required-only working. This is the
  //    [[missing_env_validation_startup]] / [[stripe_env_optional_in_zod]]
  //    KB class in a new guise.
  //
  // 2. Only keys the generated app actually reads (lib/env.ts schema) are
  //    listed — no builder-only keys (AI status flags, Playwright auth).
  return `# ── Required (validated at server startup — see lib/env.ts) ──
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Used for CSRF/Origin verification; required at startup.
NEXT_PUBLIC_APP_URL=http://localhost:3000

# ── Optional (uncomment to enable — leave commented if unused) ──
# Stripe: format-checked when present; both server keys are enforced in
# production once ANY Stripe variable is set (see lib/env.ts).
# STRIPE_SECRET_KEY must start with sk_live_ or sk_test_
# STRIPE_WEBHOOK_SECRET must start with whsec_
#STRIPE_SECRET_KEY=
#STRIPE_WEBHOOK_SECRET=
#NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=

# Upstash Redis (rate limiting — falls back to in-memory for local dev)
#UPSTASH_REDIS_REST_URL=
#UPSTASH_REDIS_REST_TOKEN=

# AI provider keys (only if this app calls AI providers directly)
#GEMINI_API_KEY=
#CLAUDE_API_KEY=
#OPENAI_API_KEY=
`;
}
