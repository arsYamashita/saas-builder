/**
 * Urgency Scorer — Score idea priority based on engagement metrics
 *
 * Pure function. Considers author engagement (likes, comments, bookmarks).
 * Returns 0-100 score.
 */

import type { RawIdea } from "../core/types";

// ── Urgency Scoring ──────────────────────────────────────

export function scoreUrgency(idea: RawIdea): number {
  let score = 50; // Base score

  const engagement = idea.authorEngagement || {};

  // Engagement scoring (each metric normalized)
  const likeScore = Math.min((engagement.likes || 0) / 100, 1) * 15;
  const commentScore = Math.min((engagement.comments || 0) / 20, 1) * 25;
  const bookmarkScore = Math.min((engagement.bookmarks || 0) / 10, 1) * 20;
  const retweetScore = Math.min((engagement.retweets || 0) / 10, 1) * 15;
  const scoreScore = Math.min((engagement.score || 0) / 100, 1) * 25;

  // Comments are most valuable (indicate real discussion)
  // Bookmarks indicate intent to return
  // Custom scores from platform
  // Retweets/shares indicate endorsement
  // Likes are good but less valuable

  score = commentScore + bookmarkScore + scoreScore + retweetScore + likeScore;

  return Math.min(100, Math.max(0, Math.round(score)));
}

// ── Urgency Level Classification ────────────────────────

export function getUrgencyLevel(
  score: number
): "low" | "medium" | "high" | "critical" {
  if (score >= 75) return "critical";
  if (score >= 50) return "high";
  if (score >= 25) return "medium";
  return "low";
}

// ── Score Description ───────────────────────────────────

export function describeUrgencyScore(score: number): string {
  const level = getUrgencyLevel(score);

  switch (level) {
    case "critical":
      return `Critical priority (${score}/100) - Very high engagement`;
    case "high":
      return `High priority (${score}/100) - Strong engagement signals`;
    case "medium":
      return `Medium priority (${score}/100) - Moderate interest`;
    case "low":
      return `Low priority (${score}/100) - Limited engagement`;
  }
}

// ── Recency Adjustment ──────────────────────────────────

export function adjustForRecency(
  baseScore: number,
  extractedAtIso: string
): number {
  const extractedAt = new Date(extractedAtIso);
  const now = new Date();
  const ageMs = now.getTime() - extractedAt.getTime();
  const ageHours = ageMs / (1000 * 60 * 60);
  const ageDays = ageHours / 24;

  // Boost fresh ideas, decay older ones
  if (ageDays <= 1) {
    return Math.min(100, baseScore * 1.3); // 30% boost
  } else if (ageDays <= 7) {
    const decay = 1 - (ageDays - 1) * 0.04;
    return Math.round(baseScore * decay);
  } else if (ageDays <= 30) {
    const decay = Math.max(0.5, 1 - (ageDays - 7) * 0.02);
    return Math.round(baseScore * decay);
  } else {
    return Math.round(baseScore * 0.3); // Significant decay after 30 days
  }
}

// ── Feature Completeness Scoring ────────────────────────

export function scoreCompleteness(
  requiredFeaturesCount: number,
  implementedFeaturesCount: number
): number {
  if (requiredFeaturesCount === 0) {
    return 50; // Neutral if no features specified
  }

  const ratio = implementedFeaturesCount / requiredFeaturesCount;
  return Math.round(Math.min(100, ratio * 100));
}
