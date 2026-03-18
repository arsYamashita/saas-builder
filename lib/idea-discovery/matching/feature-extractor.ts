/**
 * Feature Extractor — Extract SaaS features from idea text
 *
 * Pure function. Identifies feature keys from text using keyword patterns
 * for both English and Japanese.
 */

export type FeatureKey =
  | "auth"
  | "billing"
  | "multi_tenant"
  | "rbac"
  | "affiliate"
  | "crud"
  | "dashboard"
  | "notifications"
  | "api"
  | "file_upload"
  | "search"
  | "analytics"
  | "chat"
  | "scheduling";

// ── Feature Keyword Mappings ────────────────────────────

const FEATURE_KEYWORDS: Record<FeatureKey, (string | RegExp)[]> = {
  auth: [
    "authentication",
    "login",
    "signin",
    "oauth",
    "sso",
    "password",
    "email verification",
    "認証",
    "ログイン",
    "パスワード",
  ],
  billing: [
    "payment",
    "billing",
    "subscription",
    "pricing",
    "invoice",
    "checkout",
    "stripe",
    "paypal",
    "課金",
    "支払い",
    "請求",
    "価格",
  ],
  multi_tenant: [
    "multi-tenant",
    "multitenant",
    "workspace",
    "tenant",
    "organization",
    "account",
    "マルチテナント",
    "ワークスペース",
    "組織",
  ],
  rbac: [
    "role",
    "permission",
    "access control",
    "rbac",
    "admin",
    "moderator",
    "ロール",
    "権限",
    "アクセス制御",
  ],
  affiliate: [
    "affiliate",
    "commission",
    "referral",
    "partner",
    "revenue share",
    "アフィリエイト",
    "コミッション",
    "紹介",
  ],
  crud: [
    "create",
    "read",
    "update",
    "delete",
    "data management",
    "database",
    "repository",
    "crud",
    "作成",
    "削除",
    "更新",
  ],
  dashboard: [
    "dashboard",
    "visualization",
    "chart",
    "graph",
    "metrics",
    "kpi",
    "ダッシュボード",
    "チャート",
    "グラフ",
  ],
  notifications: [
    "notification",
    "alert",
    "email",
    "sms",
    "push",
    "webhook",
    "reminder",
    "通知",
    "アラート",
  ],
  api: [
    "api",
    "rest",
    "graphql",
    "webhook",
    "integration",
    "endpoint",
    "third-party",
    "サードパーティ",
  ],
  file_upload: [
    "file upload",
    "attachment",
    "storage",
    "s3",
    "cloud storage",
    "media",
    "document",
    "ファイルアップロード",
    "ストレージ",
  ],
  search: [
    "search",
    "filter",
    "query",
    "elasticsearch",
    "full-text",
    "検索",
    "フィルター",
  ],
  analytics: [
    "analytics",
    "reporting",
    "metrics",
    "tracking",
    "event",
    "data warehouse",
    "分析",
    "レポート",
    "トラッキング",
  ],
  chat: [
    "chat",
    "messaging",
    "communication",
    "conversation",
    "slack",
    "real-time",
    "チャット",
    "メッセージング",
    "リアルタイム",
  ],
  scheduling: [
    "scheduling",
    "calendar",
    "booking",
    "appointment",
    "timetable",
    "cron",
    "スケジューリング",
    "カレンダー",
    "予約",
  ],
};

// ── Feature Extraction ──────────────────────────────────

export function extractFeatures(text: string): FeatureKey[] {
  const features = new Set<FeatureKey>();

  for (const [featureKey, keywords] of Object.entries(FEATURE_KEYWORDS)) {
    for (const keyword of keywords) {
      if (keyword instanceof RegExp) {
        if (keyword.test(text)) {
          features.add(featureKey as FeatureKey);
          break;
        }
      } else {
        // Case-insensitive search for English keywords
        const lowerText = text.toLowerCase();
        const lowerKeyword = keyword.toLowerCase();
        if (lowerText.includes(lowerKeyword) || text.includes(keyword)) {
          features.add(featureKey as FeatureKey);
          break;
        }
      }
    }
  }

  return Array.from(features);
}

// ── Feature Count by Type ────────────────────────────────

export function getFeatureCounts(text: string): Record<FeatureKey, number> {
  const counts: Record<FeatureKey, number> = {
    auth: 0,
    billing: 0,
    multi_tenant: 0,
    rbac: 0,
    affiliate: 0,
    crud: 0,
    dashboard: 0,
    notifications: 0,
    api: 0,
    file_upload: 0,
    search: 0,
    analytics: 0,
    chat: 0,
    scheduling: 0,
  };

  for (const [featureKey, keywords] of Object.entries(FEATURE_KEYWORDS)) {
    let count = 0;
    for (const keyword of keywords) {
      if (keyword instanceof RegExp) {
        const matches = text.match(keyword) || [];
        count += matches.length;
      } else {
        const lowerText = text.toLowerCase();
        const lowerKeyword = keyword.toLowerCase();
        const regex = new RegExp(lowerKeyword, "gi");
        const matches = lowerText.match(regex) || [];
        count += matches.length;
      }
    }
    counts[featureKey as FeatureKey] = count;
  }

  return counts;
}

// ── Check if text mentions a specific feature ────────────

export function hasFeature(text: string, featureKey: FeatureKey): boolean {
  const keywords = FEATURE_KEYWORDS[featureKey];

  for (const keyword of keywords) {
    if (keyword instanceof RegExp) {
      if (keyword.test(text)) {
        return true;
      }
    } else {
      const lowerText = text.toLowerCase();
      const lowerKeyword = keyword.toLowerCase();
      if (lowerText.includes(lowerKeyword) || text.includes(keyword)) {
        return true;
      }
    }
  }

  return false;
}

// ── List all known features ──────────────────────────────

export function getAllFeatures(): FeatureKey[] {
  return Object.keys(FEATURE_KEYWORDS) as FeatureKey[];
}
