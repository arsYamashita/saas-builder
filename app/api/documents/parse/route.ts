/**
 * POST /api/documents/parse
 *
 * Accepts a PDF (as base64 in JSON body or as multipart/form-data)
 * and returns structured text with sections and metadata.
 */

import { NextRequest, NextResponse } from "next/server";
import { parsePdf, parsePdfFromBase64 } from "@/lib/document-analysis/pdf-parser";
import { parseRequestSchema } from "@/lib/validation/document-analysis";

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") ?? "";

    let buffer: Buffer;
    let filename: string | undefined;

    if (contentType.includes("multipart/form-data")) {
      // File upload via FormData
      const formData = await request.formData();
      const file = formData.get("file");

      if (!file || !(file instanceof File)) {
        return NextResponse.json(
          { error: "No file provided. Send a PDF file as 'file' field." },
          { status: 400 }
        );
      }

      if (!file.type.includes("pdf") && !file.name.endsWith(".pdf")) {
        return NextResponse.json(
          { error: "Only PDF files are supported." },
          { status: 400 }
        );
      }

      const arrayBuffer = await file.arrayBuffer();
      buffer = Buffer.from(arrayBuffer);
      filename = file.name;
    } else {
      // JSON body with base64
      const body = await request.json();
      const parsed = parseRequestSchema.safeParse(body);

      if (!parsed.success) {
        return NextResponse.json(
          { error: "Invalid request", details: parsed.error.flatten() },
          { status: 400 }
        );
      }

      buffer = Buffer.from(parsed.data.base64, "base64");
      filename = parsed.data.filename;
    }

    // Size check (max 20MB)
    if (buffer.length > 20 * 1024 * 1024) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 20MB." },
        { status: 413 }
      );
    }

    const result = await parsePdf(buffer);

    return NextResponse.json({
      ...result,
      filename: filename ?? null,
    });
  } catch (err) {
    console.error("[documents/parse] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
