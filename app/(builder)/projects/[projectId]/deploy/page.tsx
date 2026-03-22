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
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils/cn";
import {
  ArrowLeft,
  Download,
  ShieldCheck,
  Loader2,
  CheckCircle2,
  XCircle,
  FileCode,
  AlertCircle,
  Play,
  File,
  Folder,
  ChevronRight,
} from "lucide-react";

interface GeneratedFile {
  id: string;
  file_path: string;
  file_type: string;
  created_at: string;
}

interface QualityRun {
  id: string;
  status: string;
  steps_json?: Array<{
    key: string;
    label: string;
    status: string;
    result?: string;
  }>;
  started_at: string;
  completed_at?: string | null;
}

function groupFilesByDirectory(files: GeneratedFile[]) {
  const tree: Record<string, GeneratedFile[]> = {};
  files.forEach((file) => {
    const parts = file.file_path.split("/");
    const dir = parts.length > 1 ? parts.slice(0, -1).join("/") : ".";
    if (!tree[dir]) tree[dir] = [];
    tree[dir].push(file);
  });
  return Object.entries(tree).sort(([a], [b]) => a.localeCompare(b));
}

export default function DeployPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [project, setProject] = useState<any>(null);
  const [files, setFiles] = useState<GeneratedFile[]>([]);
  const [qualityRuns, setQualityRuns] = useState<QualityRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [runningQuality, setRunningQuality] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}`);
      if (!res.ok) throw new Error("プロジェクトの取得に失敗しました");
      const data = await res.json();
      setProject(data.project);
      setFiles(data.generatedFiles ?? []);
      setQualityRuns(data.qualityRuns ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "不明なエラー");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const exportFiles = async () => {
    setExporting(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/export-files`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "エクスポートに失敗しました");
      }
      await fetchData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "不明なエラー");
    } finally {
      setExporting(false);
    }
  };

  const runQualityGate = async () => {
    setRunningQuality(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/run-quality-gate`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "品質ゲートに失敗しました");
      }
      await fetchData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "不明なエラー");
    } finally {
      setRunningQuality(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center gap-4">
          <Skeleton className="h-9 w-9 rounded-lg" />
          <div className="space-y-2">
            <Skeleton className="h-7 w-32" />
            <Skeleton className="h-4 w-48" />
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-44 rounded-xl" />
          <Skeleton className="h-44 rounded-xl" />
        </div>
        <Skeleton className="h-64 rounded-xl" />
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

  const latestQuality = qualityRuns[0] ?? null;
  const qualitySteps = latestQuality?.steps_json ?? [];
  const groupedFiles = groupFilesByDirectory(files);

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
          <h1 className="text-2xl font-semibold tracking-tight">デプロイ</h1>
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

      {/* Action Cards */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent pointer-events-none" />
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                <Download className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle>ファイルエクスポート</CardTitle>
                <CardDescription>
                  生成されたコードをファイルシステムにエクスポートします。
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Button onClick={exportFiles} disabled={exporting}>
              {exporting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              エクスポート
            </Button>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent pointer-events-none" />
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50">
                <ShieldCheck className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <CardTitle>品質ゲート</CardTitle>
                <CardDescription>
                  生成されたコードに対してLint、型チェック、テストを実行します。
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              onClick={runQualityGate}
              disabled={runningQuality}
            >
              {runningQuality ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              品質ゲートを実行
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Quality Results */}
      {latestQuality && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                <CardTitle>品質ゲート結果</CardTitle>
              </div>
              <Badge
                variant={
                  latestQuality.status === "passed"
                    ? "success"
                    : latestQuality.status === "failed"
                      ? "destructive"
                      : "secondary"
                }
                className="capitalize"
              >
                {latestQuality.status}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {qualitySteps.map((step) => (
                <div
                  key={step.key}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5",
                    step.status === "passed" && "bg-emerald-50/50",
                    step.status === "failed" && "bg-destructive/5"
                  )}
                >
                  {step.status === "passed" ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                  ) : step.status === "failed" ? (
                    <XCircle className="h-4 w-4 shrink-0 text-destructive" />
                  ) : (
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
                  )}
                  <span className="text-sm font-medium">
                    {step.label || step.key}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Generated Files */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <FileCode className="h-4 w-4 text-muted-foreground" />
            <CardTitle>生成ファイル ({files.length})</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {files.length === 0 ? (
            <EmptyState
              icon={FileCode}
              title="ファイルが生成されていません"
              description="まず生成パイプラインを実行してコードファイルを作成してください。"
            />
          ) : (
            <div className="max-h-96 overflow-y-auto space-y-4">
              {groupedFiles.map(([dir, dirFiles]) => (
                <div key={dir}>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Folder className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs font-medium text-muted-foreground font-mono">
                      {dir}
                    </span>
                  </div>
                  <div className="ml-2 space-y-0.5 border-l-2 border-muted pl-3">
                    {dirFiles.map((file) => (
                      <div
                        key={file.id}
                        className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted/50"
                      >
                        <File className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="flex-1 truncate font-mono text-xs">
                          {file.file_path.split("/").pop()}
                        </span>
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">
                          {file.file_type}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
