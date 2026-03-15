// ============================================================
// community_membership_saas v1 — Content Access Evaluation
// ============================================================
// コンテンツアクセス可否の判定ロジック。
// API route から呼び出す。service_role client を使用。
//
// 評価フロー:
//   1. status = published でなければ → editor 以上のみ
//   2. membership.status = suspended → アクセス不可
//   3. visibility_mode による分岐:
//      - public       → 誰でもアクセス可
//      - members_only → active member なら可
//      - rules_based  → content_access_rules の OR 評価
//        a) plan_based     → user の active subscription の plan_id が一致
//        b) purchase_based → user の completed purchase が存在
//        c) tag_based      → user の tag_id が一致
//      いずれか 1 つ満たせばアクセス可。
// ============================================================

import { createAdminClient } from "@/lib/db/supabase/admin";
import type { AppRole } from "../types/database";
import { ROLE_PRIORITY } from "../types/database";

export type AccessCheckResult = {
  allowed: boolean;
  reason: string;
};

// ─── checkContentAccess ───

export async function checkContentAccess(params: {
  contentId: string;
  tenantId: string;
  userId: string | null; // null = 未認証
  userRole: AppRole | null; // null = 非メンバー
  membershipStatus: string | null; // null = 非メンバー
}): Promise<AccessCheckResult> {
  const supabase = createAdminClient();

  // 1. コンテンツ取得
  const { data: content, error } = await supabase
    .from("contents")
    .select("id, tenant_id, status, visibility_mode")
    .eq("id", params.contentId)
    .eq("tenant_id", params.tenantId)
    .single();

  if (error || !content) {
    return { allowed: false, reason: "content_not_found" };
  }

  // 2. 未公開コンテンツ → editor 以上のみ
  if (content.status !== "published") {
    if (
      params.userRole &&
      ROLE_PRIORITY[params.userRole] >= ROLE_PRIORITY["editor"]
    ) {
      return { allowed: true, reason: "editor_preview" };
    }
    return { allowed: false, reason: "not_published" };
  }

  // 3. suspended メンバーはブロック
  if (params.membershipStatus === "suspended") {
    return { allowed: false, reason: "membership_suspended" };
  }

  // 4. visibility_mode 分岐
  const mode = content.visibility_mode;

  if (mode === "public") {
    return { allowed: true, reason: "public" };
  }

  // 以降は認証必須
  if (!params.userId) {
    return { allowed: false, reason: "authentication_required" };
  }

  // active member チェック (members_only, rules_based 共通)
  if (params.membershipStatus !== "active") {
    return { allowed: false, reason: "membership_required" };
  }

  if (mode === "members_only") {
    return { allowed: true, reason: "members_only" };
  }

  // 5. rules_based → OR 評価
  if (mode === "rules_based") {
    return evaluateRules(params.contentId, params.tenantId, params.userId);
  }

  return { allowed: false, reason: "unknown_visibility_mode" };
}

// ─── evaluateRules (private) ───

async function evaluateRules(
  contentId: string,
  tenantId: string,
  userId: string
): Promise<AccessCheckResult> {
  const supabase = createAdminClient();

  // ルール取得
  const { data: rules, error } = await supabase
    .from("content_access_rules")
    .select("rule_type, plan_id, tag_id")
    .eq("content_id", contentId)
    .eq("tenant_id", tenantId);

  if (error || !rules || rules.length === 0) {
    // ルールが 0 件 → rules_based なのにルール未設定 → アクセス不可
    return { allowed: false, reason: "no_rules_defined" };
  }

  // OR 評価: いずれか 1 つ満たせば OK
  for (const rule of rules) {
    if (rule.rule_type === "plan_based" && rule.plan_id) {
      const match = await checkPlanAccess(tenantId, userId, rule.plan_id);
      if (match) return { allowed: true, reason: "plan_based" };
    }

    if (rule.rule_type === "purchase_based") {
      const match = await checkPurchaseAccess(tenantId, userId, contentId);
      if (match) return { allowed: true, reason: "purchase_based" };
    }

    if (rule.rule_type === "tag_based" && rule.tag_id) {
      const match = await checkTagAccess(tenantId, userId, rule.tag_id);
      if (match) return { allowed: true, reason: "tag_based" };
    }
  }

  return { allowed: false, reason: "rules_not_satisfied" };
}

// ─── Sub-checks ───

async function checkPlanAccess(
  tenantId: string,
  userId: string,
  planId: string
): Promise<boolean> {
  const supabase = createAdminClient();

  const { data } = await supabase
    .from("subscriptions")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .eq("plan_id", planId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  return !!data;
}

async function checkPurchaseAccess(
  tenantId: string,
  userId: string,
  contentId: string
): Promise<boolean> {
  const supabase = createAdminClient();

  const { data } = await supabase
    .from("purchases")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .eq("content_id", contentId)
    .eq("status", "completed")
    .limit(1)
    .maybeSingle();

  return !!data;
}

async function checkTagAccess(
  tenantId: string,
  userId: string,
  tagId: string
): Promise<boolean> {
  const supabase = createAdminClient();

  const { data } = await supabase
    .from("user_tags")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .eq("tag_id", tagId)
    .limit(1)
    .maybeSingle();

  return !!data;
}
