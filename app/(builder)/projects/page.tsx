export const dynamic = "force-dynamic";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { createAdminClient } from "@/lib/db/supabase/admin";
import {
  Plus,
  FolderKanban,
  ArrowRight,
  Clock,
  LayoutTemplate,
  Layout,
  PenLine,
  Sparkles,
} from "lucide-react";

type ProjectStatus = "draft" | "approved" | "generating" | "deployed";

const statusConfig: Record<
  ProjectStatus,
  { variant: "secondary" | "success" | "warning" | "info"; label: string }
> = {
  draft: { variant: "secondary", label: "下書き" },
  approved: { variant: "success", label: "承認済み" },
  generating: { variant: "warning", label: "生成中" },
  deployed: { variant: "info", label: "デプロイ済み" },
};

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default async function ProjectsPage() {
  const supabase = createAdminClient();

  const { data: projects, error } = await supabase
    .from("projects")
    .select("id, name, template_key, status, description, created_at")
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-8 animate-fade-in">
      <PageHeader
        title="プロジェクト"
        description="SaaSプロジェクトの管理と進捗を確認できます。"
        action={
          <Button asChild>
            <Link href="/projects/new">
              <Plus className="h-4 w-4" />
              新規プロジェクト
            </Link>
          </Button>
        }
      />

      {error ? (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-sm text-destructive">
              プロジェクトの読み込みに失敗しました。
            </p>
          </CardContent>
        </Card>
      ) : !projects || projects.length === 0 ? (
        <Card className="overflow-hidden">
          <CardContent className="p-8 sm:p-12">
            <div className="mx-auto max-w-lg text-center">
              <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
                <Sparkles className="h-8 w-8 text-primary" />
              </div>
              <h2 className="text-2xl font-bold tracking-tight text-foreground">
                SaaS Builderへようこそ！
              </h2>
              <p className="mt-2 text-muted-foreground">
                3つのステップであなたのSaaSを作りましょう
              </p>

              <div className="mt-8 grid gap-4 sm:grid-cols-3">
                {[
                  {
                    step: 1,
                    icon: Layout,
                    title: "テンプレートを選ぶ",
                    description: "用途に合ったテンプレートを選択",
                  },
                  {
                    step: 2,
                    icon: PenLine,
                    title: "基本情報を入力",
                    description: "サービス名と概要を入力",
                  },
                  {
                    step: 3,
                    icon: Sparkles,
                    title: "AIが自動生成",
                    description: "ブループリントとコードを自動生成",
                  },
                ].map((item) => (
                  <div
                    key={item.step}
                    className="relative rounded-xl border bg-muted/30 p-4 text-center"
                  >
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
                      {item.step}
                    </span>
                    <item.icon className="mx-auto mt-2 h-6 w-6 text-primary/70" />
                    <p className="mt-2 text-sm font-semibold text-foreground">
                      {item.title}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {item.description}
                    </p>
                  </div>
                ))}
              </div>

              <div className="mt-8 flex flex-col items-center gap-3">
                <Button size="lg" asChild>
                  <Link href="/projects/new">
                    <Plus className="h-4 w-4" />
                    最初のプロジェクトを作成
                  </Link>
                </Button>
                <Link
                  href="/templates"
                  className="text-sm text-muted-foreground underline-offset-4 hover:text-primary hover:underline transition-colors"
                >
                  テンプレートを見る
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project, index) => {
            const status = (project.status ?? "draft") as ProjectStatus;
            const config = statusConfig[status] ?? statusConfig.draft;

            return (
              <Link
                key={project.id}
                href={`/projects/${project.id}`}
                className="group block"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <Card className="h-full transition-all duration-200 hover:shadow-card-hover hover:-translate-y-0.5">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                        <FolderKanban className="h-5 w-5 text-primary" />
                      </div>
                      <Badge variant={config.variant}>{config.label}</Badge>
                    </div>

                    <div className="mt-4">
                      <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">
                        {project.name}
                      </h3>
                      {project.description && (
                        <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                          {project.description}
                        </p>
                      )}
                    </div>

                    <div className="mt-4 flex items-center gap-4 text-xs text-muted-foreground">
                      {project.template_key && (
                        <span className="flex items-center gap-1">
                          <LayoutTemplate className="h-3 w-3" />
                          {project.template_key}
                        </span>
                      )}
                      {project.created_at && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDate(project.created_at)}
                        </span>
                      )}
                    </div>

                    <div className="mt-4 flex items-center text-xs font-medium text-primary opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                      プロジェクトを開く
                      <ArrowRight className="ml-1 h-3 w-3" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
