import { describe, it, expect } from "vitest";
import {
  canonicalJson,
  hashPayload,
  isStripeIdempotencyError,
} from "../payload-hash";

describe("canonicalJson", () => {
  it("sorts object keys recursively so key order does not matter", () => {
    const a = { b: 1, a: { d: [1, { z: 1, y: 2 }], c: "x" } };
    const b = { a: { c: "x", d: [1, { y: 2, z: 1 }] }, b: 1 };
    expect(canonicalJson(a)).toBe(canonicalJson(b));
    expect(canonicalJson(a)).toBe('{"a":{"c":"x","d":[1,{"y":2,"z":1}]},"b":1}');
  });

  it("keeps array order (order is meaningful for line_items)", () => {
    expect(canonicalJson([1, 2])).not.toBe(canonicalJson([2, 1]));
  });

  it("drops undefined object values, like JSON.stringify", () => {
    expect(canonicalJson({ a: 1, b: undefined })).toBe(canonicalJson({ a: 1 }));
  });

  it("keeps null and empty string distinct from absent", () => {
    expect(canonicalJson({ a: null })).not.toBe(canonicalJson({}));
    expect(canonicalJson({ a: "" })).not.toBe(canonicalJson({}));
  });
});

describe("hashPayload", () => {
  it("returns 16 lowercase hex characters", () => {
    expect(hashPayload({ a: 1 })).toMatch(/^[0-9a-f]{16}$/);
  });

  it("is stable for the same content and independent of key order", () => {
    expect(hashPayload({ a: 1, b: { c: 2, d: 3 } })).toBe(
      hashPayload({ b: { d: 3, c: 2 }, a: 1 })
    );
  });

  it("changes when any nested value changes", () => {
    expect(hashPayload({ m: { r: "" } })).not.toBe(hashPayload({ m: { r: "x" } }));
  });

  it("matches the known SHA-256 prefix of the canonical JSON", () => {
    // sha256('{"a":1}') = 015abd7f5cc57a2dd94b7590f04ad8084273905ee33ec5cebeae62276a97f862
    expect(hashPayload({ a: 1 })).toBe("015abd7f5cc57a2d");
  });
});

describe("isStripeIdempotencyError", () => {
  it("recognizes the Stripe SDK error type", () => {
    expect(isStripeIdempotencyError({ type: "StripeIdempotencyError" })).toBe(true);
  });

  it("recognizes the raw API error type", () => {
    expect(isStripeIdempotencyError({ rawType: "idempotency_error" })).toBe(true);
    expect(isStripeIdempotencyError({ type: "idempotency_error" })).toBe(true);
    expect(isStripeIdempotencyError({ raw: { type: "idempotency_error" } })).toBe(true);
  });

  it("rejects other errors and non-objects", () => {
    expect(isStripeIdempotencyError(new Error("stripe down"))).toBe(false);
    expect(isStripeIdempotencyError({ type: "StripeCardError" })).toBe(false);
    expect(isStripeIdempotencyError(null)).toBe(false);
    expect(isStripeIdempotencyError("idempotency_error")).toBe(false);
  });
});
