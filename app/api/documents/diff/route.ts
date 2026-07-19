/**
 * POST /api/documents/diff
 *
 * Compares two document texts and returns structured diff analysis.
 * Supports both LLM-powered (Claude) and local-only diff modes.
 */

import { NextRequest, NextResponse } from "next/server";
import { compareDocuments, compareDocumentsLocal } from "@/lib/document-analysis/document-diff";
import { diffRequestSchema } from "@/lib/validation/document-analysis";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { parseJsonBody, serverErrorResponse } from "@/lib/api/errors";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  try {
    const user = await requireCurrentUser();
    const parsedBody = await parseJsonBody(request);
    if (!parsedBody.ok) return parsedBody.response;
    const parsed = diffRequestSchema.safeParse(parsedBody.data);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { oldText, newText, oldLabel, newLabel, domain, language, localOnly } = parsed.data;

    // Local-only mode: fast, no LLM call
    if (localOnly) {
      const result = compareDocumentsLocal(oldText, newText);
      return NextResponse.json(result);
    }

    // LLM-powered diff calls Claude directly (compareDocuments() ->
    // fetch("https://api.anthropic.com/v1/messages")) with no cost
    // governance until now — a single authenticated user could otherwise
    // drive unbounded API cost. Rate limit BEFORE the LLM call, using the
    // same shared `generate` bucket + per-user key as the sibling
    // generate-* pipeline step routes (lib/rate-limit.ts). Only gated on
    // this branch — the localOnly path above never reaches Claude, so it
    // does no paid work and must not be throttled by this budget.
    // See [[saas_builder_ai_endpoint_no_rate_limit]], SECURITY_CHECKLIST.md
    // item 3.
    const allowed = await rateLimit(`generate:${user.id}`, 5, 60_000);
    if (!allowed) {
      return NextResponse.json(
        { error: "生成リクエストが多すぎます。しばらく待ってから再試行してください。" },
        { status: 429 }
      );
    }

    if (!process.env.CLAUDE_API_KEY) {
      return NextResponse.json(
        { error: "CLAUDE_API_KEY is not configured. Use localOnly=true for local diff." },
        { status: 503 }
      );
    }

    const result = await compareDocuments({
      oldText,
      newText,
      oldLabel,
      newLabel,
      domain,
      language,
    });

    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    // Generic message only — the raw error may contain internal details.
    // See [[api_error_message_internal_leak]].
    return serverErrorResponse("documents/diff", err);
  }
}
