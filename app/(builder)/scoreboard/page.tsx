"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { MetricCard } from "@/components/ui/metric-card";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils/cn";
import {
  BarChart3,
  CheckCircle2,
  XCircle,
  Trophy,
  TrendingUp,
  Clock,
  Shield,
} from "lucide-react";

type TemplateScore = {
  templateKey: string;
  label: string;
  totalRuns: number;
  completedRuns: number;
  failedRuns: number;
  greenRate: number;
  approvedRuns: number;
  rejectedRuns: number;
  promotedRuns: number;
  latestBaselineTag: string | null;
  qualityPassRate: number;
  qualityTotalRuns: number;
  qualityPassedRuns: number;
  promotionRate: number;
  blueprintReviewStatus: string | null;
  lastApprovedAt: string | null;
  lastPromotedAt: string | null;
};

type ScoreboardData = {
  templates: TemplateScore[];
  generatedAt: string;
};

function RateCircle({ rate, size = "lg" }: { rate: number; size?: "sm" | "lg" }) {
  const color =
    rate >= 90
      ? "text-emerald-600 border-emerald-200 bg-emerald-50"
      : rate >= 70
        ? "text-amber-600 border-amber-200 bg-amber-50"
        : "text-red-600 border-red-200 bg-red-50";

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-full border-2",
        color,
        size === "lg" ? "h-20 w-20" : "h-14 w-14"
      )}
    >
      <span className={cn("font-bold", size === "lg" ? "text-xl" : "text-base")}>
        {rate}%
      </span>
    </div>
  );
}

export default function ScoreboardPage() {
  const [data, setData] = useState<ScoreboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchScoreboard = useCallback(async () => {
    try {
      const res = await fetch("/api/scoreboard");
      if (!res.ok) throw new Error("Failed to fetch scoreboard");
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchScoreboard();
  }, [fetchScoreboard]);

  if (loading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="space-y-2">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-40" />
        </div>
        <div className="grid gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-48 rounded-xl" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-6 animate-fade-in">
        <PageHeader title="テンプレートスコアボード" />
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-sm text-destructive">
              {error || "スコアボードの読み込みに失敗しました"}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in">
      <PageHeader
        title="テンプレートスコアボード"
        description={`最終更新 ${new Date(data.generatedAt).toLocaleString("ja-JP")}`}
      />

      {data.templates.length === 0 ? (
        <Card>
          <EmptyState
            icon={BarChart3}
            title="まだ生成履歴がありません"
            description="生成パイプラインを実行すると、テンプレートのスコアと指標がここに表示されます。"
          />
        </Card>
      ) : (
        <div className="space-y-6">
          {data.templates.map((t, index) => (
            <Card
              key={t.templateKey}
              className="overflow-hidden"
              style={{ animationDelay: `${index * 80}ms` }}
            >
              <CardHeader className="pb-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                      <BarChart3 className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{t.label}</CardTitle>
                      <p className="text-xs text-muted-foreground font-mono">
                        {t.templateKey}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {t.blueprintReviewStatus === "approved" ? (
                      <Badge variant="success" className="flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        ブループリント承認済み
                      </Badge>
                    ) : t.blueprintReviewStatus === "rejected" ? (
                      <Badge variant="destructive" className="flex items-center gap-1">
                        <XCircle className="h-3 w-3" />
                        ブループリント却下
                      </Badge>
                    ) : t.blueprintReviewStatus ? (
                      <Badge variant="secondary">ブループリント保留中</Badge>
                    ) : null}
                    {t.latestBaselineTag && (
                      <Badge variant="info">{t.latestBaselineTag}</Badge>
                    )}
                  </div>
                </div>
              </CardHeader>

              <CardContent>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <div className="flex flex-col items-center gap-2 rounded-xl border p-4">
                    <RateCircle rate={t.greenRate} size="sm" />
                    <div className="text-center">
                      <p className="text-xs font-medium text-muted-foreground">
                        成功率
                      </p>
                      <p className="text-xs text-muted-foreground/70">
                        {t.completedRuns}/{t.totalRuns} 回
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col items-center gap-2 rounded-xl border p-4">
                    <RateCircle
                      rate={t.qualityTotalRuns > 0 ? t.qualityPassRate : 0}
                      size="sm"
                    />
                    <div className="text-center">
                      <p className="text-xs font-medium text-muted-foreground">
                        品質合格
                      </p>
                      <p className="text-xs text-muted-foreground/70">
                        {t.qualityTotalRuns > 0
                          ? `${t.qualityPassedRuns}/${t.qualityTotalRuns} 回`
                          : "未実行"}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col items-center gap-2 rounded-xl border p-4">
                    <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-amber-200 bg-amber-50">
                      <span className="text-base font-bold text-amber-600">
                        {t.approvedRuns}
                      </span>
                    </div>
                    <div className="text-center">
                      <p className="text-xs font-medium text-muted-foreground">
                        承認
                      </p>
                      <p className="text-xs text-muted-foreground/70">
                        {t.rejectedRuns} 却下
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col items-center gap-2 rounded-xl border p-4">
                    <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-indigo-200 bg-indigo-50">
                      <span className="text-base font-bold text-indigo-600">
                        {t.promotedRuns}
                      </span>
                    </div>
                    <div className="text-center">
                      <p className="text-xs font-medium text-muted-foreground">
                        昇格
                      </p>
                      <p className="text-xs text-muted-foreground/70">
                        {t.approvedRuns > 0
                          ? `承認の${t.promotionRate}%`
                          : `${t.failedRuns} 失敗`}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Timestamps */}
                {(t.lastApprovedAt || t.lastPromotedAt) && (
                  <div className="mt-4 flex flex-wrap gap-4 border-t pt-3">
                    {t.lastApprovedAt && (
                      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        最終承認:{" "}
                        {new Date(t.lastApprovedAt).toLocaleString("ja-JP")}
                      </span>
                    )}
                    {t.lastPromotedAt && (
                      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Trophy className="h-3 w-3" />
                        最終昇格:{" "}
                        {new Date(t.lastPromotedAt).toLocaleString("ja-JP")}
                      </span>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
