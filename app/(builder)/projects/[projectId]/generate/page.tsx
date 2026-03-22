"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils/cn";
import {
  ArrowLeft,
  Play,
  Loader2,
  CheckCircle2,
  Circle,
  XCircle,
  AlertCircle,
  FileCode,
  Zap,
  Clock,
  Cpu,
} from "lucide-react";

type StepStatus = "pending" | "running" | "completed" | "failed" | "skipped";

interface GenerationStep {
  key: string;
  label: string;
  status: StepStatus;
  meta?: {
    durationMs?: number;
    provider?: string;
    model?: string;
    errorCount?: number;
    warningCount?: number;
  };
}

interface GenerationRun {
  id: string;
  status: string;
  current_step?: string | null;
  steps_json: GenerationStep[];
  started_at: string;
  completed_at?: string | null;
}

const stepIconMap: Record<StepStatus, { icon: React.ElementType; className: string }> = {
  pending: { icon: Circle, className: "text-muted-foreground/40" },
  running: { icon: Loader2, className: "text-primary animate-spin" },
  completed: { icon: CheckCircle2, className: "text-emerald-500" },
  failed: { icon: XCircle, className: "text-destructive" },
  skipped: { icon: Circle, className: "text-muted-foreground/30" },
};

export default function GeneratePage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [project, setProject] = useState<any>(null);
  const [latestRun, setLatestRun] = useState<GenerationRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}`);
      if (!res.ok) throw new Error("プロジェクトの取得に失敗しました");
      const data = await res.json();
      setProject(data.project);
      if (data.generationRuns?.length > 0) {
        setLatestRun(data.generationRuns[0]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "不明なエラー");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!latestRun || !["running", "pending"].includes(latestRun.status)) return;
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, [latestRun?.status, fetchData]);

  const startGeneration = async (endpoint: string, label: string) => {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/${endpoint}`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `${label}に失敗しました`);
      }
      await fetchData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "不明なエラー");
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center gap-4">
          <Skeleton className="h-9 w-9 rounded-lg" />
          <div className="space-y-2">
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <Skeleton className="h-48 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex items-center justify-center h-64 animate-fade-in">
        <p className="text-muted-foreground">プロジェクトが見つかりません</p>
      </div>
    );
  }

  const steps = latestRun?.steps_json ?? [];
  const completedSteps = steps.filter((s) => s.status === "completed").length;
  const isRunning = latestRun?.status === "running";

  const pipelineActions = [
    { endpoint: "generate-template", label: "テンプレート生成", primary: true },
    { endpoint: "generate-api-design", label: "API設計", primary: false },
    { endpoint: "generate-schema", label: "スキーマ", primary: false },
    { endpoint: "generate-implementation", label: "実装", primary: false },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href={`/projects/${projectId}`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">コード生成</h1>
          <p className="text-sm text-muted-foreground">{project.name}</p>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3">
          <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {/* Pipeline Actions */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <Zap className="h-4 w-4 text-primary" />
            </div>
            <div>
              <CardTitle>生成パイプライン</CardTitle>
              <CardDescription>
                AIによるコード生成をプロジェクトに対して実行します。
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {pipelineActions.map((action) => (
              <Button
                key={action.endpoint}
                variant={action.primary ? "default" : "outline"}
                onClick={() =>
                  startGeneration(action.endpoint, action.label.toLowerCase())
                }
                disabled={generating || isRunning}
                size="sm"
              >
                {generating ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Play className="h-3.5 w-3.5" />
                )}
                {action.label}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Latest Run */}
      {latestRun && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CardTitle>最新の実行</CardTitle>
                <Badge
                  variant={
                    latestRun.status === "completed"
                      ? "success"
                      : latestRun.status === "failed"
                        ? "destructive"
                        : latestRun.status === "running"
                          ? "info"
                          : "secondary"
                  }
                  className="capitalize"
                >
                  {latestRun.status}
                </Badge>
              </div>
              {latestRun.started_at && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  {new Date(latestRun.started_at).toLocaleString("ja-JP")}
                </span>
              )}
            </div>
            {steps.length > 0 && (
              <div className="pt-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
                  <span>進捗</span>
                  <span>
                    {completedSteps}/{steps.length} ステップ
                  </span>
                </div>
                <Progress
                  value={completedSteps}
                  max={steps.length}
                  variant={
                    latestRun.status === "failed" ? "destructive" : "default"
                  }
                />
              </div>
            )}
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {steps.map((step, index) => {
                const { icon: StepIcon, className: iconClass } =
                  stepIconMap[step.status] ?? stepIconMap.pending;
                return (
                  <div
                    key={step.key}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors",
                      step.status === "running" && "bg-primary/5",
                      step.status === "failed" && "bg-destructive/5"
                    )}
                    style={{ animationDelay: `${index * 30}ms` }}
                  >
                    <StepIcon className={cn("h-4 w-4 shrink-0", iconClass)} />

                    {/* Vertical connector line */}
                    <div className="flex-1">
                      <span className="text-sm font-medium">
                        {step.label || step.key}
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      {step.meta?.provider && (
                        <span className="flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                          <Cpu className="h-2.5 w-2.5" />
                          {step.meta.provider}
                          {step.meta.model && ` / ${step.meta.model}`}
                        </span>
                      )}
                      {step.meta?.durationMs != null && (
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {(step.meta.durationMs / 1000).toFixed(1)}s
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
              {steps.length === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  ステップがまだ記録されていません。
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Navigation */}
      <div className="flex gap-2">
        <Button variant="outline" size="sm" asChild>
          <Link href={`/projects/${projectId}/blueprint`}>ブループリントを見る</Link>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link href={`/projects/${projectId}/deploy`}>
            <FileCode className="h-3.5 w-3.5" />
            デプロイ
          </Link>
        </Button>
      </div>
    </div>
  );
}
