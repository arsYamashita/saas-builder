import { describe, it, expect, beforeAll } from "vitest";
import { registerSink, assertAllKindsRegistered, _resetRegistryForTests } from "../sinks";

/**
 * The "配線テスト" (wiring test): registers a sink for every one of the five
 * known output-route kinds, then flows a battery of known secret shapes
 * through each one and asserts zero plaintext survives. This is the test
 * every consumer package's CI is expected to run (in addition to its own
 * kind-specific wiring, e.g. lib/api/errors.ts in saas-builder — see
 * packages/secret-guard/README.md "Real integration").
 *
 * `url_query` is a required, explicitly-named case: this is the shape of
 * the gemini_api_key_url_query_masker_bypass regression (a Gemini API key
 * survived masking because it only ever appeared inside a URL query
 * string, a route the original masker didn't model as its own case).
 */

const KNOWN_SECRETS: Record<string, string> = {
  anthropicKey: "sk-ant-api03-" + "Q".repeat(50),
  stripeSecretKey: "sk_live_" + "R2s3T4u5".repeat(4),
  googleApiKey: "AIza" + "V".repeat(35),
  bearerToken: "Bearer " + "W".repeat(30),
  hexToken: "f".repeat(40),
  serviceRoleJwt: buildFakeJwt({ role: "service_role" }),
};

function base64Url(json: unknown): string {
  return Buffer.from(JSON.stringify(json))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function buildFakeJwt(payload: Record<string, unknown>): string {
  return `${base64Url({ alg: "HS256" })}.${base64Url(payload)}.fakeSig1234567890abcdef`;
}

function assertNoSecretSurvives(masked: string) {
  for (const [label, secret] of Object.entries(KNOWN_SECRETS)) {
    expect(masked, `${label} leaked through unmasked`).not.toContain(secret);
  }
}

describe("wiring test — all five output routes, known secrets, zero plaintext", () => {
  let logSink: (s: string) => string;
  let httpResponseSink: (s: string) => string;
  let errorMessageSink: (s: string) => string;
  let urlQuerySink: (s: string) => string;
  let artifactFileSink: (s: string) => string;

  beforeAll(() => {
    _resetRegistryForTests();
    logSink = registerSink({ kind: "log", name: "wiring-test/console.log" });
    httpResponseSink = registerSink({
      kind: "http_response",
      name: "wiring-test/json-response-body",
    });
    errorMessageSink = registerSink({
      kind: "error_message",
      name: "wiring-test/thrown-error-message",
    });
    urlQuerySink = registerSink({
      kind: "url_query",
      name: "wiring-test/outbound-request-url",
    });
    artifactFileSink = registerSink({
      kind: "artifact_file",
      name: "wiring-test/generated-report-file",
    });
  });

  it("registers all five required kinds (coverage gate passes)", () => {
    expect(() => assertAllKindsRegistered()).not.toThrow();
  });

  it("log sink: masks a log line embedding every known secret", () => {
    const line = `[provider] request failed: ${Object.values(KNOWN_SECRETS).join(" | ")}`;
    assertNoSecretSurvives(logSink(line));
  });

  it("http_response sink: masks a JSON error body before it reaches the client", () => {
    const body = JSON.stringify({
      error: `upstream 500: ${KNOWN_SECRETS.stripeSecretKey} rejected`,
    });
    assertNoSecretSurvives(httpResponseSink(body));
  });

  it("error_message sink: masks a caught Error's .message", () => {
    const err = new Error(
      `Auth failed with token ${KNOWN_SECRETS.serviceRoleJwt}`
    );
    assertNoSecretSurvives(errorMessageSink(err.message));
  });

  it("url_query sink: masks a bare key= query param (gemini_api_key_url_query_masker_bypass regression)", () => {
    const url = `https://generativelanguage.googleapis.com/v1/models/gemini:generateContent?key=${KNOWN_SECRETS.googleApiKey}&alt=sse`;
    const masked = urlQuerySink(url);
    assertNoSecretSurvives(masked);
    expect(masked).toMatch(/key=(AIza)?\[MASKED\]/);
    // Non-secret query params survive untouched.
    expect(masked).toContain("alt=sse");
  });

  it("url_query sink: masks a bare key= query param with no recognized provider prefix", () => {
    const opaqueSecret = "q1w2e3r4t5y6u7i8o9p0asdfghjklzxcvb";
    const url = `https://api.example.com/v1/resource?key=${opaqueSecret}&format=json`;
    const masked = urlQuerySink(url);
    expect(masked).not.toContain(opaqueSecret);
    expect(masked).toContain("key=[MASKED]");
    expect(masked).toContain("format=json");
  });

  it("artifact_file sink: masks secrets before they're written into a generated file", () => {
    const fileContents = [
      "# Debug report",
      `Authorization header sent: ${KNOWN_SECRETS.bearerToken}`,
      `Raw hex secret observed: ${KNOWN_SECRETS.hexToken}`,
      `Anthropic key in stack trace: ${KNOWN_SECRETS.anthropicKey}`,
    ].join("\n");
    assertNoSecretSurvives(artifactFileSink(fileContents));
  });

  it("every registered sink independently masks every known secret (full matrix)", () => {
    const sinks = {
      log: logSink,
      http_response: httpResponseSink,
      error_message: errorMessageSink,
      url_query: urlQuerySink,
      artifact_file: artifactFileSink,
    };
    for (const [sinkName, sinkFn] of Object.entries(sinks)) {
      for (const [secretLabel, secret] of Object.entries(KNOWN_SECRETS)) {
        const out = sinkFn(`payload containing ${secret} inline`);
        expect(
          out,
          `${sinkName} sink failed to mask ${secretLabel}`
        ).not.toContain(secret);
      }
    }
  });
});
