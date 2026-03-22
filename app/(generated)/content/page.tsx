import Link from "next/link";
import { createAdminClient } from "@/lib/db/supabase/admin";
import { requireTenantRole } from "@/lib/rbac/guards";
import { DeleteButton } from "@/components/domain/delete-button";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Plus,
  FileText,
  Pencil,
  Eye,
  EyeOff,
  Globe,
  Lock,
} from "lucide-react";

export default async function ContentListPage() {
  const membership = await requireTenantRole("admin");
  const supabase = createAdminClient();

  const { data: contents, error } = await supabase
    .from("contents")
    .select("*")
    .eq("tenant_id", membership.tenant_id)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="コンテンツ管理"
        description="コンテンツと記事を管理します。"
        action={
          <Button asChild>
            <Link href="/content/new">
              <Plus className="h-4 w-4" />
              新規コンテンツ
            </Link>
          </Button>
        }
      />

      {!contents || contents.length === 0 ? (
        <Card>
          <EmptyState
            icon={FileText}
            title="コンテンツがありません"
            description="最初のコンテンツを作成しましょう。"
            action={
              <Button asChild>
                <Link href="/content/new">
                  <Plus className="h-4 w-4" />
                  新規コンテンツ
                </Link>
              </Button>
            }
          />
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>すべてのコンテンツ ({contents.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-3 pr-4 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      タイトル
                    </th>
                    <th className="pb-3 pr-4 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      種別
                    </th>
                    <th className="pb-3 pr-4 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      公開範囲
                    </th>
                    <th className="pb-3 pr-4 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      公開日
                    </th>
                    <th className="pb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {contents.map((content) => (
                    <tr
                      key={content.id}
                      className="border-b last:border-0 transition-colors hover:bg-muted/30"
                    >
                      <td className="py-3.5 pr-4">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
                            <FileText className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <span className="font-medium">{content.title}</span>
                        </div>
                      </td>
                      <td className="py-3.5 pr-4">
                        <Badge variant="outline" className="capitalize">
                          {content.content_type}
                        </Badge>
                      </td>
                      <td className="py-3.5 pr-4">
                        <span className="flex items-center gap-1.5 text-muted-foreground">
                          {content.visibility === "public" ? (
                            <>
                              <Globe className="h-3 w-3" />
                              <span className="text-xs">公開</span>
                            </>
                          ) : (
                            <>
                              <Lock className="h-3 w-3" />
                              <span className="text-xs capitalize">
                                {content.visibility}
                              </span>
                            </>
                          )}
                        </span>
                      </td>
                      <td className="py-3.5 pr-4">
                        {content.published ? (
                          <Badge variant="success" className="flex items-center gap-1 w-fit">
                            <Eye className="h-3 w-3" />
                            公開中
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="flex items-center gap-1 w-fit">
                            <EyeOff className="h-3 w-3" />
                            下書き
                          </Badge>
                        )}
                      </td>
                      <td className="py-3.5">
                        <div className="flex items-center gap-2">
                          <Button variant="ghost" size="sm" asChild>
                            <Link href={`/content/${content.id}/edit`}>
                              <Pencil className="h-3.5 w-3.5" />
                              編集
                            </Link>
                          </Button>
                          <DeleteButton
                            endpoint={`/api/domain/content/${content.id}`}
                            confirmMessage={`Delete "${content.title}"?`}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
