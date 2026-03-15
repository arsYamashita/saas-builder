// ============================================================
// community_membership_saas v1 — Guard / Middleware Helpers
// ============================================================
// API route 内で使用する共通ガード。
// すべて service_role client を前提とし、RLS bypass で動作する。
// RLS は defense-in-depth としてのみ機能。
// ============================================================

import { createAdminClient } from "@/lib/db/supabase/admin";
import { createClient } from "@/lib/db/supabase/server";
import type { AppRole } from "../types/database";
import { ROLE_PRIORITY } from "../types/database";

// ─── Types ───

export type AuthUser = {
  id: string;
  email: string;
};

export type TenantMember = AuthUser & {
  tenantId: string;
  membershipId: string;
  role: AppRole;
};

export class GuardError extends Error {
  constructor(
    public statusCode: number,
    message: string
  ) {
    super(message);
    this.name = "GuardError";
  }
}

// ─── requireAuth ───
// Supabase auth session からユーザーを取得。未認証なら 401。

export async function requireAuth(): Promise<AuthUser> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new GuardError(401, "Unauthorized");
  }

  return { id: user.id, email: user.email ?? "" };
}

// ─── requireTenantMember ───
// tenant_id に対して active membership を持つか検証。なければ 403。

export async function requireTenantMember(
  userId: string,
  tenantId: string
): Promise<TenantMember> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("memberships")
    .select("id, role, status")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .eq("status", "active")
    .single();

  if (error || !data) {
    throw new GuardError(403, "Not a member of this tenant");
  }

  // user email は呼び出し元が持っているはずなので空文字で返す
  return {
    id: userId,
    email: "",
    tenantId,
    membershipId: data.id,
    role: data.role as AppRole,
  };
}

// ─── requireRole ───
// 指定 role 以上の権限を持つか検証。不足なら 403。

export async function requireRole(
  userId: string,
  tenantId: string,
  requiredRole: AppRole
): Promise<TenantMember> {
  const member = await requireTenantMember(userId, tenantId);

  if (ROLE_PRIORITY[member.role] < ROLE_PRIORITY[requiredRole]) {
    throw new GuardError(
      403,
      `Requires ${requiredRole} role or higher`
    );
  }

  return member;
}

// ─── assertTenantAccess ───
// resource の tenant_id が期待値と一致するか検証。
// cross-tenant アクセスを API 層で防止。

export function assertTenantAccess(
  resourceTenantId: string,
  expectedTenantId: string
): void {
  if (resourceTenantId !== expectedTenantId) {
    throw new GuardError(403, "Cross-tenant access denied");
  }
}

// ─── handleGuardError ───
// GuardError を Response に変換するユーティリティ。

export function handleGuardError(error: unknown): Response {
  if (error instanceof GuardError) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: error.statusCode,
      headers: { "Content-Type": "application/json" },
    });
  }

  const message =
    error instanceof Error ? error.message : "Internal server error";
  return new Response(JSON.stringify({ error: message }), {
    status: 500,
    headers: { "Content-Type": "application/json" },
  });
}
