export const dynamic = "force-dynamic";

import { createAdminClient } from "@/lib/db/supabase/admin";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Avatar } from "@/components/ui/avatar";
import { Users as UsersIcon } from "lucide-react";

export default async function UsersPage() {
  const supabase = createAdminClient();

  const { data: tenantUsers, error } = await supabase
    .from("tenant_users")
    .select(`
      id,
      role,
      status,
      joined_at,
      users ( id, email, display_name )
    `)
    .order("joined_at", { ascending: false });

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="ユーザー管理"
        description="チームメンバーとロールを管理します。"
      />

      {error ? (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-sm text-destructive">
              ユーザーの読み込みに失敗しました。
            </p>
          </CardContent>
        </Card>
      ) : !tenantUsers || tenantUsers.length === 0 ? (
        <Card>
          <EmptyState
            icon={UsersIcon}
            title="チームメンバーがいません"
            description="組織に参加したメンバーがここに表示されます。"
          />
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>
              チームメンバー ({tenantUsers.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {tenantUsers.map((tu: any) => {
                const user = tu.users;
                const name = user?.display_name || user?.email || "不明";

                return (
                  <div
                    key={tu.id}
                    className="flex items-center gap-4 rounded-lg px-3 py-3 transition-colors hover:bg-muted/50"
                  >
                    <Avatar name={name} size="md" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {user?.display_name || "名前なし"}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {user?.email || "メールなし"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge
                        variant={
                          tu.role === "owner"
                            ? "default"
                            : tu.role === "admin"
                              ? "info"
                              : "outline"
                        }
                      >
                        {tu.role === "owner" ? "オーナー" : tu.role === "admin" ? "管理者" : "メンバー"}
                      </Badge>
                      <Badge
                        variant={
                          tu.status === "active" ? "success" : "warning"
                        }
                      >
                        {tu.status === "active" || !tu.status ? "アクティブ" : tu.status}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
