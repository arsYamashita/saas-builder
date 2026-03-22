"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
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
import {
  ArrowLeft,
  Play,
  Loader2,
  CheckCircle2,
  Circle,
  XCircle,
  AlertCircle,
  FileCode,
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

const stepIcons: Record<StepStatus, React.ReactNode> = {
  pending: <Circle className="h-4 w-4 text-muted-foreground" />,
  running: <Loader2 className="h-4 w-4 animate-spin text-blue-500" />,
  completed: <CheckCircle2 className="h-4 w-4 text-emerald-500" />,
  failed: <XCircle className="h-4 w-4 text-destructive" />,
  skipped: <Circle className="h-4 w-4 text-muted-foreground/50" />,
};

export default function GeneratePage() {
  const { projectId } = useParams<{ projectId: string }>();
  const router = useRouter();
  const [project, setProject] = useState<any>(null);
  const [latestRun, setLatestRun] = useState<GenerationRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}`);
      if (!res.ok) throw new Error("Failed to fetch project");
      const data = await res.json();
      setProject(data.project);
      if (data.generationRuns?.length > 0) {
        setLatestRun(data.generationRuns[0]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Poll while generating
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
        throw new Error(data.error || `Failed to ${label}`);
      }
      await fetchData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Project not found.</p>
      </div>
    );
  }

  const steps = latestRun?.steps_json ?? [];
  const completedSteps = steps.filter((s) => s.status === "completed").length;
  const isRunning = latestRun?.status === "running";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href={`/projects/${projectId}`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Generate Code</h1>
          <p className="text-sm text-muted-foreground">{project.name}</p>
        </div>
      </div>

      {error && (
        <Card className="border-destructive">
          <CardContent className="flex items-center gap-2 py-3">
            <AlertCircle className="h-4 w-4 text-destructive" />
            <p className="text-sm text-destructive">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Generation Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Generation Pipeline</CardTitle>
          <CardDescription>
            Run AI-powered code generation for your project.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button
            onClick={() => startGeneration("generate-template", "generate template")}
            disabled={generating || isRunning}
          >
            {generating ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Play className="mr-2 h-4 w-4" />
            )}
            Generate Template
          </Button>
          <Button
            variant="outline"
            onClick={() => startGeneration("generate-api-design", "generate API design")}
            disabled={generating || isRunning}
          >
            Generate API Design
          </Button>
          <Button
            variant="outline"
            onClick={() => startGeneration("generate-schema", "generate schema")}
            disabled={generating || isRunning}
          >
            Generate Schema
          </Button>
          <Button
            variant="outline"
            onClick={() => startGeneration("generate-implementation", "generate implementation")}
            disabled={generating || isRunning}
          >
            Generate Implementation
          </Button>
        </CardContent>
      </Card>

      {/* Latest Generation Run */}
      {latestRun && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Latest Generation Run</CardTitle>
              <Badge
                variant={
                  latestRun.status === "completed"
                    ? "success"
                    : latestRun.status === "failed"
                    ? "destructive"
                    : latestRun.status === "running"
                    ? "warning"
                    : "secondary"
                }
              >
                {latestRun.status}
              </Badge>
            </div>
            <CardDescription>
              {completedSteps}/{steps.length} steps completed
              {latestRun.started_at &&
                ` — Started ${new Date(latestRun.started_at).toLocaleString("ja-JP")}`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {steps.map((step) => (
                <div
                  key={step.key}
                  className="flex items-center gap-3 rounded-md border px-3 py-2"
                >
                  {stepIcons[step.status] ?? stepIcons.pending}
                  <span className="flex-1 text-sm font-medium">
                    {step.label || step.key}
                  </span>
                  {step.meta?.provider && (
                    <span className="text-xs text-muted-foreground">
                      {step.meta.provider}
                    </span>
                  )}
                  {step.meta?.durationMs != null && (
                    <span className="text-xs text-muted-foreground">
                      {(step.meta.durationMs / 1000).toFixed(1)}s
                    </span>
                  )}
                </div>
              ))}
              {steps.length === 0 && (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No steps recorded yet.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Navigation */}
      <div className="flex gap-3">
        <Button variant="outline" asChild>
          <Link href={`/projects/${projectId}/blueprint`}>View Blueprint</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href={`/projects/${projectId}/deploy`}>
            <FileCode className="mr-2 h-4 w-4" />
            Deploy
          </Link>
        </Button>
      </div>
    </div>
  );
}
