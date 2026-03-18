/**
 * Idea Discovery Report API
 *
 * Endpoints:
 * - GET: get discovery report
 */

import { NextRequest, NextResponse } from "next/server";
import { SaaSBuilderStorageAdapter } from "@/lib/idea-discovery/integrations/saas-builder-storage-adapter";

/**
 * GET /api/idea-discovery/report
 * Get discovery report with statistics
 */
export async function GET(request: NextRequest) {
  try {
    const storage = new SaaSBuilderStorageAdapter();

    const feedItems = await storage.loadFeedItems();
    const ideas = await storage.loadAnalyzedIdeas();

    // Build report
    const report = {
      totalIdeas: ideas.length,
      totalFeedItems: feedItems.length,
      bySource: {} as Record<string, number>,
      byDomain: {} as Record<string, number>,
      templateMatches: {
        matched: 0,
        gap_detected: 0,
        no_match: 0,
      },
      urgencyDistribution: {
        high: 0,
        medium: 0,
        low: 0,
      },
      topIdeas: feedItems.slice(0, 10),
      topGaps: feedItems
        .filter((f) => f.templateMatch.type === "gap_detected")
        .slice(0, 5),
      statistics: {
        averageRankingScore:
          feedItems.length > 0
            ? Math.round(
                feedItems.reduce((sum, f) => sum + f.rankingScore, 0) /
                  feedItems.length,
              )
            : 0,
        averageConfidence:
          ideas.length > 0
            ? Math.round(
                ideas.reduce(
                  (sum, i) => sum + i.quickFilter.confidence,
                  0,
                ) / ideas.length,
              )
            : 0,
        matchConfidenceAverage:
          feedItems.length > 0
            ? Math.round(
                feedItems.reduce(
                  (sum, f) => sum + f.templateMatch.confidence,
                  0,
                ) / feedItems.length,
              )
            : 0,
      },
      generatedAt: new Date().toISOString(),
    };

    // Count by source
    for (const idea of ideas) {
      const source = idea.source;
      report.bySource[source] = (report.bySource[source] || 0) + 1;
    }

    // Count by domain
    for (const idea of ideas) {
      const domain = idea.quickFilter.domain;
      report.byDomain[domain] = (report.byDomain[domain] || 0) + 1;
    }

    // Count template matches
    for (const item of feedItems) {
      const type = item.templateMatch.type;
      if (type in report.templateMatches) {
        report.templateMatches[
          type as keyof typeof report.templateMatches
        ]++;
      }
    }

    // Count urgency
    for (const idea of ideas) {
      const urgency = idea.quickFilter.urgency;
      if (urgency in report.urgencyDistribution) {
        report.urgencyDistribution[
          urgency as keyof typeof report.urgencyDistribution
        ]++;
      }
    }

    return NextResponse.json({
      success: true,
      report,
    });
  } catch (error) {
    console.error("[idea-discovery] Report error:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to get report",
      },
      { status: 500 },
    );
  }
}
