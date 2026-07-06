import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { parseJsonBody, serverErrorResponse } from "../errors";

describe("parseJsonBody", () => {
  it("returns the parsed body on valid JSON", async () => {
    const req = new Request("https://example.com", {
      method: "POST",
      body: JSON.stringify({ foo: "bar" }),
    });

    const result = await parseJsonBody<{ foo: string }>(req);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toEqual({ foo: "bar" });
  });

  it("returns a 400 response on invalid JSON — never a silent {}", async () => {
    const req = new Request("https://example.com", {
      method: "POST",
      body: "{not valid json",
    });

    const result = await parseJsonBody(req);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(400);
    const json = await result.response.json();
    expect(json.error).toBe("Invalid JSON body");
  });

  it("returns a 400 response on an empty body", async () => {
    const req = new Request("https://example.com", {
      method: "POST",
      body: "",
    });

    const result = await parseJsonBody(req);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(400);
  });

  it("allowEmpty: treats an empty body as {} but still rejects malformed JSON", async () => {
    const emptyReq = new Request("https://example.com", {
      method: "POST",
      body: "",
    });
    const emptyResult = await parseJsonBody(emptyReq, { allowEmpty: true });
    expect(emptyResult.ok).toBe(true);
    if (emptyResult.ok) {
      expect(emptyResult.data).toEqual({});
    }

    const badReq = new Request("https://example.com", {
      method: "POST",
      body: "{still not json",
    });
    const badResult = await parseJsonBody(badReq, { allowEmpty: true });
    expect(badResult.ok).toBe(false);
    if (!badResult.ok) {
      expect(badResult.response.status).toBe(400);
    }
  });
});

describe("serverErrorResponse", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns a generic message + errorId, defaulting to 500", async () => {
    const res = serverErrorResponse(
      "test-context",
      new Error("relation \"commissions\" violates unique constraint")
    );

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("Internal server error");
    expect(typeof json.errorId).toBe("string");
    expect(json.errorId.length).toBeGreaterThan(0);
    // The raw DB error must never appear in the client-facing body.
    expect(JSON.stringify(json)).not.toContain("commissions");
    expect(JSON.stringify(json)).not.toContain("unique constraint");
  });

  it("logs the real cause server-side, tagged with the same errorId", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = serverErrorResponse("billing/checkout", new Error("db exploded"));
    const json = await res.json();

    expect(spy).toHaveBeenCalledTimes(1);
    const [logLine, loggedCause] = spy.mock.calls[0];
    expect(logLine).toContain("billing/checkout");
    expect(logLine).toContain(json.errorId);
    expect(loggedCause).toBe("db exploded");
  });

  it("supports a custom status and public message", async () => {
    const res = serverErrorResponse("projects/plan-lookup", new Error("no rows"), {
      status: 400,
      message: "Plan not found",
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Plan not found");
  });

  it("handles non-Error causes safely", async () => {
    const res = serverErrorResponse("context", "a plain string cause");
    const json = await res.json();
    expect(json.error).toBe("Internal server error");
  });

  it("logs the real message (not '[object Object]') for a plain PostgrestError-shaped cause", async () => {
    // Regression test: Supabase/PostgREST errors are plain objects
    // (`{ message, code, details, hint }`), never `instanceof Error`. This
    // is the actual shape passed to serverErrorResponse() by every
    // `const { error } = await supabase...` call site (~22 routes) — if the
    // server-side log line degrades to the useless "[object Object]" for
    // this shape, every real DB failure in production is unloggable
    // despite errorId-based tracing being this function's whole point.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    const postgrestError = {
      message: 'duplicate key value violates unique constraint "commissions_subscription_id_key"',
      code: "23505",
      details: "",
      hint: "",
    };
    const res = serverErrorResponse("billing/checkout", postgrestError);
    const json = await res.json();

    expect(spy).toHaveBeenCalledTimes(1);
    const [, loggedCause] = spy.mock.calls[0];
    expect(loggedCause).not.toBe("[object Object]");
    expect(loggedCause).toContain("commissions_subscription_id_key");
    expect(loggedCause).toContain("23505");

    // Still never forwarded to the client.
    expect(json.error).toBe("Internal server error");
    expect(JSON.stringify(json)).not.toContain("commissions_subscription_id_key");
  });
});
