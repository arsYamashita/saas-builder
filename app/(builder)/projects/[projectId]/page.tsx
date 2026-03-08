"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type { ImplementationRunType } from "@/types/implementation-run";

type ImplementationRun = {
  id: string;
  run_type: ImplementationRunType;
  version: number;
  status: string;
  output_text: string;
  created_at: string;
};

type GenerationRunData = {
  id: string;
  template_key: string;
  status: string;
  current_step?: string | null;
  steps_json: Array<{
    key: string;
    label: string;
    status: string;
  }>;
  error_message?: string | null;
  started_at: string;
  finished_at?: string | null;
};

type QualityCheckData = {
  key: string;
  label: string;
  status: string;
  stdout?: string | null;
  stderr?: string | null;
  exitCode?: number | null;
  durationMs?: number | null;
};

type QualityRunData = {
  id: string;
  project_id: string;
  generation_run_id?: string | null;
  status: string;
  checks_json: QualityCheckData[];
  summary?: string | null;
  started_at: string;
  finished_at?: string | null;
};

type ProjectData = {
  project: {
    id: string;
    name: string;
    description: string | null;
    template_key: string;
    status: string;
  };
  blueprints: Array<{
    id: string;
    version: number;
    prd_json: unknown;
    entities_json: unknown;
    screens_json: unknown;
    roles_json: unknown;
    billing_json: unknown;
    affiliate_json: unknown;
  }>;
  implementationRuns: ImplementationRun[];
  generatedFiles: Array<{
    id: string;
    file_category: string;
    file_path: string;
    language: string;
    version: number;
    status: string;
    source: string;
    content_text: string;
    title?: string | null;
    description?: string | null;
    created_at: string;
  }>;
  generationRuns: GenerationRunData[];
  qualityRuns: QualityRunData[];
};

function getLatestRun(
  runs: ImplementationRun[],
  type: ImplementationRunType
): ImplementationRun | undefined {
  return runs
    .filter((r) => r.run_type === type)
    .sort((a, b) => b.version - a.version)[0];
}

