import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardFooter,
} from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { TEMPLATE_CATALOG } from "@/lib/templates/template-catalog";
import {
  Plus,
  CreditCard,
  Users,
  Database,
  ArrowRight,
  Check,
  Star,
} from "lucide-react";

/** Brief examples of what each template can build */
const templateUseCases: Record<string, string[]> = {
  membership_content_affiliate: [
    "オンラインサロン",
    "動画講座サイト",
    "有料メルマガ配信",
  ],
  reservation_saas: [
    "美容室予約サイト",
    "レッスン予約システム",
    "レンタルスペース管理",
  ],
  community_membership_saas: [
    "ファンコミュニティ",
    "学習コミュニティ",
    "サブスク型コンテンツ配信",
  ],
  simple_crm_saas: [
    "営業案件管理",
    "顧客データベース",
    "商談パイプライン",
  ],
  internal_admin_ops_saas: [
    "社内申請ワークフロー",
    "経費精算管理",
    "備品管理システム",
  ],
};

const gradients = [
  "from-blue-500/10 via-blue-500/5 to-transparent",
  "from-purple-500/10 via-purple-500/5 to-transparent",
  "from-emerald-500/10 via-emerald-500/5 to-transparent",
  "from-amber-500/10 via-amber-500/5 to-transparent",
  "from-rose-500/10 via-rose-500/5 to-transparent",
  "from-indigo-500/10 via-indigo-500/5 to-transparent",
];

const iconColors = [
  "bg-blue-100 text-blue-600",
  "bg-purple-100 text-purple-600",
  "bg-emerald-100 text-emerald-600",
  "bg-amber-100 text-amber-600",
  "bg-rose-100 text-rose-600",
  "bg-indigo-100 text-indigo-600",
];

export default function TemplatesPage() {
  return (
    <div className="space-y-8 animate-fade-in">
      <PageHeader
        title="テンプレート"
        description="テンプレートを選んでSaaSアプリの構築を始めましょう。"
        action={
          <Button asChild>
            <Link href="/projects/new">
              <Plus className="h-4 w-4" />
              新規プロジェクト
            </Link>
          </Button>
        }
      />

      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {TEMPLATE_CATALOG.map((template, index) => (
          <Link
            key={template.templateKey}
            href={`/projects/new?template=${template.templateKey}`}
            className="group block"
          >
            <Card className="flex h-full flex-col overflow-hidden transition-all duration-200 hover:shadow-lg hover:-translate-y-1">
              {/* Gradient Header */}
              <div
                className={`relative h-24 bg-gradient-to-br ${gradients[index % gradients.length]}`}
              >
                <div className="absolute bottom-3 left-5 flex items-center gap-3">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-xl ${iconColors[index % iconColors.length]} shadow-sm`}
                  >
                    <Database className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">
                      {template.label}
                    </h3>
                  </div>
                </div>
                <div className="absolute right-3 top-3 flex items-center gap-2">
                  {template.statusBadge === "GREEN" && (
                    <Badge className="flex items-center gap-1 border-0 bg-emerald-500 text-white text-[10px] shadow-sm">
                      <Star className="h-2.5 w-2.5" />
                      おすすめ
                    </Badge>
                  )}
                  {template.statusBadge !== "GREEN" && (
                    <Badge variant="secondary" className="text-[10px]">
                      {template.statusBadge}
                    </Badge>
                  )}
                </div>
              </div>

              <CardContent className="flex-1 space-y-4 p-5 pt-4">
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {template.shortDescription}
                </p>

                {templateUseCases[template.templateKey] && (
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      このテンプレートで作れるもの
                    </p>
                    <ul className="space-y-1">
                      {templateUseCases[template.templateKey].map(
                        (useCase) => (
                          <li
                            key={useCase}
                            className="flex items-center gap-1.5 text-sm"
                          >
                            <Check className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                            {useCase}
                          </li>
                        )
                      )}
                    </ul>
                  </div>
                )}

                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    対象ユーザー
                  </p>
                  <p className="text-sm">{template.targetUsers}</p>
                </div>

                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    主要エンティティ
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {template.coreEntities.map((entity) => (
                      <Badge
                        key={entity}
                        variant="outline"
                        className="text-[11px] font-normal"
                      >
                        {entity}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div className="flex gap-4 pt-1">
                  {template.includesBilling && (
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <div className="flex h-5 w-5 items-center justify-center rounded bg-emerald-50">
                        <CreditCard className="h-3 w-3 text-emerald-600" />
                      </div>
                      課金
                    </span>
                  )}
                  {template.includesAffiliate && (
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <div className="flex h-5 w-5 items-center justify-center rounded bg-blue-50">
                        <Users className="h-3 w-3 text-blue-600" />
                      </div>
                      アフィリエイト
                    </span>
                  )}
                </div>
              </CardContent>

              <CardFooter className="p-5 pt-0">
                <div className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors group-hover:bg-primary/90">
                  このテンプレートを使う
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </div>
              </CardFooter>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
