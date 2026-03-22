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
      if (!res.ok) throw new Error("Failed to fetch project");
      const data = await res.json();
      setProject(data.project);
      setFiles(data.generatedFiles ?? []);
      setQualityRuns(data.qualityRuns ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
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
        throw new Error(data.error || "Export failed");
      }
      await fetchData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
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
        throw new Error(data.error || "Quality gate failed");
      }
      await fetchData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setRunningQuality(false);
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

  const latestQuality = qualityRuns[0] ?? null;
  const qualitySteps = latestQuality?.steps_json ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href={`/projects/${projectId}`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Deploy</h1>
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

      {/* Actions */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Download className="h-4 w-4" />
              Export Files
            </CardTitle>
            <CardDescription>
              Export generated code to the file system.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={exportFiles} disabled={exporting}>
              {exporting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              Export Files
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="h-4 w-4" />
              Quality Gate
            </CardTitle>
            <CardDescription>
              Run lint, typecheck, and tests on generated code.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              onClick={runQualityGate}
              disabled={runningQuality}
            >
              {runningQuality ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Play className="mr-2 h-4 w-4" />
              )}
              Run Quality Gate
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Quality Results */}
      {latestQuality && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Quality Gate Results</CardTitle>
              <Badge
                variant={
                  latestQuality.status === "passed"
                    ? "success"
                    : latestQuality.status === "failed"
                    ? "destructive"
                    : "secondary"
                }
              >
                {latestQuality.status}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {qualitySteps.map((step) => (
                <div
                  key={step.key}
                  className="flex items-center gap-3 rounded-md border px-3 py-2"
                >
                  {step.status === "passed" ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  ) : step.status === "failed" ? (
                    <XCircle className="h-4 w-4 text-destructive" />
                  ) : (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
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
          <CardTitle className="flex items-center gap-2 text-base">
            <FileCode className="h-4 w-4" />
            Generated Files ({files.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {files.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No files generated yet. Run the generation pipeline first.
            </p>
          ) : (
            <div className="max-h-80 overflow-y-auto space-y-1">
              {files.map((file) => (
                <div
                  key={file.id}
                  className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted/50"
                >
                  <FileCode className="h-3 w-3 text-muted-foreground" />
                  <span className="font-mono text-xs">{file.file_path}</span>
                  <Badge variant="outline" className="ml-auto text-xs">
                    {file.file_type}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
