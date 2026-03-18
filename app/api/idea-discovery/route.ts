/**
 * Idea Discovery API
 *
 * Endpoints:
 * - GET: list discovered ideas (with filters)
 * - POST: trigger discovery run
 */

import { NextRequest, NextResponse } from "next/server";
import { createSaaSBuilderDiscoveryEngine } from "@/lib/idea-discovery/integrations/saas-builder-factory";
import { SaaSBuilderStorageAdapter } from "@/lib/idea-discovery/integrations/saas-builder-storage-adapter";
import type { DataSourceType } from "@/lib/idea-discovery/core/types";

/**
 * GET /api/idea-discovery
 * List discovered ideas with optional filters
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const source = searchParams.get("source") as DataSourceType | null;
    const domain = searchParams.get("domain") as string | null;
    const limit = searchParams.get("limit")
      ? parseInt(searchParams.get("limit")!, 10)
      : 50;

    const storage = new SaaSBuilderStorageAdapter();

    // Load analyzed ideas
    const ideas = await storage.loadAnalyzedIdeas({
      source: source || undefined,
      domain: domain || undefined,
    });

    // Load feed items (ranked)
    const feedItems = await storage.loadFeedItems(limit);

    return NextResponse.json({
      success: true,
      ideas: ideas.slice(0, limit),
      feedItems,
      filters: {
        source: source || null,
        domain: domain || null,
        limit,
      },
      metadata: {
        totalIdeas: ideas.length,
        totalFeedItems: feedItems.length,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("[idea-discovery] GET error:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to list ideas",
      },
      { status: 500 },
    );
  }
}

/**
 * POST /api/idea-discovery
 * Trigger a new discovery run
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      maxIdeasPerRun,
      dedupThreshold,
      targetDomains,
    } = body;

    console.log("[idea-discovery] Starting discovery run...");

    // Create engine with provided options
    const engine = createSaaSBuilderDiscoveryEngine({
      maxIdeasPerRun: maxIdeasPerRun || 500,
      dedupThreshold: dedupThreshold || 0.75,
      targetDomains: targetDomains || undefined,
    });

    // Run discovery
    const report = await engine.run();

    return NextResponse.json({
      success: true,
      report,
      metadata: {
        startedAt: new Date().toISOString(),
        completedAt: report.generatedAt,
      },
    });
  } catch (error) {
    console.error("[idea-discovery] POST error:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to run discovery",
      },
      { status: 500 },
    );
  }
}
