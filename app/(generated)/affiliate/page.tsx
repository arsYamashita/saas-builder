import { createAdminClient } from "@/lib/db/supabase/admin";
import { requireCurrentUser } from "@/lib/auth/current-user";

export default async function AffiliatePage() {
  const user = await requireCurrentUser();
  const supabase = createAdminClient();

  const { data: affiliate } = await supabase
    .from("affiliates")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  const { data: commissions } = affiliate
    ? await supabase
        .from("commissions")
        .select("*")
        .eq("affiliate_id", affiliate.id)
        .order("created_at", { ascending: false })
    : { data: [] as Record<string, unknown>[] };

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const affiliateUrl = affiliate ? `${baseUrl}/a/${affiliate.code}` : null;

  return (
    <main className="p-6 max-w-5xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Affiliate</h1>

      <section className="border rounded-xl p-4">
        <h2 className="font-semibold mb-3">Your Link</h2>

        {!affiliate ? (
          <p className="text-sm text-gray-500">
            affiliate レコードがまだありません。
          </p>
        ) : (
          <div className="space-y-2">
            <p className="text-sm">Code: {affiliate.code}</p>
            <p className="text-sm break-all">{affiliateUrl}</p>
          </div>
        )}
      </section>

      <section className="border rounded-xl p-4">
        <h2 className="font-semibold mb-3">Commissions</h2>

        <div className="space-y-3">
          {commissions?.length ? (
            commissions.map((commission: any) => (
              <div key={commission.id} className="border rounded-lg p-4">
                <p className="font-medium">
                  {commission.amount} {commission.currency}
                </p>
                <p className="text-sm text-gray-500">
                  status: {commission.status}
                </p>
              </div>
            ))
          ) : (
            <p className="text-sm text-gray-500">成果はまだありません。</p>
          )}
        </div>
      </section>
    </main>
  );
}
