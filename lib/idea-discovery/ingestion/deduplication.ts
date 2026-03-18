/**
 * Deduplication
 *
 * Cross-source deduplication using text similarity.
 * Identifies and merges duplicate ideas from multiple sources.
 */

import type { RawIdea, NormalizedIdea } from "../core/types";

/**
 * Jaccard similarity between two sets.
 * Returns 0-1, where 1 is identical.
 */
function jaccardSimilarity(set1: Set<string>, set2: Set<string>): number {
  const intersection = new Set(Array.from(set1).filter((x) => set2.has(x)));
  const union = new Set([...Array.from(set1), ...Array.from(set2)]);

  if (union.size === 0) return 0;
  return intersection.size / union.size;
}

/**
 * Tokenize text into words for comparison.
 */
function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\w\s]/g, "") // Remove punctuation
      .split(/\s+/)
      .filter((word) => word.length > 2), // Skip very short words
  );
}

/**
 * Levenshtein distance (edit distance) between two strings.
 * Lower is more similar.
 */
function levenshteinDistance(s1: string, s2: string): number {
  const len1 = s1.length;
  const len2 = s2.length;
  const matrix: number[][] = Array.from({ length: len1 + 1 }, (_, i) =>
    Array.from({ length: len2 + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1, // deletion
        matrix[i][j - 1] + 1, // insertion
        matrix[i - 1][j - 1] + cost, // substitution
      );
    }
  }

  return matrix[len1][len2];
}

/**
 * Normalized edit distance (0-1, where 1 is identical).
 */
function normalizedEditDistance(s1: string, s2: string): number {
  const maxLen = Math.max(s1.length, s2.length);
  if (maxLen === 0) return 1;
  return 1 - levenshteinDistance(s1, s2) / maxLen;
}

/**
 * Composite similarity score combining multiple metrics.
 */
function compositeSimilarity(idea1: RawIdea | NormalizedIdea, idea2: RawIdea | NormalizedIdea): number {
  // Already same source and ID = definitely duplicate
  if (idea1.source === idea2.source && idea1.sourceId === idea2.sourceId) {
    return 1;
  }

  // Text-based similarity
  const tokens1 = tokenize(idea1.rawText);
  const tokens2 = tokenize(idea2.rawText);
  const jaccardScore = jaccardSimilarity(tokens1, tokens2);

  // Edit distance on first 200 chars (for speed)
  const shortText1 = idea1.rawText.substring(0, 200);
  const shortText2 = idea2.rawText.substring(0, 200);
  const editScore = normalizedEditDistance(shortText1, shortText2);

  // Weighted average
  return jaccardScore * 0.6 + editScore * 0.4;
}

/**
 * Deduplicate raw ideas.
 * Returns deduplicated list and mapping of duplicates.
 */
export function deduplicateRawIdeas(ideas: RawIdea[], threshold: number = 0.75): {
  deduplicated: RawIdea[];
  duplicateMap: Map<string, string>; // originalId -> keepId
} {
  const deduplicated: RawIdea[] = [];
  const duplicateMap = new Map<string, string>();
  const processed = new Set<string>();

  for (const idea of ideas) {
    if (processed.has(idea.id)) continue;

    let keeper = idea;

    // Check against all subsequent ideas
    for (const other of ideas) {
      if (other.id === idea.id || processed.has(other.id)) continue;

      const similarity = compositeSimilarity(keeper, other);

      if (similarity >= threshold) {
        // Merge: keep the one with better engagement
        const keeperScore = keeper.authorEngagement.score || keeper.authorEngagement.likes || 0;
        const otherScore = other.authorEngagement.score || other.authorEngagement.likes || 0;

        if (otherScore > keeperScore) {
          duplicateMap.set(keeper.id, other.id);
          keeper = other;
        } else {
          duplicateMap.set(other.id, keeper.id);
        }

        processed.add(other.id);
      }
    }

    deduplicated.push(keeper);
    processed.add(idea.id);
  }

  return { deduplicated, duplicateMap };
}

/**
 * Deduplicate normalized ideas with better context.
 */
export function deduplicateNormalizedIdeas(
  ideas: NormalizedIdea[],
  threshold: number = 0.75,
): {
  deduplicated: NormalizedIdea[];
  duplicateMap: Map<string, string>;
  mergeSummary: Array<{ kept: string; removed: string[]; reason: string }>;
} {
  const deduplicated: NormalizedIdea[] = [];
  const duplicateMap = new Map<string, string>();
  const mergeSummary: Array<{ kept: string; removed: string[]; reason: string }> = [];
  const processed = new Set<string>();

  for (const idea of ideas) {
    if (processed.has(idea.id)) continue;

    let keeper = idea;
    const merged: string[] = [];

    // Check against all subsequent ideas
    for (const other of ideas) {
      if (other.id === idea.id || processed.has(other.id)) continue;

      // Use quick filter domain as additional context
      const sameDomain =
        keeper.quickFilter.domain === other.quickFilter.domain ||
        keeper.quickFilter.domain === "" ||
        other.quickFilter.domain === "";

      // If different domain, only merge if text is nearly identical
      const domainWeightedThreshold = sameDomain ? threshold : threshold + 0.15;
      const similarity = compositeSimilarity(keeper, other);

      if (similarity >= domainWeightedThreshold) {
        // Merge: keep the one with better engagement + higher confidence
        const keeperScore = (keeper.authorEngagement.score || 0) + keeper.quickFilter.confidence;
        const otherScore = (other.authorEngagement.score || 0) + other.quickFilter.confidence;

        if (otherScore > keeperScore) {
          duplicateMap.set(keeper.id, other.id);
          merged.push(keeper.id);
          keeper = other;
        } else {
          duplicateMap.set(other.id, keeper.id);
          merged.push(other.id);
        }

        processed.add(other.id);
      }
    }

    if (merged.length > 0) {
      mergeSummary.push({
        kept: keeper.id,
        removed: merged,
        reason: `Merged ${merged.length} duplicates (similarity: ${compositeSimilarity(ideas.find((i) => i.id === merged[0])!, keeper).toFixed(2)})`,
      });
    }

    deduplicated.push(keeper);
    processed.add(idea.id);
  }

  return { deduplicated, duplicateMap, mergeSummary };
}

/**
 * Find similar ideas (not necessarily duplicates).
 * Returns all pairs with similarity >= threshold.
 */
export function findSimilarIdeas(
  ideas: RawIdea[] | NormalizedIdea[],
  threshold: number = 0.6,
): Array<{
  idea1Id: string;
  idea2Id: string;
  similarity: number;
}> {
  const similar: Array<{
    idea1Id: string;
    idea2Id: string;
    similarity: number;
  }> = [];

  for (let i = 0; i < ideas.length; i++) {
    for (let j = i + 1; j < ideas.length; j++) {
      const similarity = compositeSimilarity(ideas[i], ideas[j]);
      if (similarity >= threshold) {
        similar.push({
          idea1Id: ideas[i].id,
          idea2Id: ideas[j].id,
          similarity,
        });
      }
    }
  }

  // Sort by descending similarity
  similar.sort((a, b) => b.similarity - a.similarity);

  return similar;
}

/**
 * Check if two ideas are likely duplicates (convenience function).
 */
export function areDuplicates(
  idea1: RawIdea | NormalizedIdea,
  idea2: RawIdea | NormalizedIdea,
  threshold: number = 0.75,
): boolean {
  return compositeSimilarity(idea1, idea2) >= threshold;
}
