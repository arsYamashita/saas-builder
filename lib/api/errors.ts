import { NextResponse } from "next/server";
import { registerSink } from "@saas/secret-guard";

// Wired once, at module load, per packages/secret-guard's "enumerate every
// output route, then pin it with a wiring test" design. `serverErrorResponse`
// is the `log`-kind sink for this whole route surface (17 API routes under
// app/api/ funnel their error logging through it) — a downstream
// Stripe/Supabase/Gemini call can throw an error message with a secret
// embedded in it (see the gemini_api_key_url_query_masker_bypass regression
// this package's tests guard against), and that message used to reach
// `console.error` unmasked. See lib/api/__tests__/errors.test.ts and
// packages/secret-guard/README.md "Real integration".
const maskForLog = registerSink({
  kind: "log",
  name: "lib/api/errors.ts serverErrorResponse console.error",
});

/**
 * Parses a Request/NextRequest JSON body without throwing.
 *
 * Route handlers previously either let `req.json()` throw straight into a
 * generic catch-all (surfacing as an unrelated 500), or swallowed the
 * failure with `.catch(() => ({}))`, which silently turns an invalid body
 * into `{}` and lets validation downstream see `undefined` fields instead
 * of a clear error — see [[request_json_parse_silent_fallback]]. This
 * helper unifies both call sites on one behavior: invalid/empty JSON is
 * always a 400 "Invalid JSON body", never a silent `{}` or an unrelated 500.
 *
 * Usage:
 *   const parsed = await parseJsonBody(req);
 *   if (!parsed.ok) return parsed.response;
 *   const body = parsed.data; // typed as T
 *
 * `allowEmpty: true` treats a completely EMPTY body as `{}` (for endpoints
 * whose body is optional, e.g. promote's optional versionLabel) while still
 * rejecting a present-but-malformed body with 400 — exactly the distinction
 * `.catch(() => ({}))` erased.
 */
export async function parseJsonBody<T = unknown>(
  req: Request,
  opts?: { allowEmpty?: boolean }
): Promise<{ ok: true; data: T } | { ok: false; response: NextResponse }> {
  const invalid = () => ({
    ok: false as const,
    response: NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    ),
  });

  if (opts?.allowEmpty) {
    let text: string;
    try {
      text = await req.text();
    } catch {
      return invalid();
    }
    if (text.trim() === "") {
      return { ok: true, data: {} as T };
    }
    try {
      return { ok: true, data: JSON.parse(text) as T };
    } catch {
      return invalid();
    }
  }

  try {
    const data = (await req.json()) as T;
    return { ok: true, data };
  } catch {
    return invalid();
  }
}

/**
 * Extracts a loggable message from an arbitrary caught `cause`, for the
 * server-side-only log line in `serverErrorResponse`.
 *
 * Supabase/PostgREST errors (`{ message, code, details, hint }`) are plain
 * objects, never `instanceof Error` — found via the error-leak wiring
 * tests (docs/testing/error-leak-surfaces.md) feeding a realistic
 * PostgrestError-shaped object through `serverErrorResponse` and noticing
 * the server log collapsed to the useless "[object Object]" (via the naive
 * `String(cause)` fallback). That's every real Supabase failure in
 * production — the one case this log line exists for. This extracts
 * `.message` (plus `.code` when present) for object causes before falling
 * back to `String()`.
 */
function extractCauseMessage(cause: unknown): string {
  if (cause instanceof Error) return cause.message;
  if (cause !== undefined && cause !== null && typeof cause === "object") {
    const obj = cause as Record<string, unknown>;
    if (typeof obj.message === "string" && obj.message.length > 0) {
      const codeSuffix =
        typeof obj.code === "string" && obj.code ? ` (code=${obj.code})` : "";
      return `${obj.message}${codeSuffix}`;
    }
    try {
      return JSON.stringify(cause);
    } catch {
      return String(cause);
    }
  }
  if (cause !== undefined && cause !== null) return String(cause);
  return "unknown error";
}

/**
 * Builds a generic, safe-for-client error NextResponse while logging the
 * real cause (DB/provider error message, stack, etc.) server-side only,
 * tagged with a shared `errorId` the client can quote back in a support
 * request.
 *
 * Never forward a raw `error.message` from Supabase/Stripe/an internal
 * exception to the client `details`/`error` field — that leaks schema,
 * table, and constraint names. See [[api_error_message_internal_leak]].
 *
 * Usage (inside a route's catch block):
 *   return serverErrorResponse("billing/checkout", error);
 *   return serverErrorResponse("billing/checkout", error, { status: 400, message: "Plan not found" });
 */
export function serverErrorResponse(
  context: string,
  cause: unknown,
  opts?: { status?: number; message?: string }
): NextResponse {
  const errorId = crypto.randomUUID();
  const causeMessage = extractCauseMessage(cause);

  // eslint-disable-next-line no-console -- intentional server-side-only log
  console.error(`[${context}] errorId=${errorId}:`, maskForLog(causeMessage));

  return NextResponse.json(
    { error: opts?.message ?? "Internal server error", errorId },
    { status: opts?.status ?? 500 }
  );
}
