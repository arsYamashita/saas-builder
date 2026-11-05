import { createHash } from "node:crypto";

/**
 * Serializes a value to JSON with object keys sorted recursively, so two
 * values with the same content always produce the same string no matter
 * how their keys were ordered. Array order is kept (it is meaningful, e.g.
 * `line_items`). `undefined` object values are dropped, like
 * `JSON.stringify`; `null` and "" are kept so they stay distinct from
 * "absent".
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value)) ?? "null";
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((v) => (v === undefined ? null : sortKeys(v)));
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const v = (value as Record<string, unknown>)[key];
      if (v !== undefined) out[key] = sortKeys(v);
    }
    return out;
  }
  return value;
}

/**
 * First 16 hex characters of the SHA-256 of `canonicalJson(value)`.
 *
 * Append this to the parts given to `buildIdempotencyKey` so the key
 * changes whenever the content sent to Stripe changes. See
 * [[idempotency_key_only_completion_check_ignores_changed_input_after_reconnect]].
 */
export function hashPayload(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex").slice(0, 16);
}

/**
 * True for the error Stripe raises when an idempotency key is reused with
 * different parameters (SDK `StripeIdempotencyError`, raw type
 * `idempotency_error`). Duck-typed so it also works across SDK copies and
 * in tests.
 */
export function isStripeIdempotencyError(error: unknown): boolean {
  if (error === null || typeof error !== "object") return false;
  const e = error as { type?: unknown; rawType?: unknown; raw?: { type?: unknown } };
  return (
    e.type === "StripeIdempotencyError" ||
    e.type === "idempotency_error" ||
    e.rawType === "idempotency_error" ||
    e.raw?.type === "idempotency_error"
  );
}
