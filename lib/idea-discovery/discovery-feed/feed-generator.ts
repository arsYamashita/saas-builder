/**
 * Feed Generator — Create discovery feed items from analyzed ideas
 *
 * Transforms analyzed ideas + template matches into feed items
 * ready for ranking and filtering.
 */

import type {
  AnalyzedIdea,
  DiscoveryFeedItem,
} from "../core/types";

// ── Feed Generation ─────────────────────────────────────

export function generateDiscoveryFeed(
  ideas: AnalyzedIdea[]
): DiscoveryFeedItem[] {
  const feedItems: DiscoveryFeedItem[] = [];

  for (let i = 0; i < ideas.length; i++) {
    const idea = ideas[i];

    const feedItem: DiscoveryFeedItem = {
      ideaId: idea.id,
      idea,
      templateMatch: idea.needsAnalysis?.suggestedNewTemplate
        ? {
            type: "gap_detected",
            templateKey: null,
            confidence: 0,
            reasons: ["No existing template matches this idea structure"],
            suggestedNewTemplate: idea.needsAnalysis.suggestedNewTemplate,
          }
        : idea.needsAnalysis?.matchedTemplateKey
          ? {
              type: "matched",
              templateKey: idea.needsAnalysis.matchedTemplateKey,
              confidence: idea.needsAnalysis.matchConfidence,
              reasons: [
                `Matched to ${idea.needsAnalysis.matchedTemplateKey}`,
              ],
              suggestedNewTemplate: null,
            }
          : {
              type: "no_match",
              templateKey: null,
              confidence: 0,
              reasons: ["No match found in template catalog"],
              suggestedNewTemplate: null,
            },
      rankingScore: 0, // Will be set by ranker
      rankingReason: "",
      urgencyScore: 50, // Base score
      domainAffinity: 50,
      createdAt: idea.normalizedAt,
    };

    feedItems.push(feedItem);
  }

  return feedItems;
}

// ── Feed Item Summary ────────────────────────────────────

export function summarizeFeedItem(item: DiscoveryFeedItem): string {
  const idea = item.idea;
  let summary = `[${idea.source.toUpperCase()}] ${idea.id}\n`;
  summary += `Ranking: ${item.rankingScore}/100\n`;

  if (item.templateMatch.type === "matched") {
    summary += `Template Match: ${item.templateMatch.templateKey}\n`;
  } else if (item.templateMatch.type === "gap_detected") {
    summary += `Template Match: GAP - New template needed\n`;
  } else {
    summary += `Template Match: None found\n`;
  }

  if (idea.needsAnalysis) {
    summary += `\nProblem: ${idea.needsAnalysis.problemStatement}\n`;
    summary += `Target Users: ${idea.needsAnalysis.targetUsers}\n`;
  }

  summary += `\nRanking Reason: ${item.rankingReason}\n`;

  return summary;
}

// ── Feed Statistics ─────────────────────────────────────

export function getFeedStatistics(items: DiscoveryFeedItem[]): {
  totalItems: number;
  byTemplateType: Record<string, number>;
  avgRankingScore: number;
  avgDomainAffinity: number;
  matched: number;
  gaps: number;
  unmatched: number;
} {
  const byTemplateType: Record<string, number> = {
    matched: 0,
    gap_detected: 0,
    no_match: 0,
  };

  let totalRanking = 0;
  let totalAffinity = 0;

  for (const item of items) {
    byTemplateType[item.templateMatch.type]++;
    totalRanking += item.rankingScore;
    totalAffinity += item.domainAffinity;
  }

  const count = items.length || 1;

  return {
    totalItems: items.length,
    byTemplateType,
    avgRankingScore: Math.round(totalRanking / count),
    avgDomainAffinity: Math.round(totalAffinity / count),
    matched: byTemplateType.matched || 0,
    gaps: byTemplateType.gap_detected || 0,
    unmatched: byTemplateType.no_match || 0,
  };
}
