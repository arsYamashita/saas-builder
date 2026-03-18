/**
 * Idea Discovery Engine - Constants & Defaults
 *
 * Default keywords, rate limits, and domain configuration for Japan SaaS market.
 */

import type { DataSourceConfig, DataSourceType } from "./types";

// ── Default Keywords (Japan SaaS Market) ────────────────────────────────

/**
 * Japanese keywords targeting common SaaS pain points and domains.
 * Tuned for Japanese market early-stage idea discovery.
 */
export const DEFAULT_JA_KEYWORDS = [
  // Problem-focused
  "困っている",
  "改善したい",
  "効率化",
  "自動化",
  "できない",
  "面倒",

  // Domain-focused (SaaS-relevant)
  "プロジェクト管理",
  "顧客管理",
  "営業管理",
  "マーケティング自動化",
  "チームコラボレーション",
  "在庫管理",
  "人事管理",
  "会計管理",
  "請求書",
  "契約管理",

  // Behavioral
  "スタートアップ",
  "起業",
  "事業拡大",
  "ビジネス",
  "フリーランス",
  "副業",

  // Tech-focused
  "API",
  "SaaS",
  "クラウド",
  "Web アプリ",
  "モバイル アプリ",

  // Market signals
  "市場",
  "需要",
  "トレンド",
  "競争",
];

export const DEFAULT_EN_KEYWORDS = [
  // Problem-focused
  "struggling",
  "pain point",
  "need solution",
  "automate",
  "improve workflow",
  "time consuming",

  // Domain-focused
  "project management",
  "CRM",
  "marketing automation",
  "team collaboration",
  "inventory",
  "HR",
  "accounting",
  "invoicing",

  // Behavioral
  "startup",
  "founder",
  "entrepreneur",
  "scaling",
  "business",
  "freelance",

  // Market signals
  "market opportunity",
  "demand",
  "trend",
  "competition",
];

// ── Default Target Domains (Japan SaaS) ────────────────────────────────

/**
 * Target domains for idea relevance classification.
 */
export const DEFAULT_TARGET_DOMAINS = [
  "project_management",
  "crm",
  "accounting",
  "hr",
  "marketing",
  "collaboration",
  "analytics",
  "e_commerce",
  "logistics",
  "healthcare",
  "education",
  "sales",
];

// ── Rate Limit Defaults ─────────────────────────────────────────────────

/**
 * Conservative rate limits for public APIs.
 * Tune based on actual API tier and quota.
 */
export const DEFAULT_RATE_LIMITS = {
  twitter: 15, // requests per minute
  reddit: 30,
  qiita: 60,
  hatena: 30,
  note: 20,
  yahoo_chiebukuro: 10,
} as const;

// ── Default Data Source Configs ────────────────────────────────────────

/**
 * Out-of-the-box data source configurations.
 * Consumers can override these with their own settings.
 */
export const DEFAULT_DATA_SOURCE_CONFIGS: Record<DataSourceType, Omit<DataSourceConfig, "apiKey">> = {
  twitter: {
    type: "twitter",
    enabled: true,
    baseUrl: "https://api.twitter.com/2",
    rateLimit: { requestsPerMinute: DEFAULT_RATE_LIMITS.twitter },
    keywords: DEFAULT_EN_KEYWORDS,
    maxResultsPerRun: 100,
  },

  reddit: {
    type: "reddit",
    enabled: true,
    baseUrl: "https://www.reddit.com",
    rateLimit: { requestsPerMinute: DEFAULT_RATE_LIMITS.reddit },
    keywords: [
      // Subreddit keywords (will be converted to subreddit searches)
      "SaaS",
      "startups",
      "japandev",
      "entrepreneur",
      "business",
    ],
    maxResultsPerRun: 100,
  },

  qiita: {
    type: "qiita",
    enabled: true,
    baseUrl: "https://qiita.com/api/v2",
    rateLimit: { requestsPerMinute: DEFAULT_RATE_LIMITS.qiita },
    keywords: DEFAULT_JA_KEYWORDS,
    maxResultsPerRun: 100,
  },

  hatena: {
    type: "hatena",
    enabled: true,
    baseUrl: "https://b.hatena.ne.jp",
    rateLimit: { requestsPerMinute: DEFAULT_RATE_LIMITS.hatena },
    keywords: DEFAULT_JA_KEYWORDS,
    maxResultsPerRun: 100,
  },

  note: {
    type: "note",
    enabled: true,
    baseUrl: "https://note.com",
    rateLimit: { requestsPerMinute: DEFAULT_RATE_LIMITS.note },
    keywords: DEFAULT_JA_KEYWORDS,
    maxResultsPerRun: 50,
  },

  yahoo_chiebukuro: {
    type: "yahoo_chiebukuro",
    enabled: true,
    baseUrl: "https://chiebukuro.yahoo.co.jp",
    rateLimit: { requestsPerMinute: DEFAULT_RATE_LIMITS.yahoo_chiebukuro },
    keywords: DEFAULT_JA_KEYWORDS,
    maxResultsPerRun: 50,
  },
};

// ── Confidence Thresholds ───────────────────────────────────────────────

/**
 * Confidence thresholds for filtering decisions.
 */
export const CONFIDENCE_THRESHOLDS = {
  /** Quick filter must exceed this to be viable */
  quickFilterMinimum: 60,

  /** Analysis must exceed this for template matching */
  analysisMinimum: 50,

  /** Match must exceed this to be considered viable match */
  templateMatchMinimum: 70,
};

// ── Ranking Weights ────────────────────────────────────────────────────

/**
 * Weights for discovery feed ranking algorithm.
 * Score = urgency * urgencyWeight + confidence * confidenceWeight + ...
 */
export const RANKING_WEIGHTS = {
  urgency: 0.3, // How pressing the problem is
  confidence: 0.25, // Confidence in analysis
  engagement: 0.2, // Source engagement (likes, comments)
  recency: 0.15, // How recent the idea is
  templateMatch: 0.1, // Match to existing template
};

// ── Error Messages ──────────────────────────────────────────────────────

export const ERROR_MESSAGES = {
  NO_VIABLE_IDEAS: "No viable ideas found after filtering",
  ANALYSIS_TIMEOUT: "Idea analysis timed out",
  STORAGE_ERROR: "Failed to persist ideas to storage",
  PROVIDER_ERROR: "AI provider error during analysis",
  RATE_LIMIT_EXCEEDED: "Rate limit exceeded for data source",
  INVALID_CONFIG: "Invalid data source configuration",
};
