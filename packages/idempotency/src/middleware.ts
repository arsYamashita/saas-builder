import type { IdempotencyStore } from "./types";
import { DEFAULT_SCOPE, DEFAULT_TTL_MS } from "./core";

/** App Router Route Handler shape: `(req, ctx?) => Promise<Response>`. */
export type RouteHandler<Ctx = unknown> = (
  req: Request,
  ctx: Ctx
) => Promise<Response>;

export interface WithRouteOptions<Ctx = unknown> {
  /** HTTP header carrying the client-supplied idempotency key. Default:
   * "Idempotency-Key" (the de-facto standard used by Stripe, GitHub, etc.). */
  headerName?: string;
  /**
   * Derives the isolation scope for this request — MUST be tenant-derived
   * whenever the key itself is client-supplied (the common case for this
   * middleware). Two different tenants sending the same `Idempotency-Key`
   * header value must NOT collide on the same stored row, or tenant A
   * could receive tenant B's replayed response. Defaults to a single
   * fixed scope, which is only safe for endpoints with no tenant concept
   * at all — every tenant-scoped mutating route MUST pass `getScope`.
   */
  getScope?: (req: Request, ctx: Ctx) => string | Promise<string>;
  /** Claim TTL — see `RunIdempotentOptions.ttlMs`. Default 5 minutes. */
  ttlMs?: number;
  /** When `false`, requests without the header are passed straight
   * through to `handler` unguarded (useful for routes where idempotency
   * is opt-in). Default `true`: a missing header is rejected with 400,
   * since a route wrapped in `withRoute` is documenting "callers must
   * supply an idempotency key" — silently no-op'ing that expectation is
   * how the KB pattern this package exists to close (see
   * [[cron_owner_digest_no_idempotency]], [[stripe_recurring_subscription_missing_conflict_guard]])
   * happens again.
   */
  required?: boolean;
  store: IdempotencyStore;
}

function jsonResponse(payload: unknown, status: number, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json", ...extraHeaders },
  });
}

/**
 * Wraps a Next.js App Router Route Handler with Idempotency-Key semantics:
 *
 *   - Missing key: 400 (unless `required: false`).
 *   - New key: runs `handler`, stores its response, returns it unchanged.
 *   - Same key, prior run completed: replays the STORED response
 *     (identical status + body) WITHOUT re-running `handler` — the
 *     "同一キー同一レスポンス" requirement.
 *   - Same key, prior run still in flight: 409 — the "処理中409"
 *     requirement — rather than starting a second concurrent execution of
 *     `handler` for the same logical request.
 *
 * `handler`'s response is read via `.clone()` so the original `Response`
 * object (with its original stream state) is what actually gets returned
 * to the client on a fresh run — only the clone is consumed to snapshot
 * the body for future replays.
 */
export function withRoute<Ctx = unknown>(
  handler: RouteHandler<Ctx>,
  opts: WithRouteOptions<Ctx>
): RouteHandler<Ctx> {
  const headerName = opts.headerName ?? "Idempotency-Key";
  const required = opts.required ?? true;
  const ttlMs = opts.ttlMs ?? DEFAULT_TTL_MS;
  const { store } = opts;

  return async (req: Request, ctx: Ctx): Promise<Response> => {
    const key = req.headers.get(headerName);

    if (!key || !key.trim()) {
      if (!required) {
        return handler(req, ctx);
      }
      return jsonResponse(
        {
          error: "idempotency_key_required",
          message: `Missing required "${headerName}" header`,
        },
        400
      );
    }

    const scope = opts.getScope ? await opts.getScope(req, ctx) : DEFAULT_SCOPE;

    const claim = await store.claim(scope, key, ttlMs);

    if (claim.kind === "completed") {
      const body = claim.body === null || claim.body === undefined
        ? null
        : JSON.stringify(claim.body);
      return new Response(body, {
        status: claim.status,
        headers: { "Content-Type": "application/json", "Idempotency-Replayed": "true" },
      });
    }

    if (claim.kind === "in_progress") {
      return jsonResponse(
        {
          error: "request_in_progress",
          message: "A request with this Idempotency-Key is already being processed",
        },
        409
      );
    }

    // claim.kind === "own"
    try {
      const response = await handler(req, ctx);
      const snapshot = response.clone();
      const text = await snapshot.text();
      let body: unknown = null;
      if (text) {
        try {
          body = JSON.parse(text);
        } catch {
          // Non-JSON response body — store the raw text so replay still
          // returns something reasonable rather than throwing.
          body = text;
        }
      }
      await store.complete(scope, key, response.status, body, claim.token);
      return response;
    } catch (err) {
      await store.release(scope, key, claim.token);
      throw err;
    }
  };
}
