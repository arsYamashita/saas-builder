import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  INTERNAL_PIPELINE_HEADER,
  getInternalPipelineToken,
  isInternalPipelineRequest,
} from "../pipeline-internal";

const SECRET = "test-service-role-key";

function makeRequest(headerValue?: string) {
  const headers = new Headers();
  if (headerValue !== undefined) {
    headers.set(INTERNAL_PIPELINE_HEADER, headerValue);
  }
  return new Request("https://example.com/api/projects/p1/generate-blueprint", {
    method: "POST",
    headers,
  });
}

describe("pipeline-internal", () => {
  const original = process.env.SUPABASE_SERVICE_ROLE_KEY;

  beforeEach(() => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = SECRET;
  });

  afterEach(() => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = original;
  });

  it("produces a deterministic token derived from the server secret", () => {
    const a = getInternalPipelineToken();
    const b = getInternalPipelineToken();
    expect(a).toBeTruthy();
    expect(a).toBe(b);
    // Must never leak the raw secret itself.
    expect(a).not.toContain(SECRET);
  });

  it("returns null when the secret is not configured (fail safe, not open)", () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(getInternalPipelineToken()).toBeNull();
    // And verification must reject everything in that state.
    expect(isInternalPipelineRequest(makeRequest("anything"))).toBe(false);
  });

  it("accepts a request carrying the valid token", () => {
    const token = getInternalPipelineToken()!;
    expect(isInternalPipelineRequest(makeRequest(token))).toBe(true);
  });

  it("rejects a request with no header", () => {
    expect(isInternalPipelineRequest(makeRequest())).toBe(false);
  });

  it("rejects a request with a forged token", () => {
    expect(isInternalPipelineRequest(makeRequest("forged-token"))).toBe(false);
    // Same length as a real hex token but wrong content.
    expect(isInternalPipelineRequest(makeRequest("0".repeat(64)))).toBe(false);
  });

  it("rejects tokens derived from a different secret", () => {
    const tokenFromOtherSecret = (() => {
      process.env.SUPABASE_SERVICE_ROLE_KEY = "some-other-secret";
      const t = getInternalPipelineToken()!;
      process.env.SUPABASE_SERVICE_ROLE_KEY = SECRET;
      return t;
    })();

    expect(isInternalPipelineRequest(makeRequest(tokenFromOtherSecret))).toBe(
      false
    );
  });
});
