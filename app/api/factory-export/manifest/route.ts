/**
 * Factory Export Manifest API
 *
 * GET /api/factory-export/manifest
 *
 * Returns the list of supported export targets, formats, and filters.
 */

import { NextResponse } from "next/server";
import { buildExportManifest } from "@/lib/factory/external-export-layer";

export async function GET() {
  try {
    const manifest = buildExportManifest();
    return NextResponse.json(manifest);
  } catch (err) {
    console.error("[factory-export/manifest] Error:", err);
    return NextResponse.json(
      { error: "Failed to build export manifest" },
      { status: 500 },
    );
  }
}
