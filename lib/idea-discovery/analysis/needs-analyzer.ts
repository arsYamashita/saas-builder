/**
 * Needs Analyzer — Deep analysis using Claude
 *
 * Performs semantic analysis on normalized ideas to extract structured business needs.
 * Uses IdeaAnalyzerProvider interface for dependency injection.
 */

import type {
  NormalizedIdea,
  NeedsAnalysis,
  QuickFilterResult,
  DataSourceType,
  IdeaAnalyzerProvider,
} from "../core/types";

// ── Default Implementation (uses Claude) ──────────────────

export class ClaudeNeedsAnalyzer implements IdeaAnalyzerProvider {
  private apiKey: string;
  private model: string = "claude-3-5-sonnet-20241022";

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.ANTHROPIC_API_KEY || "";
    if (!this.apiKey) {
      throw new Error(
        "ANTHROPIC_API_KEY not set. Cannot initialize ClaudeNeedsAnalyzer."
      );
    }
  }

  async quickFilter(_rawText: string, _source: DataSourceType): Promise<QuickFilterResult> {
    throw new Error(
      "quickFilter not implemented in ClaudeNeedsAnalyzer. Use GeminiIdeaAnalyzer."
    );
  }

  async deepAnalysis(idea: NormalizedIdea): Promise<NeedsAnalysis> {
    try {
      return await this.callClaudeAPI(idea);
    } catch (error) {
      console.warn("Claude API failed:", error);
      return this.fallbackAnalysis(idea);
    }
  }

  private async callClaudeAPI(idea: NormalizedIdea): Promise<NeedsAnalysis> {
    const prompt = `Analyze this SaaS idea and extract the core business structure:

Title: ${idea.id}
Text: ${idea.rawText.substring(0, 500)}
Source: ${idea.source}

Extract and respond with this JSON:
{
  "problemStatement": "problem being solved",
  "targetUsers": "target user segment",
  "mainUseCases": ["use case 1", "use case 2"],
  "requiredFeatures": ["feature 1", "feature 2"],
  "coreEntities": ["entity 1", "entity 2"],
  "suggestedRoles": ["role 1", "role 2"],
  "billingModel": "subscription|one_time|hybrid|none",
  "affiliateEnabled": false,
  "matchedTemplateKey": null,
  "matchConfidence": 50,
  "gapIdentified": null,
  "suggestedNewTemplate": null,
  "assumptions": []
}`;

    const requestBody = {
      model: this.model,
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    };

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(requestBody),
    });

    if (!res.ok) {
      throw new Error(`Claude API error: ${res.status} ${res.statusText}`);
    }

    const data = (await res.json()) as any;
    const text = data.content?.[0]?.text || "{}";

    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : text);
      return {
        problemStatement: String(parsed.problemStatement) || "",
        targetUsers: String(parsed.targetUsers) || "",
        mainUseCases: Array.isArray(parsed.mainUseCases)
          ? parsed.mainUseCases
          : [],
        requiredFeatures: Array.isArray(parsed.requiredFeatures)
          ? parsed.requiredFeatures
          : [],
        coreEntities: Array.isArray(parsed.coreEntities)
          ? parsed.coreEntities
          : [],
        suggestedRoles: Array.isArray(parsed.suggestedRoles)
          ? parsed.suggestedRoles
          : [],
        billingModel: parsed.billingModel || "subscription",
        affiliateEnabled: Boolean(parsed.affiliateEnabled),
        matchedTemplateKey: parsed.matchedTemplateKey || null,
        matchConfidence: Number(parsed.matchConfidence) || 0,
        gapIdentified: parsed.gapIdentified || null,
        suggestedNewTemplate: parsed.suggestedNewTemplate || null,
        assumptions: Array.isArray(parsed.assumptions)
          ? parsed.assumptions
          : [],
      };
    } catch (e) {
      throw new Error(`Failed to parse Claude response: ${text}`);
    }
  }

  private fallbackAnalysis(idea: NormalizedIdea): NeedsAnalysis {
    return {
      problemStatement: idea.rawText.substring(0, 100),
      targetUsers: "unknown",
      mainUseCases: [],
      requiredFeatures: [],
      coreEntities: [],
      suggestedRoles: ["user"],
      billingModel: "subscription",
      affiliateEnabled: false,
      matchedTemplateKey: null,
      matchConfidence: 0,
      gapIdentified: null,
      suggestedNewTemplate: null,
      assumptions: [],
    };
  }
}

// ── Mock Implementation (for testing) ──────────────────────

export class MockNeedsAnalyzer implements IdeaAnalyzerProvider {
  async quickFilter(_rawText: string, _source: DataSourceType): Promise<QuickFilterResult> {
    throw new Error(
      "quickFilter not implemented in MockNeedsAnalyzer. Use MockIdeaAnalyzer."
    );
  }

  async deepAnalysis(idea: NormalizedIdea): Promise<NeedsAnalysis> {
    return {
      problemStatement: `Solve: ${idea.rawText.substring(0, 50)}`,
      targetUsers: "businesses",
      mainUseCases: ["primary use case"],
      requiredFeatures: ["core feature"],
      coreEntities: ["user", "project"],
      suggestedRoles: ["admin", "user"],
      billingModel: "subscription",
      affiliateEnabled: false,
      matchedTemplateKey: null,
      matchConfidence: 50,
      gapIdentified: null,
      suggestedNewTemplate: null,
      assumptions: [],
    };
  }
}
