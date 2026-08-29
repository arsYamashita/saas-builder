import type { IdempotencyStore } from "./types";
import { DEFAULT_TTL_MS } from "./core";
import { startHeartbeat } from "./heartbeat";

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
   * Derives the tenant/caller isolation scope for this request.
   * REQUIRED, deliberately with no default (Codex review gpt-5.6-sol,
   * 2026-08-30 P1: an earlier revision defaulted to a single fixed scope
   * when omitted, which silently accepted "forgot to scope this route"
   * as normal usage — the exact failure mode "Tenant isolation" in
   * README.md claims to prevent, since two different tenants sending the
   * same client-chosen `Idempotency-Key` value would then collide on the
   * same row and one could receive the other's replayed response). A
   * genuinely tenant-less route must say so explicitly:
   * `getScope: () => "system"` — an intentional, reviewable choice
   * instead of a silent fallback.
   */
  getScope: (req: Request, ctx: Ctx) => string | Promise<string>;
  /**
   * A static namespace for this route/operation (e.g. `"orders.create"`),
   * combined with `getScope`'s result and the request's `Idempotency-Key`
   * to form the stored row's identity. REQUIRED (Codex review gpt-5.6-sol,
   * 2026-08-30 P1): `scope` alone is not enough — a client can send the
   * same `Idempotency-Key` value to two DIFFERENT routes on the SAME
   * tenant (e.g. `/api/orders` and `/api/refunds` both wrapped in
   * `withRoute` with the same `getScope`), and without a namespace the
   * second route would receive the first route's replayed response
   * instead of running at all. Pick something stable and unique per
   * `withRoute` call site — a literal string is simplest and is what
   * this type requires.
   */
  namespace: string;
  /** Claim TTL — see `RunIdempotentOptions.ttlMs`. Default 5 minutes. */
  ttlMs?: number;
  /** How often the heartbeat renews the claim while `handler` runs.
   * Default: `ttlMs / 3`. */
  heartbeatIntervalMs?: number;
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

function jsonResponse(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** What gets persisted for replay: enough to reconstruct a response that
 * is byte-for-byte equivalent in status/content-type/body to the
 * original, not just "some JSON with the same status" (Codex review
 * gpt-5.6-sol, 2026-08-30 Medium: an earlier revision always
 * `JSON.parse`'d then `JSON.stringify`'d the body, silently turning a
 * plain-text `"hello"` response into `"\"hello\""` on replay, and always
 * forced `Content-Type: application/json` regardless of the original).
 * Other headers (Set-Cookie, Location, caching headers, ...) are still
 * NOT replayed — documented limitation, not silently dropped: replaying
 * arbitrary headers correctly (multi-value Set-Cookie in particular) is
 * out of scope for this package; a route that needs specific headers
 * preserved on replay should not rely on `withRoute` alone for them. */
interface StoredResponse {
  bodyText: string;
  contentType: string | null;
}

/**
 * Combines `callerScope` and `namespace` into one stored `scope` value
 * unambiguously (Codex review gpt-5.6-sol, 2026-08-30 round 2 Medium): a
 * plain `` `${callerScope}:${namespace}` `` template can collide —
 * `callerScope="a:b", namespace="c"` and `callerScope="a", namespace="b:c"`
 * both produce `"a:b:c"` — if either value happens to contain the `:`
 * separator (a tenant slug is not guaranteed not to). Length-prefixing
 * `callerScope` (a netstring-style encoding) fixes the boundary
 * unambiguously regardless of either value's content: the prefix says
 * exactly how many characters belong to `callerScope`, so `namespace`
 * can never be misread as extending it (or vice versa).
 */
function encodeScopeNamespace(callerScope: string, namespace: string): string {
  return `${callerScope.length}:${callerScope}:${namespace}`;
}

/**
 * Wraps a Next.js App Router Route Handler with Idempotency-Key semantics:
 *
 *   - Missing key: 400 (unless `required: false`).
 *   - New key: runs `handler`, stores its response, returns it unchanged.
 *   - Same key, prior run completed: replays the STORED response
 *     (identical status + body + content-type) WITHOUT re-running
 *     `handler` — the "同一キー同一レスポンス" requirement.
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
  const heartbeatIntervalMs = opts.heartbeatIntervalMs ?? Math.max(1, Math.floor(ttlMs / 3));
  const { store, namespace } = opts;

  if (!namespace || !namespace.trim()) {
    throw new Error("withRoute requires a non-empty `namespace`");
  }

  function claimLostResponse(): Response {
    // Handler DID already run (its side effects, and possibly its
    // response, may already be visible to the world) but this package
    // can no longer promise a retry will replay it instead of running
    // `handler` again. Surface that distinctly rather than silently
    // returning as if everything is now safely recorded — see
    // IdempotencyClaimLostError's rationale in core.ts (mirrored here
    // since withRoute doesn't go through withIdempotency directly).
    return jsonResponse(
      {
        error: "idempotency_claim_lost",
        message:
          "The request completed, but its result could not be durably recorded for replay " +
          "(the idempotency claim was lost while processing). Do not blindly retry.",
      },
      500
    );
  }

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

    // scope + namespace are two independent dimensions, both required:
    // scope isolates tenants from each other, namespace isolates routes
    // from each other WITHIN a tenant (see WithRouteOptions doc on both).
    const callerScope = await opts.getScope(req, ctx);
    const scope = encodeScopeNamespace(callerScope, namespace);

    const claim = await store.claim(scope, key, ttlMs);

    if (claim.kind === "completed") {
      const stored = claim.body as StoredResponse;
      return new Response(stored.bodyText, {
        status: claim.status,
        headers: {
          "Content-Type": stored.contentType ?? "application/json",
          "Idempotency-Replayed": "true",
        },
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
    const { token } = claim;

    // Heartbeat: renew the claim's TTL for as long as `handler` is
    // running (mirrors withIdempotency/withLock — see [[redis_nx_lock_ttl_too_short]]).
    // An earlier revision had no heartbeat at all here, so a `handler`
    // that ran longer than `ttlMs` could have its claim reclaimed by a
    // concurrent retry mid-flight with nothing detecting it (Codex review
    // gpt-5.6-sol, 2026-08-30 round 2 High).
    let claimLost = false;
    const heartbeat = startHeartbeat(heartbeatIntervalMs, async () => {
      const stillOwned = await store.extend(scope, key, token, ttlMs);
      if (!stillOwned) claimLost = true;
    });

    let response: Response;
    try {
      response = await handler(req, ctx);
    } catch (err) {
      // `handler` itself failed — nothing it did needs protecting from a
      // retry, so release (token-guarded — a no-op if we'd already lost
      // the claim) so a genuine retry isn't stuck behind a dead claim
      // until TTL expiry.
      await heartbeat.stop();
      await store.release(scope, key, token);
      throw err;
    }
    await heartbeat.stop();

    // `handler` SUCCEEDED. Everything from here on must NEVER release the
    // claim (Codex review gpt-5.6-sol, 2026-08-30 round 2 High: an
    // earlier revision wrapped this whole block in the same try/catch as
    // `handler` itself, so a failure snapshotting the response or in
    // `store.complete()` — after `handler` had already run — incorrectly
    // released the claim and let a retry re-run `handler`, doubling
    // whatever it just did). A failure here can only ever be reported as
    // "claim lost", never as "safe to retry from scratch".
    let stored: StoredResponse;
    try {
      const snapshot = response.clone();
      stored = { bodyText: await snapshot.text(), contentType: response.headers.get("Content-Type") };
    } catch {
      return claimLostResponse();
    }

    if (claimLost) {
      return claimLostResponse();
    }

    let applied: boolean;
    try {
      applied = await store.complete(scope, key, response.status, stored, token);
    } catch {
      return claimLostResponse();
    }
    if (!applied) {
      return claimLostResponse();
    }
    return response;
  };
}
