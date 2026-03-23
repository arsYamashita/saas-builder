"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils/cn";
import {
  FileText,
  ClipboardCheck,
  Cpu,
  Download,
  CheckCircle2,
  Circle,
  Loader2,
  AlertCircle,
  ChevronRight,
  Calendar,
  LayoutTemplate,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type ProjectData = {
  project: {
    id: string;
    name: string;
    description: string | null;
    template_key: string;
    status: string;
    created_at?: string;
  };
  blueprints: Array<{
    id: string;
    version: number;
    review_status?: string;
    reviewed_at?: string | null;
  }>;
  generationRuns: Array<{
    id: string;
    status: string;
    review_status?: string;
    steps_json: Array<{ key: string; status: string }>;
  }>;
  generatedFiles: Array<{ id: string }>;
  qualityRuns: Array<{ id: string; status: string }>;
};

type PipelineStep = {
  number: number;
  key: string;
  title: string;
  description: string;
  icon: React.ElementType;
  status: "completed" | "active" | "in_progress" | "locked";
  actionLabel: string;
  href?: string;
  onClick?: () => void;
};

/* ------------------------------------------------------------------ */
/*  Status helpers                                                     */
/* ------------------------------------------------------------------ */

function statusBadgeVariant(status: string) {
  switch (status) {
    case "completed":
    case "active":
      return "success" as const;
    case "generating":
    case "running":
      return "info" as const;
    case "failed":
      return "destructive" as const;
    default:
      return "secondary" as const;
  }
}

function statusLabel(status: string) {
  const map: Record<string, string> = {
    draft: "下書き",
    active: "有効",
    generating: "生成中",
    completed: "完了",
    failed: "失敗",
  };
  return map[status] ?? status;
}

/* ------------------------------------------------------------------ */
/*  Pipeline step computation                                          */
/* ------------------------------------------------------------------ */

function computePipelineSteps(
  data: ProjectData,
  generating: string | null,
  projectId: string,
  onGenerate: (endpoint: string, label: string) => void,
): PipelineStep[] {
  const latestBlueprint = data.blueprints?.[0];
  const hasBlueprint = !!latestBlueprint;
  const blueprintApproved = latestBlueprint?.review_status === "approved";

  const latestGenRun = data.generationRuns?.[0];
  const genCompleted = latestGenRun?.status === "completed";
  const genRunning = latestGenRun?.status === "running";

  const hasFiles = (data.generatedFiles?.length ?? 0) > 0;

  // Step 1: Blueprint generation
  const step1Status: PipelineStep["status"] = hasBlueprint
    ? "completed"
    : generating === "blueprint"
      ? "in_progress"
      : "active";

  // Step 2: Blueprint approval
  const step2Status: PipelineStep["status"] = blueprintApproved
    ? "completed"
    : hasBlueprint
      ? "active"
      : "locked";

  // Step 3: Code generation
  const step3Status: PipelineStep["status"] = genCompleted
    ? "completed"
    : genRunning || generating === "generate"
      ? "in_progress"
      : blueprintApproved
        ? "active"
        : "locked";

  // Step 4: Export
  const step4Status: PipelineStep["status"] = hasFiles
    ? "active"
    : "locked";

  return [
    {
      number: 1,
      key: "blueprint",
      title: "ブループリント生成",
      description: "AIが設計書（PRD・エンティティ・画面設計・ロール）を自動生成します",
      icon: FileText,
      status: step1Status,
      actionLabel: hasBlueprint ? "確認する" : generating === "blueprint" ? "生成中..." : "生成する",
      ...(hasBlueprint
        ? { href: `/projects/${projectId}/blueprint` }
        : {
            onClick: () => onGenerate("generate-blueprint", "blueprint"),
          }),
    },
    {
      number: 2,
      key: "review",
      title: "ブループリント確認",
      description: "生成された設計書を確認して承認します",
      icon: ClipboardCheck,
      status: step2Status,
      actionLabel: blueprintApproved ? "承認済み" : "確認・承認",
      ...(hasBlueprint ? { href: `/projects/${projectId}/blueprint` } : {}),
    },
    {
      number: 3,
      key: "generate",
      title: "コード生成",
      description: "承認されたブループリントからコードを一括生成します",
      icon: Cpu,
      status: step3Status,
      actionLabel: genCompleted
        ? "結果を確認"
        : genRunning || generating === "generate"
          ? "生成中..."
          : "生成開始",
      ...(genCompleted || genRunning
        ? { href: `/projects/${projectId}/generate` }
        : blueprintApproved
          ? {
              onClick: () =>
                onGenerate("generate-template", "generate"),
            }
          : {}),
    },
    {
      number: 4,
      key: "export",
      title: "エクスポート",
      description: "生成されたコードをダウンロード・エクスポートします",
      icon: Download,
      status: step4Status,
      actionLabel: hasFiles ? "ダウンロード" : "まだ利用できません",
      ...(hasFiles ? { href: `/projects/${projectId}/deploy` } : {}),
    },
  ];
}

/* ------------------------------------------------------------------ */
/*  Step Card Component                                                */
/* ------------------------------------------------------------------ */

function StepCard({
  step,
  isLast,
  generating,
}: {
  step: PipelineStep;
  isLast: boolean;
  generating: string | null;
}) {
  const Icon = step.icon;
  const isDisabled = step.status === "locked";
  const isActive = step.status === "active";
  const isCompleted = step.status === "completed";
  const isInProgress = step.status === "in_progress";

  const actionContent = step.href ? (
    <Button
      size="sm"
      variant={isActive ? "default" : isCompleted ? "outline" : "secondary"}
      asChild
      disabled={isDisabled}
    >
      <Link href={step.href}>
        {isCompleted && <CheckCircle2 className="h-3.5 w-3.5" />}
        {step.actionLabel}
        {!isCompleted && !isDisabled && (
          <ChevronRight className="h-3.5 w-3.5" />
        )}
      </Link>
    </Button>
  ) : step.onClick ? (
    <Button
      size="sm"
      variant={isActive ? "default" : "secondary"}
      onClick={step.onClick}
      disabled={isDisabled || isInProgress}
    >
      {isInProgress && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      {step.actionLabel}
    </Button>
  ) : (
    <Button size="sm" variant="secondary" disabled>
      {step.actionLabel}
    </Button>
  );

  return (
    <div className="relative">
      {/* Vertical connecting line */}
      {!isLast && (
        <div
          className={cn(
            "absolute left-[23px] top-[72px] bottom-[-16px] w-0.5",
            isCompleted ? "bg-emerald-300" : "bg-border"
          )}
        />
      )}

      <Card
        className={cn(
          "relative transition-all duration-200",
          isActive &&
            "border-primary/50 shadow-md ring-1 ring-primary/20",
          isCompleted && "border-emerald-200 bg-emerald-50/30",
          isInProgress &&
            "border-blue-300 shadow-md ring-1 ring-blue-200/50",
          isDisabled && "opacity-50"
        )}
      >
        <CardHeader className="pb-3">
          <div className="flex items-start gap-4">
            {/* Step number + icon */}
            <div
              className={cn(
                "flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                isCompleted &&
                  "border-emerald-500 bg-emerald-500 text-white",
                isActive && "border-primary bg-primary/10 text-primary",
                isInProgress &&
                  "border-blue-500 bg-blue-50 text-blue-600",
                isDisabled &&
                  "border-muted bg-muted text-muted-foreground"
              )}
            >
              {isCompleted ? (
                <CheckCircle2 className="h-5 w-5" />
              ) : isInProgress ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <span className="text-sm font-bold">{step.number}</span>
              )}
            </div>

            {/* Title + description */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <CardTitle
                  className={cn(
                    isDisabled && "text-muted-foreground"
                  )}
                >
                  {step.title}
                </CardTitle>
                {isCompleted && (
                  <Badge variant="success" className="text-[10px]">
                    完了
                  </Badge>
                )}
                {isInProgress && (
                  <Badge variant="info" className="text-[10px]">
                    進行中
                  </Badge>
                )}
                {isActive && (
                  <Badge variant="warning" className="text-[10px]">
                    次のステップ
                  </Badge>
                )}
              </div>
              <CardDescription
                className={cn(isDisabled && "text-muted-foreground/60")}
              >
                {step.description}
              </CardDescription>
            </div>

            {/* Action button */}
            <div className="shrink-0">{actionContent}</div>
          </div>
        </CardHeader>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Loading skeleton                                                    */
/* ------------------------------------------------------------------ */

function PipelineSkeleton() {
  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header skeleton */}
      <div className="space-y-3">
        <Skeleton className="h-8 w-64" />
        <div className="flex gap-2">
          <Skeleton className="h-5 w-20 rounded-full" />
          <Skeleton className="h-5 w-32" />
        </div>
      </div>
      {/* Steps skeleton */}
      <div className="space-y-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-24 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Page Component                                                */
/* ------------------------------------------------------------------ */

export default function ProjectDetailPage() {
  const params = useParams();
  const projectId = params.projectId as string;

  const [data, setData] = useState<ProjectData | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /* ---- Data fetching ---- */

  const fetchProject = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}`);
      if (!res.ok) throw new Error("プロジェクトの取得に失敗しました");
      const json = await res.json();
      setData(json);
      return json as ProjectData;
    } catch (err) {
      setError(err instanceof Error ? err.message : "不明なエラー");
      return null;
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  const startPolling = useCallback(() => {
    stopPolling();
    pollingRef.current = setInterval(async () => {
      const result = await fetchProject();
      if (!result) return;
      const latestRun = result.generationRuns?.[0];
      if (
        !latestRun ||
        latestRun.status === "completed" ||
        latestRun.status === "failed"
      ) {
        stopPolling();
        setGenerating(null);
      }
    }, 3000);
  }, [fetchProject, stopPolling]);

  useEffect(() => {
    fetchProject();
    return () => stopPolling();
  }, [fetchProject, stopPolling]);

  /* ---- Actions ---- */

  async function handleGenerate(endpoint: string, label: string) {
    setGenerating(label);
    setError(null);

    if (endpoint === "generate-template") {
      startPolling();
    }

    try {
      const res = await fetch(`/api/projects/${projectId}/${endpoint}`, {
        method: "POST",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `${label}に失敗しました`);
      }
      await fetchProject();
    } catch (err) {
      setError(err instanceof Error ? err.message : "不明なエラー");
    } finally {
      if (endpoint !== "generate-template") {
        setGenerating(null);
      }
    }
  }

  /* ---- Render ---- */

  if (loading) {
    return (
      <main className="max-w-3xl mx-auto px-4 py-8">
        <PipelineSkeleton />
      </main>
    );
  }

  if (!data) {
    return (
      <main className="max-w-3xl mx-auto px-4 py-8">
        <div className="flex items-center justify-center h-64">
          <div className="text-center space-y-2">
            <AlertCircle className="h-8 w-8 text-muted-foreground mx-auto" />
            <p className="text-muted-foreground">
              {error || "プロジェクトが見つかりません"}
            </p>
          </div>
        </div>
      </main>
    );
  }

  const steps = computePipelineSteps(
    data,
    generating,
    projectId,
    handleGenerate
  );

  const completedCount = steps.filter((s) => s.status === "completed").length;
  const activeStep = steps.find(
    (s) => s.status === "active" || s.status === "in_progress"
  );

  return (
    <main className="max-w-3xl mx-auto px-4 py-8 space-y-8 animate-fade-in">
      {/* ====== Project Header ====== */}
      <section className="space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight">
              {data.project.name}
            </h1>
            {data.project.description && (
              <p className="text-sm text-muted-foreground line-clamp-2">
                {data.project.description}
              </p>
            )}
          </div>
          <Badge
            variant={statusBadgeVariant(data.project.status)}
            className="shrink-0 mt-1"
          >
            {statusLabel(data.project.status)}
          </Badge>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <LayoutTemplate className="h-3 w-3" />
            {data.project.template_key}
          </span>
          {data.project.created_at && (
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {new Date(data.project.created_at).toLocaleDateString("ja-JP")}
            </span>
          )}
        </div>

        {/* Progress summary */}
        <div className="flex items-center gap-3">
          <div
            className="flex-1 h-2 rounded-full bg-muted overflow-hidden"
            role="progressbar"
            aria-valuenow={completedCount}
            aria-valuemin={0}
            aria-valuemax={steps.length}
            aria-label="プロジェクト進捗"
          >
            <div
              className="h-full rounded-full bg-emerald-500 transition-all duration-500"
              style={{ width: `${(completedCount / steps.length) * 100}%` }}
            />
          </div>
          <span className="text-xs font-medium text-muted-foreground shrink-0">
            {completedCount}/{steps.length} 完了
          </span>
        </div>
      </section>

      {/* ====== Error ====== */}
      {error && (
        <div className="flex items-center gap-3 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3">
          <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />
          <p className="text-sm text-destructive">{error}</p>
          <button
            onClick={() => setError(null)}
            className="ml-auto text-xs text-destructive/70 hover:text-destructive"
          >
            閉じる
          </button>
        </div>
      )}

      {/* ====== Pipeline Steps ====== */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          開発パイプライン
        </h2>

        <div className="space-y-4">
          {steps.map((step, index) => (
            <StepCard
              key={step.key}
              step={step}
              isLast={index === steps.length - 1}
              generating={generating}
            />
          ))}
        </div>
      </section>

      {/* ====== Quick hint for active step ====== */}
      {activeStep && activeStep.status === "active" && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
          <p className="text-sm text-primary font-medium">
            次のステップ: {activeStep.title}
          </p>
          <p className="text-xs text-primary/70 mt-0.5">
            {activeStep.description}
          </p>
        </div>
      )}
    </main>
  );
}
