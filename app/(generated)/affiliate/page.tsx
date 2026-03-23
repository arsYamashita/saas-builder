import { createAdminClient } from "@/lib/db/supabase/admin";
import { requireCurrentUser } from "@/lib/auth/current-user";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { MetricCard } from "@/components/ui/metric-card";
import {
  Link2,
  Copy,
  DollarSign,
  Users,
  TrendingUp,
  Receipt,
} from "lucide-react";

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

  const totalEarnings =
    commissions?.reduce(
      (sum: number, c: any) =>
        sum + (c.status === "paid" ? Number(c.amount) || 0 : 0),
      0
    ) ?? 0;

  const pendingEarnings =
    commissions?.reduce(
      (sum: number, c: any) =>
        sum + (c.status === "pending" ? Number(c.amount) || 0 : 0),
      0
    ) ?? 0;

  return (
    <div className="space-y-8 animate-fade-in">
      <PageHeader
        title="アフィリエイトプログラム"
        description="紹介リンクを共有してコミッションを獲得しましょう。"
      />

      {/* Affiliate Link */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <Link2 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle>紹介リンク</CardTitle>
              <CardDescription>
                このリンクを共有してコミッションを獲得できます。
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {!affiliate ? (
            <div className="rounded-lg border border-dashed bg-muted/30 p-6 text-center">
              <p className="text-sm text-muted-foreground">
                アフィリエイトアカウントが見つかりません。サポートにお問い合わせください。
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground">
                  コード:
                </span>
                <Badge variant="info" className="font-mono">
                  {affiliate.code}
                </Badge>
              </div>
              <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-4 py-3">
                <span className="flex-1 truncate text-sm font-mono text-muted-foreground">
                  {affiliateUrl}
                </span>
                <button
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
                  title="リンクをコピー"
                  onClick={() => {
                    if (affiliateUrl) navigator.clipboard.writeText(affiliateUrl);
                  }}
                >
                  <Copy className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Metrics */}
      {affiliate && (
        <div className="grid gap-4 sm:grid-cols-3">
          <MetricCard
            label="累計獲得額"
            value={`$${totalEarnings.toFixed(2)}`}
            icon={DollarSign}
          />
          <MetricCard
            label="保留中"
            value={`$${pendingEarnings.toFixed(2)}`}
            icon={TrendingUp}
          />
          <MetricCard
            label="総紹介数"
            value={commissions?.length ?? 0}
            icon={Users}
          />
        </div>
      )}

      {/* Commissions */}
      <div>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          コミッション
        </h2>
        {!commissions || commissions.length === 0 ? (
          <Card>
            <EmptyState
              icon={Receipt}
              title="コミッションはまだありません"
              description="紹介者が購入すると、ここにコミッションが表示されます。"
            />
          </Card>
        ) : (
          <div className="space-y-2">
            {commissions.map((commission: any) => (
              <Card key={commission.id}>
                <CardContent className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50">
                      <DollarSign className="h-4 w-4 text-emerald-600" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold">
                        {commission.amount} {commission.currency}
                      </p>
                      {commission.created_at && (
                        <p className="text-xs text-muted-foreground">
                          {new Date(commission.created_at).toLocaleDateString(
                            "ja-JP"
                          )}
                        </p>
                      )}
                    </div>
                  </div>
                  <Badge
                    variant={
                      commission.status === "paid"
                        ? "success"
                        : commission.status === "pending"
                          ? "warning"
                          : "secondary"
                    }
                    className="capitalize"
                  >
                    {commission.status}
                  </Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
