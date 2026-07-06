import { PATTERNS } from "./patterns";

/**
 * Masks every known secret shape in `text`. Pure function: no I/O, no
 * mutation, safe to call on anything before it leaves the process (a log
 * line, an HTTP response body, a generated file on disk, ...).
 *
 * Not a substitute for not-logging-secrets-in-the-first-place — it's a
 * defense-in-depth net for the case a secret ends up embedded in a
 * downstream SDK's error message/stack (Stripe, Supabase, Gemini, etc. all
 * do this) where you don't control the string's construction.
 */
export function mask(text: string): string {
  if (!text) return text;
  let out = text;
  for (const pattern of PATTERNS) {
    out = pattern.test(out);
  }
  return out;
}

export { PATTERNS } from "./patterns";
export type { MaskPattern } from "./patterns";
