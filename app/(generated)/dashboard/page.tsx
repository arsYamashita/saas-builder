import { requireCurrentUser } from "@/lib/auth/current-user";
import { getCurrentTenantForUser } from "@/lib/tenant/current-tenant";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { MetricCard } from "@/components/ui/metric-card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { Avatar } from "@/components/ui/avatar";
import {
  Users,
  CreditCard,
  Activity,
  Shield,
  Building2,
  Mail,
} from "lucide-react";

export default async function DashboardPage() {
  const user = await requireCurrentUser();
  const membership = await getCurrentTenantForUser();

  return (
    <div className="space-y-8 animate-fade-in">
      <PageHeader
        title="ダッシュボード"
        description="SaaSアプリケーションの概要"
      />

      {/* Metric Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="総ユーザー数"
          value="--"
          sublabel="データ取得中"
          icon={Users}
        />
        <MetricCard
          label="アクティブサブスクリプション"
          value="--"
          sublabel="データ取得中"
          icon={CreditCard}
        />
        <MetricCard
          label="月間売上"
          value="--"
          sublabel="データ取得中"
          icon={Activity}
        />
        <MetricCard
          label="コンバージョン率"
          value="--"
          sublabel="データ取得中"
          icon={Shield}
        />
      </div>

      {/* Current User & Tenant Info */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <Avatar
                name={
                  (user as any)?.display_name ||
                  (user as any)?.email ||
                  "ユーザー"
                }
              />
              <div>
                <CardTitle>現在のユーザー</CardTitle>
                <p className="text-xs text-muted-foreground">
                  アカウント情報
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {(user as any)?.display_name && (
                <div className="flex items-center gap-3">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">名前</p>
                    <p className="text-sm font-medium">
                      {(user as any).display_name}
                    </p>
                  </div>
                </div>
              )}
              {(user as any)?.email && (
                <div className="flex items-center gap-3">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">メール</p>
                    <p className="text-sm font-medium">
                      {(user as any).email}
                    </p>
                  </div>
                </div>
              )}
              {(user as any)?.id && (
                <div className="flex items-center gap-3">
                  <Shield className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">ユーザーID</p>
                    <p className="text-xs font-mono text-muted-foreground">
                      {(user as any).id}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10">
                <Building2 className="h-4 w-4 text-primary" />
              </div>
              <div>
                <CardTitle>現在のテナント</CardTitle>
                <p className="text-xs text-muted-foreground">
                  組織メンバーシップ
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {membership ? (
              <div className="space-y-3">
                {(membership as any)?.tenant_id && (
                  <div>
                    <p className="text-xs text-muted-foreground">テナントID</p>
                    <p className="text-xs font-mono text-muted-foreground">
                      {(membership as any).tenant_id}
                    </p>
                  </div>
                )}
                {(membership as any)?.role && (
                  <div className="flex items-center gap-2">
                    <p className="text-xs text-muted-foreground">ロール</p>
                    <Badge variant="default" className="capitalize">
                      {(membership as any).role}
                    </Badge>
                  </div>
                )}
                {(membership as any)?.status && (
                  <div className="flex items-center gap-2">
                    <p className="text-xs text-muted-foreground">ステータス</p>
                    <Badge
                      variant={
                        (membership as any).status === "active"
                          ? "success"
                          : "warning"
                      }
                      className="capitalize"
                    >
                      {(membership as any).status}
                    </Badge>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                テナントメンバーシップが見つかりません。
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
