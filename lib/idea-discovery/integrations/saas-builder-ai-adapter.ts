/**
 * SaaS Builder AI Adapter
 *
 * Implements IdeaAnalyzerProvider using SaaS Builder's provider system.
 * - Uses Gemini for quickFilter (fast, classification)
 * - Uses Claude for deepAnalysis (detailed structural analysis)
 */

import type {
  IdeaAnalyzerProvider,
  QuickFilterResult,
  NormalizedIdea,
  NeedsAnalysis,
  DataSourceType,
} from "../core/types";
import { GeminiIdeaAnalyzer } from "../analysis/idea-analyzer";
import { ClaudeNeedsAnalyzer } from "../analysis/needs-analyzer";

export class SaaSBuilderAiAdapter implements IdeaAnalyzerProvider {
  private geminiAnalyzer: GeminiIdeaAnalyzer;
  private claudeAnalyzer: ClaudeNeedsAnalyzer;

  constructor() {
    // Initialize both analyzers with API keys from environment
    this.geminiAnalyzer = new GeminiIdeaAnalyzer(
      process.env.GEMINI_API_KEY || "",
    );
    this.claudeAnalyzer = new ClaudeNeedsAnalyzer(
      process.env.ANTHROPIC_API_KEY || "",
    );
  }

  /**
   * Quick filter: fast, AI-assisted classification
   * Uses Gemini for quick turnaround.
   */
  async quickFilter(
    rawText: string,
    source: DataSourceType,
  ): Promise<QuickFilterResult> {
    try {
      return await this.geminiAnalyzer.quickFilter(rawText, source);
    } catch (error) {
      console.error("[SaaSBuilderAiAdapter] Gemini quickFilter failed:", error);
      // Fallback to conservative result
      return {
        viable: false,
        domain: "unknown",
        targetUserType: "unknown",
        urgency: "low",
        confidence: 0,
        reason: `Filter error: ${error instanceof Error ? error.message : "Unknown error"}`,
        quickTag: "error",
      };
    }
  }

  /**
   * Deep analysis: detailed structural assessment
   * Uses Claude for sophisticated analysis.
   */
  async deepAnalysis(idea: NormalizedIdea): Promise<NeedsAnalysis> {
    try {
      return await this.claudeAnalyzer.deepAnalysis(idea);
    } catch (error) {
      console.error("[SaaSBuilderAiAdapter] Claude deepAnalysis failed:", error);
      // Fallback to basic structure
      return {
        problemStatement: idea.quickFilter.reason,
        targetUsers: idea.quickFilter.targetUserType,
        mainUseCases: [],
        requiredFeatures: [],
        coreEntities: [],
        suggestedRoles: [],
        billingModel: "none",
        affiliateEnabled: false,
        matchedTemplateKey: null,
        matchConfidence: 0,
        gapIdentified: error instanceof Error ? error.message : "Analysis failed",
        suggestedNewTemplate: null,
        assumptions: [
          "Analysis could not be completed due to provider error",
        ],
      };
    }
  }

  /**
   * Check if both providers are available.
   */
  isAvailable(): boolean {
    const geminiKey = process.env.GEMINI_API_KEY;
    const claudeKey = process.env.ANTHROPIC_API_KEY;
    return !!(geminiKey && claudeKey);
  }
}

/**
 * Factory function for easy instantiation.
 */
export function createSaaSBuilderAiAdapter(): SaaSBuilderAiAdapter {
  return new SaaSBuilderAiAdapter();
}
