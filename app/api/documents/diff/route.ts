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

export async function POST(request: NextRequest) {
  try {
    await requireCurrentUser();
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

    // LLM-powered diff
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
