import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { getCurrentTenantForUser } from "@/lib/tenant/current-tenant";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { Avatar } from "@/components/ui/avatar";
import {
  Users,
  CreditCard,
  Shield,
  Building2,
  Mail,
  FileText,
  Settings,
  ArrowRight,
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

      {/* Quick Actions */}
      <div>
        <h2 className="mb-4 text-lg font-semibold text-foreground">
          クイックアクション
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              href: "/content",
              icon: FileText,
              title: "コンテンツを管理",
              description: "記事やコンテンツの作成・編集",
              color: "bg-blue-100 text-blue-600",
            },
            {
              href: "/plans",
              icon: Settings,
              title: "プランを設定",
              description: "料金プランの作成・変更",
              color: "bg-purple-100 text-purple-600",
            },
            {
              href: "/billing",
              icon: CreditCard,
              title: "課金を確認",
              description: "売上や決済状況の確認",
              color: "bg-emerald-100 text-emerald-600",
            },
            {
              href: "/users",
              icon: Users,
              title: "ユーザーを管理",
              description: "ユーザー一覧と権限の管理",
              color: "bg-amber-100 text-amber-600",
            },
          ].map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className="group block"
            >
              <Card className="h-full transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5">
                <CardContent className="flex items-start gap-4 p-5">
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${action.color}`}
                  >
                    <action.icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground group-hover:text-primary transition-colors">
                      {action.title}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {action.description}
                    </p>
                  </div>
                  <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-all group-hover:opacity-100 group-hover:translate-x-0.5" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
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
