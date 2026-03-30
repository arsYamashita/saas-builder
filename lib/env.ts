import { z } from "zod";

const serverEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  STRIPE_SECRET_KEY: z.string().startsWith("sk_"),
  STRIPE_WEBHOOK_SECRET: z.string().startsWith("whsec_"),
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
