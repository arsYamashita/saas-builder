/**
 * Secret-shape patterns — pure regex, no network calls, no file writes.
 *
 * Ported from aeo-service's `harness/masker.py` (commit b2acc6e, which itself
 * fixed a real leak: a Gemini API key riding in a URL query string ended up
 * inside an httpx exception message and slipped past the masker — KB
 * `gemini_api_key_url_query_masker_bypass`). Extended here with a
 * role-aware JWT rule (Supabase-style anon vs. service_role) and a
 * Stripe-specific secret-key prefix, since this repo's real secrets include
 * both.
 *
 * Order matters: more specific patterns run first so a later, broader
 * pattern (e.g. hex32+) doesn't re-process an already-masked placeholder.
 */

export interface MaskPattern {
  /** Short, stable identifier — shows up in test failure messages. */
  name: string;
  /** Applied against the *whole* input string (multi-line safe: no `^`/`$`). */
  test: (text: string) => string;
}

/**
 * Supabase (and similar) JWTs encode `{"role": "..."}` in the payload
 * segment. `anon`-role tokens are the public, safe-to-log counterpart of
 * the anon key (already allowlisted by convention in `.env.example` and
 * `.gitleaks.toml` across our repos) — so we leave those alone to keep
 * log/error output readable. Everything else (service_role, authenticated,
 * no role claim at all, malformed payload) is masked: fail-closed, not
 * fail-open. See packages/secret-guard/README.md.
 */
const SAFE_JWT_ROLES = new Set(["anon"]);

const JWT_RE = /eyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}/g;

function base64UrlDecode(segment: string): string | null {
  try {
    const padded =
      segment.length % 4 === 0
        ? segment
        : segment + "=".repeat(4 - (segment.length % 4));
    const b64 = padded.replace(/-/g, "+").replace(/_/g, "/");
    return Buffer.from(b64, "base64").toString("utf8");
  } catch {
    return null;
  }
}

function jwtRole(token: string): string | null {
  const parts = token.split(".");
  if (parts.length < 2) return null;
  const payload = base64UrlDecode(parts[1]);
  if (!payload) return null;
  const match = payload.match(/"role"\s*:\s*"([^"]+)"/);
  return match ? match[1] : null;
}

function maskJwts(text: string): string {
  return text.replace(JWT_RE, (token) => {
    const role = jwtRole(token);
    if (role !== null && SAFE_JWT_ROLES.has(role)) return token;
    return "[JWT_MASKED]";
  });
}

export const PATTERNS: MaskPattern[] = [
  {
    // Role-aware first: a service_role JWT must never survive to hit the
    // generic hex/base64 patterns below as a false "safe" pass-through.
    name: "supabase-style-jwt",
    test: maskJwts,
  },
  {
    // OpenAI/Anthropic-style `sk-...` keys (Anthropic's own `sk-ant-...`
    // also matches this prefix).
    name: "sk-prefixed-key",
    test: (t) => t.replace(/sk-[A-Za-z0-9\-_]{20,}/g, "sk-[MASKED]"),
  },
  {
    // Stripe secret/restricted keys — `sk_live_`/`sk_test_`/`rk_live_`/
    // `rk_test_`. Deliberately excludes `pk_live_`/`pk_test_` (publishable,
    // meant to ship to the browser).
    name: "stripe-secret-key",
    test: (t) =>
      t.replace(
        /\b(sk|rk)_(live|test)_[A-Za-z0-9]{16,}\b/g,
        "$1_$2_[MASKED]"
      ),
  },
  {
    // Google API keys: `AIza` + 35 more chars (39 total). Not hex, so the
    // hex32+ rule below would miss it — this is why it needs its own rule.
    name: "google-aiza-key",
    test: (t) => t.replace(/AIza[A-Za-z0-9\-_]{35,}/g, "AIza[MASKED]"),
  },
  {
    // Bare `key=` in a URL query string. This is the exact shape of the
    // gemini_api_key_url_query_masker_bypass regression: an httpx/fetch
    // exception message embeds the full request URL, query string and all.
    name: "url-query-key-param",
    test: (t) => t.replace(/([?&]key=)[A-Za-z0-9\-_.]{16,}/gi, "$1[MASKED]"),
  },
  {
    name: "bearer-token",
    test: (t) =>
      t.replace(/Bearer\s+[A-Za-z0-9\-_.]{20,}/gi, "Bearer [MASKED]"),
  },
  {
    // Generic `api_key=`/`token=`/`token:`/`"token": "..."`/etc.
    // assignments (covers ad hoc internal tokens that don't match a known
    // provider prefix — including opaque non-hex values). Two Codex review
    // rounds on PR #37 shaped this:
    //  - bare `token` in the alternation — also catches compound names
    //    ending in it (`auth_token=`, `refresh_token=`);
    //  - optional quotes around the KEY side — without them, the
    //    JSON-serialized form `{"token":"..."}` (quoted key, so `"` sits
    //    between the key name and the `:`) never matched, which is exactly
    //    the http_response / structured-log shape this package exists for.
    // It can't false-match `tokenizer=` / `"tokenizer":` because `=`/`:`
    // (modulo an optional closing quote and whitespace) must immediately
    // follow the key name. Value min-length stays at {20,} — the same
    // false-positive guard as ever, so short ordinary values
    // (`token=abc123`) pass through.
    name: "generic-key-assignment",
    test: (t) =>
      t.replace(
        /["']?(api[_-]?key|apikey|api[_-]?token|access[_-]?token|secret[_-]?key|token)["']?\s*[=:]\s*["']?([A-Za-z0-9\-_.]{20,})["']?/gi,
        "$1=[MASKED]"
      ),
  },
  {
    // Generic long hex blob (raw hex API keys/secrets not covered above).
    // Runs last: by now every known non-hex secret shape has already been
    // replaced with a `[..._MASKED]` placeholder, so this can't accidentally
    // chew into one of those replacements.
    name: "hex32-plus",
    test: (t) => t.replace(/\b[0-9a-fA-F]{32,}\b/g, "[HEX_MASKED]"),
  },
];
