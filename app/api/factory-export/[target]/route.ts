/**
 * Factory Export API
 *
 * GET /api/factory-export/:target?format=json|csv&domain=...&category=...
 *
 * Supported targets: marketplace, releases, ranking, recommendations,
 *                    portfolio, scenarios, kpis
 *
 * Read-only. No state mutation.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  executeExport,
  type ExportTarget,
  type ExportFormat,
  type ExportFilters,
} from "@/lib/factory/external-export-layer";

const VALID_TARGETS: ExportTarget[] = [
  "marketplace", "releases", "ranking", "recommendations",
  "portfolio", "scenarios", "kpis",
];

const VALID_FORMATS: ExportFormat[] = ["json", "csv"];

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ target: string }> },
) {
  try {
    const { target: rawTarget } = await params;
    const target = rawTarget as ExportTarget;

    if (!VALID_TARGETS.includes(target)) {
      return NextResponse.json(
        { error: `Invalid target: ${rawTarget}. Valid targets: ${VALID_TARGETS.join(", ")}` },
        { status: 400 },
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const format = (searchParams.get("format") ?? "json") as ExportFormat;

    if (!VALID_FORMATS.includes(format)) {
      return NextResponse.json(
        { error: `Invalid format: ${format}. Valid formats: ${VALID_FORMATS.join(", ")}` },
        { status: 400 },
      );
    }

    const filters: ExportFilters = {};
    if (searchParams.has("domain")) filters.domain = searchParams.get("domain")!;
    if (searchParams.has("healthState")) filters.healthState = searchParams.get("healthState")!;
    if (searchParams.has("stage")) filters.stage = searchParams.get("stage")!;
    if (searchParams.has("recommendationType")) filters.recommendationType = searchParams.get("recommendationType")!;
    if (searchParams.has("category")) filters.category = searchParams.get("category")!;
    if (searchParams.has("type")) filters.scenarioType = searchParams.get("type")!;

    const result = executeExport({ target, format, filters });

    if (result.csv !== undefined) {
      return new NextResponse(result.csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${target}-export.csv"`,
        },
      });
    }

    return NextResponse.json(result.json);
  } catch (err) {
    console.error("[factory-export] Error:", err);
    return NextResponse.json(
      { error: "Failed to execute export" },
      { status: 500 },
    );
  }
}
