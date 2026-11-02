import { createAdminClient } from "@/lib/db/supabase/admin";
import { getAuthSession } from "@/lib/auth/session";
import { runSignupFlow } from "@/lib/auth/signup-flow";

/**
 * 自分でテナントを作らせないプラン (招待制など) の有無を確認した結果、
 * 現在のコードには該当するプランが無い (tenants.plan_type は signup の
 * "starter" のみで、招待フローも未実装)。そのため、所属が見つからない
 * ユーザーは常に立て直しの対象にする。招待制を入れるときは、この定数を
 * プランの判定に置き換えること。
 */
const ALLOW_SELF_SERVE_TENANT_RECOVERY = true;

async function findActiveMembership(userId: string) {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("tenant_users")
    .select("tenant_id, role, status, tenants(*)")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("joined_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch tenant: ${error.message}`);
  }

  return data;
}

export async function getCurrentTenantForUser() {
  // 登録の途中で止まると users の行が無いことがある。requireCurrentUser は
  // users の行が無いと throw するので、本人確認は session で行う。
  const session = await getAuthSession();
  if (!session.user) {
    throw new Error("Unauthorized");
  }
  const sessionUser = session.user;

  const found = await findActiveMembership(sessionUser.id);
  if (found) {
    return found;
  }

  // 所属が無い = 登録の途中で止まった可能性がある。runSignupFlow と同じ復旧
  // (users の upsert と、冪等なテナント作成) を 1 回だけ行い、再度探す。
  // 復旧は ensure_signup_tenant (user_id 単位の lock と既存確認つき) を通るので、
  // 同時に何回呼ばれてもテナントは 1 つしかできない。再帰はしない。
  if (ALLOW_SELF_SERVE_TENANT_RECOVERY) {
    const displayName =
      sessionUser.displayName ||
      sessionUser.email.split("@")[0] ||
      "workspace";

    await runSignupFlow({
      userId: sessionUser.id,
      email: sessionUser.email,
      displayName,
      tenantName: displayName,
    });

    const recovered = await findActiveMembership(sessionUser.id);
    if (recovered) {
      return recovered;
    }
  }

  throw new Error("Active tenant membership not found");
}
