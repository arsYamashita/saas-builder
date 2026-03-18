/**
 * Feed Ranker — Rank discovery feed items by priority
 *
 * Combines multiple signals: urgency, template match confidence,
 * domain affinity, and recency to produce ranking scores.
 */

import type { DiscoveryFeedItem } from "../core/types";

// ── Ranking Configuration ────────────────────────────────

export interface RankingConfig {
  urgencyWeight: number;
  templateMatchWeight: number;
  domainAffinityWeight: number;
  recencyWeight: number;
  focusedDomains?: string[];
}

const DEFAULT_RANKING_CONFIG: RankingConfig = {
  urgencyWeight: 0.25,
  templateMatchWeight: 0.25,
  domainAffinityWeight: 0.25,
  recencyWeight: 0.25,
};

// ── Ranking Function ────────────────────────────────────

export function rankFeedItems(
  items: DiscoveryFeedItem[],
  config: Partial<RankingConfig> = {}
): DiscoveryFeedItem[] {
  const finalConfig = { ...DEFAULT_RANKING_CONFIG, ...config };

  const scoredItems = items.map((item) => ({
    item: { ...item }, // Shallow copy to avoid mutation
    score: calculateItemScore(item, finalConfig),
  }));

  // Sort by score (highest first)
  scoredItems.sort((a, b) => b.score - a.score);

  // Assign ranking scores and reasons
  return scoredItems.map(({ item, score }, index) => ({
    ...item,
    rankingScore: score,
    rankingReason: generateRankingReason(item, score, index + 1),
  }));
}

// ── Score Calculation ────────────────────────────────────

function calculateItemScore(
  item: DiscoveryFeedItem,
  config: RankingConfig
): number {
  let score = 0;

  // Urgency component (0-100)
  const urgencyComponent = item.urgencyScore * config.urgencyWeight;
  score += urgencyComponent;

  // Template match component (0-100)
  const templateScore = calculateTemplateMatchScore(item);
  const templateComponent = templateScore * config.templateMatchWeight;
  score += templateComponent;

  // Domain affinity component (0-100)
  const domainComponent = item.domainAffinity * config.domainAffinityWeight;
  score += domainComponent;

  // Recency component (0-100)
  const recencyComponent = calculateRecencyScore(item.createdAt) *
    config.recencyWeight;
  score += recencyComponent;

  return Math.round(score);
}

// ── Template Match Scoring ──────────────────────────────

function calculateTemplateMatchScore(item: DiscoveryFeedItem): number {
  switch (item.templateMatch.type) {
    case "matched":
      return item.templateMatch.confidence; // Use confidence from match
    case "gap_detected":
      return 30; // Moderate score for gap detection (opportunity)
    case "no_match":
      return 10; // Low score for no match
  }
}

// ── Recency Scoring ─────────────────────────────────────

function calculateRecencyScore(createdAtIso: string): number {
  const createdAt = new Date(createdAtIso);
  const now = new Date();
  const ageMs = now.getTime() - createdAt.getTime();
  const ageHours = ageMs / (1000 * 60 * 60);
  const ageDays = ageHours / 24;

  // Linear decay: 100 at 0 days, 0 at 30 days
  if (ageDays <= 30) {
    return 100 - (ageDays / 30) * 100;
  }
  return 0;
}

// ── Ranking Reason Generation ────────────────────────────

function generateRankingReason(
  item: DiscoveryFeedItem,
  score: number,
  rank: number
): string {
  const reasons: string[] = [];

  if (item.urgencyScore >= 75) {
    reasons.push("high urgency");
  }

  if (item.templateMatch.type === "matched") {
    reasons.push(`${item.templateMatch.confidence}% template match`);
  } else if (item.templateMatch.type === "gap_detected") {
    reasons.push("template gap (new opportunity)");
  }

  if (item.domainAffinity >= 75) {
    reasons.push("strong domain fit");
  }

  return `#${rank}: ${reasons.join(", ")} (${score}/100)`;
}

// ── Ranking Report ──────────────────────────────────────

export function generateRankingReport(
  rankedItems: DiscoveryFeedItem[],
  topN: number = 5
): string {
  let report = `Top ${topN} Priority Ideas:\n\n`;

  for (let i = 0; i < Math.min(topN, rankedItems.length); i++) {
    const item = rankedItems[i];
    report += `${i + 1}. ${item.idea.id}\n`;
    report += `   Source: ${item.idea.source}\n`;
    report += `   Ranking: ${item.rankingScore}/100\n`;
    report += `   ${item.rankingReason}\n`;
    report += `\n`;
  }

  return report;
}

// ── Get priority buckets ────────────────────────────────

export function getPriorityBuckets(
  items: DiscoveryFeedItem[]
): {
  critical: DiscoveryFeedItem[];
  high: DiscoveryFeedItem[];
  medium: DiscoveryFeedItem[];
  low: DiscoveryFeedItem[];
} {
  const buckets = {
    critical: [] as DiscoveryFeedItem[],
    high: [] as DiscoveryFeedItem[],
    medium: [] as DiscoveryFeedItem[],
    low: [] as DiscoveryFeedItem[],
  };

  for (const item of items) {
    if (item.rankingScore >= 75) {
      buckets.critical.push(item);
    } else if (item.rankingScore >= 50) {
      buckets.high.push(item);
    } else if (item.rankingScore >= 25) {
      buckets.medium.push(item);
    } else {
      buckets.low.push(item);
    }
  }

  return buckets;
}
