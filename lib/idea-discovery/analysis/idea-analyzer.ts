/**
 * Idea Analyzer — Quick filter using Gemini
 *
 * Quickly screens raw idea text to determine if it's a valid SaaS idea.
 * Uses IdeaAnalyzerProvider interface for dependency injection.
 */

import type {
  RawIdea,
  NormalizedIdea,
  NeedsAnalysis,
  QuickFilterResult,
  IdeaAnalyzerProvider,
  DataSourceType,
} from "../core/types";

// ── Japanese pain/want/gap patterns ──────────────────────

const JAPANESE_PATTERNS = {
  pain: ["困っている", "大変", "面倒", "不便", "課題", "悩み", "問題"],
  want: ["欲しい", "あれば", "できたら", "したい", "希望", "求めている"],
  gap: ["ツールがない", "見つからない", "存在しない", "ない", "不足"],
};

const ENGLISH_PATTERNS = {
  pain: [
    "struggling",
    "difficult",
    "hard to",
    "frustrating",
    "tedious",
    "problem",
    "issue",
    "pain point",
  ],
  want: [
    "would like",
    "should have",
    "could",
    "if only",
    "wish",
    "need",
    "require",
  ],
  gap: ["no tool", "not found", "doesn't exist", "missing", "lacking"],
};

// ── Detection helper ────────────────────────────────────

function detectPatterns(text: string): {
  hasPain: boolean;
  hasWant: boolean;
  hasGap: boolean;
} {
  const lowerText = text.toLowerCase();

  const hasPain =
    JAPANESE_PATTERNS.pain.some((p) => text.includes(p)) ||
    ENGLISH_PATTERNS.pain.some((p) => lowerText.includes(p));

  const hasWant =
    JAPANESE_PATTERNS.want.some((p) => text.includes(p)) ||
    ENGLISH_PATTERNS.want.some((p) => lowerText.includes(p));

  const hasGap =
    JAPANESE_PATTERNS.gap.some((p) => text.includes(p)) ||
    ENGLISH_PATTERNS.gap.some((p) => lowerText.includes(p));

  return { hasPain, hasWant, hasGap };
}

// ── Infer domain and urgency from text ────────────────

function inferDomainAndUrgency(
  text: string
): { domain: string; urgency: "low" | "medium" | "high" } {
  const lowerText = text.toLowerCase();

  const urgentTerms = [
    "urgent",
    "critical",
    "immediately",
    "必要",
    "緊急",
    "すぐ",
  ];
  const hasUrgent = urgentTerms.some((t) =>
    lowerText.includes(t.toLowerCase()) || text.includes(t)
  );

  const urgency = hasUrgent ? "high" : lowerText.length > 200 ? "medium" : "low";

  // Simple domain detection
  let domain = "general";
  const domainMap: Record<string, string> = {
    crm: "sales|customer|lead",
    ecommerce: "shop|store|product|checkout",
    saas: "software|application|tool|platform",
    support: "help|support|ticket|issue",
    analytics: "data|metric|report|dashboard",
  };

  for (const [key, pattern] of Object.entries(domainMap)) {
    if (new RegExp(pattern, "i").test(lowerText)) {
      domain = key;
      break;
    }
  }

  return { domain, urgency };
}

// ── Default Implementation (uses Gemini) ──────────────────

export class GeminiIdeaAnalyzer implements IdeaAnalyzerProvider {
  private apiKey: string;
  private model: string = "gemini-2.0-flash";

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.GEMINI_API_KEY || "";
    if (!this.apiKey) {
      throw new Error(
        "GEMINI_API_KEY not set. Cannot initialize GeminiIdeaAnalyzer."
      );
    }
  }

  async quickFilter(
    rawText: string,
    source: DataSourceType
  ): Promise<QuickFilterResult> {
    // First check local patterns
    const patterns = detectPatterns(rawText);
    const hasPatterns = patterns.hasPain || patterns.hasWant || patterns.hasGap;
    const { domain, urgency } = inferDomainAndUrgency(rawText);

    if (!hasPatterns) {
      return {
        viable: false,
        domain,
        targetUserType: "unknown",
        urgency,
        confidence: 95,
        reason: "No pain/want/gap patterns detected",
        quickTag: "rejected_no_signal",
      };
    }

    // Call Gemini for semantic validation
    try {
      const response = await this.callGeminiAPI(rawText, source);
      return response;
    } catch (error) {
      // Fallback: use pattern detection if API fails
      console.warn("Gemini API failed, falling back to pattern detection:", error);
      return {
        viable: hasPatterns,
        domain,
        targetUserType: patterns.hasPain ? "businesses" : "users",
        urgency,
        confidence: 60,
        reason: "Pattern-based detection (API failed)",
        quickTag: "pattern_matched",
      };
    }
  }

  async deepAnalysis(idea: NormalizedIdea): Promise<NeedsAnalysis> {
    throw new Error(
      "deepAnalysis not implemented in GeminiIdeaAnalyzer. Use ClaudeNeedsAnalyzer."
    );
  }

  private async callGeminiAPI(
    rawText: string,
    source: DataSourceType
  ): Promise<QuickFilterResult> {
    const prompt = `You are a SaaS idea validator. Analyze this idea from ${source} and determine if it's a valid SaaS business opportunity.

Idea text:
"${rawText.substring(0, 500)}"

Respond with JSON:
{
  "viable": boolean (true if valid SaaS idea),
  "domain": string (category: crm, ecommerce, saas, support, analytics, etc.),
  "targetUserType": string (e.g., "businesses", "students", "creators"),
  "urgency": "low" | "medium" | "high",
  "confidence": number (0-100),
  "reason": string (brief explanation),
  "quickTag": string (router tag)
}`;

    const requestBody = {
      contents: [
        {
          parts: [
            {
              text: prompt,
            },
          ],
        },
      ],
    };

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    if (!res.ok) {
      throw new Error(
        `Gemini API error: ${res.status} ${res.statusText}`
      );
    }

    const data = (await res.json()) as any;
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";

    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : text);
      return {
        viable: Boolean(parsed.viable),
        domain: String(parsed.domain) || "general",
        targetUserType: String(parsed.targetUserType) || "users",
        urgency: (parsed.urgency as "low" | "medium" | "high") || "medium",
        confidence: Number(parsed.confidence) || 50,
        reason: String(parsed.reason) || "",
        quickTag: String(parsed.quickTag) || "analyzed",
      };
    } catch (e) {
      throw new Error(`Failed to parse Gemini response: ${text}`);
    }
  }
}

// ── Mock Implementation (for testing) ──────────────────────

export class MockIdeaAnalyzer implements IdeaAnalyzerProvider {
  async quickFilter(
    rawText: string,
    source: DataSourceType
  ): Promise<QuickFilterResult> {
    const patterns = detectPatterns(rawText);
    const { domain, urgency } = inferDomainAndUrgency(rawText);

    return {
      viable: patterns.hasPain || patterns.hasWant || patterns.hasGap,
      domain,
      targetUserType: patterns.hasPain ? "businesses" : "users",
      urgency,
      confidence: 85,
      reason: "Mock analysis",
      quickTag: "mock",
    };
  }

  async deepAnalysis(idea: NormalizedIdea): Promise<NeedsAnalysis> {
    throw new Error(
      "deepAnalysis not implemented in MockIdeaAnalyzer. Use MockNeedsAnalyzer."
    );
  }
}