export default function ProjectDetailPage() {
  const params = useParams();
  const projectId = params.projectId as string;

  const [data, setData] = useState<ProjectData | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function fetchProject() {
    try {
      const res = await fetch(`/api/projects/${projectId}`);
      if (!res.ok) throw new Error("Failed to fetch project");
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchProject();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function handleGenerate(
    endpoint: string,
    label: string
  ) {
    setGenerating(label);
    setError(null);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/${endpoint}`,
        { method: "POST" }
      );
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || `Failed to ${label}`);
      }
      await fetchProject();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setGenerating(null);
    }
  }

  if (loading) {
    return (
      <main className="max-w-5xl mx-auto p-6">
        <p className="text-gray-500">Loading...</p>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="max-w-5xl mx-auto p-6">
        <p className="text-red-500">{error || "Project not found"}</p>
      </main>
    );
  }

  const latestBlueprint = data.blueprints?.[0];
  const runs = data.implementationRuns ?? [];
  const implRun = getLatestRun(runs, "implementation_plan");
  const schemaRun = getLatestRun(runs, "schema_sql");
  const apiRun = getLatestRun(runs, "api_design");

  const hasBlueprint = !!latestBlueprint;
  const hasSchema = !!schemaRun;

  return (
    <main className="max-w-5xl mx-auto p-6 space-y-6">
      <header>
        <h1 className="text-2xl font-bold">{data.project.name}</h1>
        <p className="text-sm text-gray-500">
          template: {data.project.template_key} / status:{" "}
          {data.project.status}
        </p>
      </header>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded">
          {error}
        </div>
      )}

      <section className="border rounded-xl p-4 space-y-2">
        <h2 className="font-semibold">Project Summary</h2>
        <p className="text-sm text-gray-700">{data.project.description}</p>
      </section>

      {/* Generate Full Template */}
      <section className="border rounded-xl p-4 space-y-3 bg-gradient-to-r from-purple-50 to-blue-50">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold">1-Click Full Generation</h2>
            <p className="text-xs text-gray-500">
              Blueprint → Implementation → Schema → API Design → File Split → Export を一括実行
            </p>
          </div>
          <button
            onClick={() =>
              handleGenerate("generate-template", "Generate Full Template")
            }
            disabled={!!generating}
            className="px-6 py-3 rounded bg-black text-white font-medium disabled:opacity-50"
          >
            {generating === "Generate Full Template"
              ? "Generating..."
              : "Generate Full Template"}
          </button>
        </div>
      </section>

      {/* Generation Runs */}
      <section className="border rounded-xl p-4">
        <h2 className="font-semibold mb-3">Generation Runs</h2>

        {!data.generationRuns || data.generationRuns.length === 0 ? (
          <p className="text-sm text-gray-500">まだ実行履歴はありません。</p>
        ) : (
          <div className="space-y-4">
            {data.generationRuns.map((run) => (
              <div key={run.id} className="border rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{run.template_key}</p>
                    <p className="text-xs text-gray-500">
                      status: {run.status}
                    </p>
                  </div>
                  <div className="text-xs text-gray-500">
                    {run.started_at}
                  </div>
                </div>

                <div className="mt-3 space-y-2">
                  {(run.steps_json ?? []).map((step) => (
                    <div
                      key={step.key}
                      className="flex items-center justify-between text-sm border rounded px-3 py-2"
                    >
                      <span>{step.label}</span>
                      <span
                        className={
                          step.status === "completed"
                            ? "text-green-600"
                            : step.status === "running"
                            ? "text-blue-600"
                            : step.status === "failed"
                            ? "text-red-600"
                            : "text-gray-400"
                        }
                      >
                        {step.status}
                      </span>
                    </div>
                  ))}
                </div>

                {run.error_message && (
                  <pre className="mt-3 bg-red-50 p-3 rounded text-xs whitespace-pre-wrap overflow-auto">
                    {run.error_message}
                  </pre>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Generate Blueprint */}
      <section className="border rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Blueprint (Gemini)</h2>
          <button
            onClick={() =>
              handleGenerate("generate-blueprint", "Generate Blueprint")
            }
            disabled={!!generating}
            className="px-4 py-2 rounded bg-blue-600 text-white text-sm disabled:opacity-50"
          >
            {generating === "Generate Blueprint"
              ? "Generating..."
              : "Generate Blueprint"}
          </button>
        </div>

        {!latestBlueprint ? (
          <p className="text-sm text-gray-500">
            まだBlueprintは生成されていません。
          </p>
        ) : (
          <div className="space-y-4 text-sm">
            <div>
              <h3 className="font-medium">Product Summary</h3>
              <pre className="bg-gray-50 p-3 rounded overflow-auto max-h-48">
                {JSON.stringify(latestBlueprint.prd_json, null, 2)}
              </pre>
            </div>
            <div>
              <h3 className="font-medium">Entities</h3>
              <pre className="bg-gray-50 p-3 rounded overflow-auto max-h-48">
                {JSON.stringify(latestBlueprint.entities_json, null, 2)}
              </pre>
            </div>
            <div>
              <h3 className="font-medium">Screens</h3>
              <pre className="bg-gray-50 p-3 rounded overflow-auto max-h-48">
                {JSON.stringify(latestBlueprint.screens_json, null, 2)}
              </pre>
            </div>
            <div>
              <h3 className="font-medium">Roles</h3>
              <pre className="bg-gray-50 p-3 rounded overflow-auto max-h-48">
                {JSON.stringify(latestBlueprint.roles_json, null, 2)}
              </pre>
            </div>
            <div>
              <h3 className="font-medium">Billing</h3>
              <pre className="bg-gray-50 p-3 rounded overflow-auto max-h-48">
                {JSON.stringify(latestBlueprint.billing_json, null, 2)}
              </pre>
            </div>
            <div>
              <h3 className="font-medium">Affiliate</h3>
              <pre className="bg-gray-50 p-3 rounded overflow-auto max-h-48">
                {JSON.stringify(latestBlueprint.affiliate_json, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </section>

      {/* Claude Generation Buttons */}
      <section className="border rounded-xl p-4 space-y-4">
        <h2 className="font-semibold">Claude Implementation Line</h2>

        <div className="flex gap-3 flex-wrap">
          <button
            onClick={() =>
              handleGenerate(
                "generate-implementation",
                "Generate Implementation Plan"
              )
            }
            disabled={!hasBlueprint || !!generating}
            className="px-4 py-2 rounded bg-purple-600 text-white text-sm disabled:opacity-50"
          >
            {generating === "Generate Implementation Plan"
              ? "Generating..."
              : "Generate Implementation Plan"}
          </button>

          <button
            onClick={() =>
              handleGenerate("generate-schema", "Generate Schema")
            }
            disabled={!hasBlueprint || !!generating}
            className="px-4 py-2 rounded bg-green-600 text-white text-sm disabled:opacity-50"
          >
            {generating === "Generate Schema"
              ? "Generating..."
              : "Generate Schema"}
          </button>

          <button
            onClick={() =>
              handleGenerate("generate-api-design", "Generate API Design")
            }
            disabled={!hasBlueprint || !hasSchema || !!generating}
            className="px-4 py-2 rounded bg-orange-600 text-white text-sm disabled:opacity-50"
          >
            {generating === "Generate API Design"
              ? "Generating..."
              : "Generate API Design"}
          </button>
        </div>

        {!hasBlueprint && (
          <p className="text-sm text-gray-500">
            Blueprintを先に生成してください。
          </p>
        )}

        {hasBlueprint && !hasSchema && (
          <p className="text-sm text-gray-500">
            API Designの生成にはSchemaが必要です。先にSchemaを生成してください。
          </p>
        )}
      </section>

      {/* Implementation Plan */}
      <section className="border rounded-xl p-4 space-y-2">
        <h2 className="font-semibold">
          Implementation Plan{" "}
          {implRun && (
            <span className="text-xs text-gray-400">v{implRun.version}</span>
          )}
        </h2>
        {implRun ? (
          <pre className="bg-gray-50 p-3 rounded text-sm overflow-auto max-h-96 whitespace-pre-wrap">
            {implRun.output_text}
          </pre>
        ) : (
          <p className="text-sm text-gray-500">未生成</p>
        )}
      </section>

      {/* Schema SQL */}
      <section className="border rounded-xl p-4 space-y-2">
        <h2 className="font-semibold">
          Schema SQL{" "}
          {schemaRun && (
            <span className="text-xs text-gray-400">v{schemaRun.version}</span>
          )}
        </h2>
        {schemaRun ? (
          <pre className="bg-gray-50 p-3 rounded text-sm overflow-auto max-h-96 whitespace-pre-wrap">
            {schemaRun.output_text}
          </pre>
        ) : (
          <p className="text-sm text-gray-500">未生成</p>
        )}
      </section>

      {/* API Design */}
      <section className="border rounded-xl p-4 space-y-2">
        <h2 className="font-semibold">
          API Design{" "}
          {apiRun && (
            <span className="text-xs text-gray-400">v{apiRun.version}</span>
          )}
        </h2>
        {apiRun ? (
          <pre className="bg-gray-50 p-3 rounded text-sm overflow-auto max-h-96 whitespace-pre-wrap">
            {apiRun.output_text}
          </pre>
        ) : (
          <p className="text-sm text-gray-500">未生成</p>
        )}
      </section>

      {/* Save Actions */}
      <section className="border rounded-xl p-4 space-y-4">
        <h2 className="font-semibold">Save to Generated Files</h2>

        <div className="flex gap-3 flex-wrap">
          <button
            onClick={() =>
              handleGenerate(
                "split-run-to-files",
                "Split Implementation To Files"
              )
            }
            disabled={!implRun || !!generating}
            className="px-4 py-2 rounded border text-sm disabled:opacity-50"
          >
            {generating === "Split Implementation To Files"
              ? "Splitting..."
              : "Split Implementation To Files"}
          </button>

          <button
            onClick={() =>
              handleGenerate(
                "save-schema-migration",
                "Save Schema As Migration"
              )
            }
            disabled={!schemaRun || !!generating}
            className="px-4 py-2 rounded border text-sm disabled:opacity-50"
          >
            {generating === "Save Schema As Migration"
              ? "Saving..."
              : "Save Schema As Migration"}
          </button>

          <button
            onClick={() =>
              handleGenerate(
                "save-api-design-file",
                "Save API Design File"
              )
            }
            disabled={!apiRun || !!generating}
            className="px-4 py-2 rounded border text-sm disabled:opacity-50"
          >
            {generating === "Save API Design File"
              ? "Saving..."
              : "Save API Design File"}
          </button>
        </div>

        {!implRun && !schemaRun && !apiRun && (
          <p className="text-sm text-gray-500">
            保存するにはClaude生成を先に実行してください。
          </p>
        )}
      </section>

      {/* Export */}
      <section className="border rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Export to Local</h2>
          <button
            onClick={() =>
              handleGenerate("export-files", "Export Generated Files")
            }
            disabled={
              !data.generatedFiles ||
              data.generatedFiles.length === 0 ||
              !!generating
            }
            className="px-4 py-2 rounded bg-gray-800 text-white text-sm disabled:opacity-50"
          >
            {generating === "Export Generated Files"
              ? "Exporting..."
              : "Export Generated Files"}
          </button>
        </div>
        <p className="text-xs text-gray-500">
          generated_files の最新版を exports/projects/{"{projectId}"}/
          へ書き出します。
        </p>
      </section>

      {/* Quality Gate */}
      <section className="border rounded-xl p-4 space-y-3 bg-gradient-to-r from-yellow-50 to-orange-50">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold">Quality Gate</h2>
            <p className="text-xs text-gray-500">
              ESLint + TypeScript Check + Playwright E2E を実行
            </p>
          </div>
          <button
            onClick={() =>
              handleGenerate("run-quality-gate", "Run Quality Gate")
            }
            disabled={!!generating}
            className="px-5 py-2 rounded bg-orange-600 text-white font-medium text-sm disabled:opacity-50"
          >
            {generating === "Run Quality Gate"
              ? "Running..."
              : "Run Quality Gate"}
          </button>
        </div>
      </section>

      {/* Quality Runs */}
      <section className="border rounded-xl p-4">
        <h2 className="font-semibold mb-3">Quality Runs</h2>

        {!data.qualityRuns || data.qualityRuns.length === 0 ? (
          <p className="text-sm text-gray-500">まだ品質チェックは実行されていません。</p>
        ) : (
          <div className="space-y-4">
            {data.qualityRuns.map((qr) => (
              <div key={qr.id} className="border rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-block w-3 h-3 rounded-full ${
                        qr.status === "passed"
                          ? "bg-green-500"
                          : qr.status === "failed"
                          ? "bg-red-500"
                          : qr.status === "running"
                          ? "bg-blue-500"
                          : "bg-gray-400"
                      }`}
                    />
                    <span className="font-medium">{qr.status}</span>
                  </div>
                  <div className="text-xs text-gray-500">
                    {qr.started_at}
                  </div>
                </div>

                {qr.summary && (
                  <p className="mt-2 text-sm text-gray-700">{qr.summary}</p>
                )}

                <div className="mt-3 space-y-2">
                  {(qr.checks_json ?? []).map((check) => (
                    <div key={check.key} className="border rounded px-3 py-2">
                      <div className="flex items-center justify-between text-sm">
                        <span>{check.label}</span>
                        <span
                          className={
                            check.status === "passed"
                              ? "text-green-600 font-medium"
                              : check.status === "failed"
                              ? "text-red-600 font-medium"
                              : check.status === "running"
                              ? "text-blue-600"
                              : check.status === "error"
                              ? "text-orange-600 font-medium"
                              : "text-gray-400"
                          }
                        >
                          {check.status}
                          {check.exitCode != null && check.exitCode !== 0 && (
                            <span className="ml-1 text-xs">
                              (exit {check.exitCode})
                            </span>
                          )}
                          {check.durationMs != null && check.durationMs > 0 && (
                            <span className="ml-1 text-xs text-gray-400">
                              {(check.durationMs / 1000).toFixed(1)}s
                            </span>
                          )}
                        </span>
                      </div>

                      {(check.stdout || check.stderr) && (
                        <details className="mt-2">
                          <summary className="text-xs text-gray-500 cursor-pointer">
                            Output
                          </summary>
                          {check.stdout && (
                            <pre className="mt-1 bg-gray-50 p-2 rounded text-xs whitespace-pre-wrap overflow-auto max-h-48">
                              {check.stdout}
                            </pre>
                          )}
                          {check.stderr && (
                            <pre className="mt-1 bg-red-50 p-2 rounded text-xs whitespace-pre-wrap overflow-auto max-h-48">
                              {check.stderr}
                            </pre>
                          )}
                        </details>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Generated Files */}
      <section className="border rounded-xl p-4">
        <h2 className="font-semibold mb-3">Generated Files</h2>

        {!data.generatedFiles || data.generatedFiles.length === 0 ? (
          <p className="text-sm text-gray-500">
            まだ生成ファイルはありません。
          </p>
        ) : (
          <div className="space-y-3">
            {data.generatedFiles.map((file) => (
              <div key={file.id} className="border rounded-lg p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-sm">{file.file_path}</p>
                    <p className="text-xs text-gray-500">
                      {file.file_category} / {file.language} / v{file.version}
                    </p>
                  </div>
                  <div className="text-xs text-gray-500">{file.source}</div>
                </div>

                <pre className="mt-3 bg-gray-50 p-3 rounded overflow-auto text-xs whitespace-pre-wrap max-h-64">
                  {file.content_text}
                </pre>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
