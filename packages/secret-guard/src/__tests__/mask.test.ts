import { describe, it, expect } from "vitest";
import { mask } from "../mask";

// Real-shaped-but-fake sample secrets. Never real credentials.
const SAMPLES = {
  anthropicKey: "sk-ant-api03-" + "A".repeat(40) + "1234",
  openaiKey: "sk-" + "B".repeat(48),
  stripeSecret: "sk_live_" + "C1d2E3f4".repeat(4),
  stripeRestricted: "rk_test_" + "D1e2F3g4".repeat(4),
  stripePublishable: "pk_live_" + "E1f2G3h4".repeat(4), // must NOT be masked
  googleKey: "AIza" + "SyD9x2f8n1QwErTyUiOpAsDfGhJkLzXcVbNm".slice(0, 35),
  bearerToken: "Bearer " + "abcDEF123456".repeat(3),
  hexSecret: "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2c53c0f8ffa0a2c9c2e2f6b0",
  genericApiKey: 'api_key="' + "z9y8x7w6v5u4t3s2r1q0".repeat(2) + '"',
  supabaseAnonJwt: buildFakeJwt({ role: "anon", iss: "supabase" }),
  supabaseServiceRoleJwt: buildFakeJwt({ role: "service_role", iss: "supabase" }),
  plainJwtNoRole: buildFakeJwt({ iss: "example" }),
};

function base64Url(json: unknown): string {
  return Buffer.from(JSON.stringify(json))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function buildFakeJwt(payload: Record<string, unknown>): string {
  const header = base64Url({ alg: "HS256", typ: "JWT" });
  const body = base64Url(payload);
  const signature = "fakeSignatureNotARealOne1234567890";
  return `${header}.${body}.${signature}`;
}

describe("mask()", () => {
  it("returns falsy input unchanged (no crash on empty/undefined-ish input)", () => {
    expect(mask("")).toBe("");
  });

  it("masks sk-/sk-ant- style keys", () => {
    const out = mask(`key was ${SAMPLES.anthropicKey} in the log`);
    expect(out).not.toContain(SAMPLES.anthropicKey);
    expect(out).toContain("sk-[MASKED]");
  });

  it("masks bare sk- (OpenAI-style) keys", () => {
    const out = mask(SAMPLES.openaiKey);
    expect(out).not.toContain(SAMPLES.openaiKey);
  });

  it("masks Stripe secret and restricted keys but not publishable keys", () => {
    const out = mask(
      `${SAMPLES.stripeSecret} ${SAMPLES.stripeRestricted} ${SAMPLES.stripePublishable}`
    );
    expect(out).not.toContain(SAMPLES.stripeSecret);
    expect(out).not.toContain(SAMPLES.stripeRestricted);
    // Publishable keys are meant to ship to the browser — must survive.
    expect(out).toContain(SAMPLES.stripePublishable);
  });

  it("masks Google AIza-style keys (non-hex, needs its own rule)", () => {
    const out = mask(`GEMINI_API_KEY=${SAMPLES.googleKey}`);
    expect(out).not.toContain(SAMPLES.googleKey);
    expect(out).toContain("AIza[MASKED]");
  });

  it("masks a bare key= in a URL query string (gemini_api_key_url_query_masker_bypass regression)", () => {
    const url = `https://generativelanguage.googleapis.com/v1/models/gemini:generateContent?key=${SAMPLES.googleKey}`;
    const exceptionMessage = `httpx.HTTPStatusError: 429 for url '${url}'`;
    const out = mask(exceptionMessage);
    // The AIza-specific rule catches this key before the generic url-query
    // rule gets a turn (order in patterns.ts) — either way, the raw key
    // must not survive, and the `key=` param must be visibly masked.
    expect(out).not.toContain(SAMPLES.googleKey);
    expect(out).toMatch(/key=(AIza)?\[MASKED\]/);
  });

  it("masks a bare key= query string whose value doesn't match a known provider prefix", () => {
    const opaqueSecret = "z9y8x7w6v5u4t3s2r1q0mnbvcxzasdfghjkl";
    const url = `https://api.example.com/v1/resource?key=${opaqueSecret}&format=json`;
    const out = mask(url);
    expect(out).not.toContain(opaqueSecret);
    expect(out).toContain("key=[MASKED]");
    expect(out).toContain("format=json");
  });

  it("masks Bearer tokens", () => {
    const out = mask(`Authorization: ${SAMPLES.bearerToken}`);
    expect(out).not.toContain(SAMPLES.bearerToken);
    expect(out).toContain("Bearer [MASKED]");
  });

  it("masks generic api_key= assignments", () => {
    const out = mask(SAMPLES.genericApiKey);
    expect(out).not.toContain(SAMPLES.genericApiKey);
  });

  // Codex review P2 (PR #37): a bare `token=` / `token:` with an opaque,
  // non-hex value used to slip through — the alternation only listed
  // api_token/access_token compounds.
  it("masks a bare token= assignment with an opaque non-hex value", () => {
    const opaqueValue = "OpaqueSessionValue.v2-XyZ1234567890abcXYZ";
    const out = mask(`token=${opaqueValue}`);
    expect(out).not.toContain(opaqueValue);
    expect(out).toContain("token=[MASKED]");
  });

  it("masks a token: (colon) assignment with an opaque non-hex value", () => {
    const opaqueValue = "OpaqueColonValue-v3_LmN9876543210zyxWVU";
    const out = mask(`token: "${opaqueValue}"`);
    expect(out).not.toContain(opaqueValue);
    expect(out).toContain("token=[MASKED]");
  });

  it("does NOT false-match compound words like tokenizer=", () => {
    const text = "tokenizer=streamingWordPieceLongValue01";
    expect(mask(text)).toBe(text);
  });

  it("does NOT mask a short ordinary token= value (min-length guard)", () => {
    const text = "token=abc123";
    expect(mask(text)).toBe(text);
  });

  it("masks generic 32+ char hex blobs", () => {
    const out = mask(`sha256=${SAMPLES.hexSecret}`);
    expect(out).not.toContain(SAMPLES.hexSecret);
    expect(out).toContain("[HEX_MASKED]");
  });

  it("masks a service_role JWT (Supabase-style)", () => {
    const out = mask(`SUPABASE_SERVICE_ROLE_KEY=${SAMPLES.supabaseServiceRoleJwt}`);
    expect(out).not.toContain(SAMPLES.supabaseServiceRoleJwt);
    expect(out).toContain("[JWT_MASKED]");
  });

  it("does NOT mask an anon-role JWT (safe/public by convention)", () => {
    const out = mask(`NEXT_PUBLIC_SUPABASE_ANON_KEY=${SAMPLES.supabaseAnonJwt}`);
    expect(out).toContain(SAMPLES.supabaseAnonJwt);
  });

  it("masks a JWT with no role claim (fail-closed default)", () => {
    const out = mask(SAMPLES.plainJwtNoRole);
    expect(out).not.toContain(SAMPLES.plainJwtNoRole);
    expect(out).toContain("[JWT_MASKED]");
  });

  it("leaves ordinary text untouched", () => {
    const text = "The quick brown fox jumps over the lazy dog. Order #12345.";
    expect(mask(text)).toBe(text);
  });
});
