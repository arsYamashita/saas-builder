"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import type { ImplementationRunType } from "@/types/implementation-run";
import { extractBlueprintSummary } from "@/lib/projects/blueprint-preview";
import { computeBlueprintDiff } from "@/lib/projects/blueprint-diff";
import { toGenerationProgress } from "@/lib/projects/generation-progress";
import { toQualityProgress } from "@/lib/projects/quality-progress";
import { buildGeneratedProjectSummary } from "@/lib/projects/generated-project-summary";

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
  const [pollingTarget, setPollingTarget] = useState<"generation" | "quality" | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchProject = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}`);
      if (!res.ok) throw new Error("Failed to fetch project");
      const json = await res.json();
      setData(json);
      return json as ProjectData;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
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
    setPollingTarget(null);
  }, []);

  const startPolling = useCallback(
    (target: "generation" | "quality") => {
      stopPolling();
      setPollingTarget(target);
      pollingRef.current = setInterval(async () => {
        const result = await fetchProject();
        if (!result) return;

        if (target === "generation") {
          const latest = result.generationRuns?.[0];
          if (!latest || latest.status === "completed" || latest.status === "failed") {
            stopPolling();
          }
        } else {
          const latest = result.qualityRuns?.[0];
          if (!latest || latest.status === "passed" || latest.status === "failed") {
            stopPolling();
          }
        }
      }, 3000);
    },
    [fetchProject, stopPolling]
  );

  useEffect(() => {
    fetchProject();
    return () => stopPolling();
  }, [fetchProject, stopPolling]);

  async function handleGenerate(
    endpoint: string,
    label: string
  ) {
    setGenerating(label);
    setError(null);

    if (endpoint === "generate-template") {
      startPolling("generation");
    } else if (endpoint === "run-quality-gate") {
      startPolling("quality");
    }

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
      stopPolling();
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

      {/* Generation Progress (active run) */}
      {(() => {
        const latestRun = data.generationRuns?.[0];
        if (!latestRun) return null;
        const progress = toGenerationProgress(latestRun);
        if (!progress.isActive && pollingTarget !== "generation" && generating !== "Generate Full Template") return null;
        return (
          <section className="border-2 border-blue-300 rounded-xl p-4 space-y-3 bg-blue-50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="font-semibold">Generation Progress</h2>
                <span
                  className={`inline-block px-2 py-0.5 text-xs font-medium rounded ${
                    progress.overallStatus === "completed"
                      ? "bg-green-100 text-green-800"
                      : progress.overallStatus === "failed"
                      ? "bg-red-100 text-red-800"
                      : "bg-blue-100 text-blue-800"
                  }`}
                >
                  {progress.overallStatus}
                </span>
              </div>
              <span className="text-xs text-gray-500">
                {progress.completedCount} / {progress.totalCount} steps
              </span>
            </div>

            {/* Progress bar */}
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all duration-500 ${
                  progress.overallStatus === "failed"
                    ? "bg-red-500"
                    : progress.overallStatus === "completed"
                    ? "bg-green-500"
                    : "bg-blue-500"
                }`}
                style={{
                  width: `${
                    progress.totalCount > 0
                      ? (progress.completedCount / progress.totalCount) * 100
                      : 0
                  }%`,
                }}
              />
            </div>

            {/* Steps */}
            <div className="grid gap-1.5">
              {progress.steps.map((step) => (
                <div
                  key={step.key}
                  className="flex items-center justify-between text-sm bg-white rounded px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-block w-2 h-2 rounded-full ${
                        step.status === "completed"
                          ? "bg-green-500"
                          : step.status === "running"
                          ? "bg-blue-500 animate-pulse"
                          : step.status === "failed"
                          ? "bg-red-500"
                          : "bg-gray-300"
                      }`}
                    />
                    <span
                      className={
                        step.status === "running" ? "font-medium" : ""
                      }
                    >
                      {step.label}
                    </span>
                  </div>
                  <span
                    className={`text-xs ${
                      step.status === "completed"
                        ? "text-green-600"
                        : step.status === "running"
                        ? "text-blue-600 font-medium"
                        : step.status === "failed"
                        ? "text-red-600"
                        : "text-gray-400"
                    }`}
                  >
                    {step.status}
                  </span>
                </div>
              ))}
            </div>

            {progress.errorMessage && (
              <pre className="bg-red-50 border border-red-200 p-3 rounded text-xs text-red-700 whitespace-pre-wrap overflow-auto max-h-32">
                {progress.errorMessage}
              </pre>
            )}
          </section>
        );
      })()}

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
          <div>
            <h2 className="font-semibold">Blueprint (Gemini)</h2>
            <p className="text-xs text-gray-500">
              Full Generation の前に Blueprint だけ生成して内容を確認できます
            </p>
          </div>
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
            まだ Blueprint は生成されていません。
          </p>
        ) : (
          (() => {
            const bp = extractBlueprintSummary(latestBlueprint);
            return (
              <div className="space-y-4 text-sm">
                {/* Product Summary */}
                <div className="border rounded-lg p-4 bg-blue-50 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-blue-900">Product Summary</h3>
                    <span className="text-xs text-blue-600">v{bp.version}</span>
                  </div>
                  <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                    <dt className="font-medium text-blue-800">Name</dt>
                    <dd>{bp.product.name || <span className="text-gray-400 italic">未定</span>}</dd>
                    <dt className="font-medium text-blue-800">Problem</dt>
                    <dd>{bp.product.problem || <span className="text-gray-400 italic">未定</span>}</dd>
                    <dt className="font-medium text-blue-800">Target</dt>
                    <dd>{bp.product.target || <span className="text-gray-400 italic">未定</span>}</dd>
                    <dt className="font-medium text-blue-800">Category</dt>
                    <dd>{bp.product.category || <span className="text-gray-400 italic">未定</span>}</dd>
                  </dl>
                  <div className="flex gap-3 pt-1 text-xs">
                    <span className={bp.billingEnabled ? "text-green-700 font-medium" : "text-gray-400"}>
                      Billing: {bp.billingEnabled ? "ON" : "OFF"}
                    </span>
                    <span className={bp.affiliateEnabled ? "text-green-700 font-medium" : "text-gray-400"}>
                      Affiliate: {bp.affiliateEnabled ? "ON" : "OFF"}
                    </span>
                  </div>
                </div>

                {/* Entities */}
                <div>
                  <h3 className="font-medium mb-1">Entities ({bp.entities.length})</h3>
                  {bp.entities.length === 0 ? (
                    <p className="text-gray-400 italic">なし</p>
                  ) : (
                    <div className="grid gap-1">
                      {bp.entities.map((e, i) => (
                        <div key={i} className="flex gap-2 bg-gray-50 rounded px-3 py-1.5">
                          <span className="font-medium shrink-0">{e.name}</span>
                          {e.description && (
                            <span className="text-gray-500 truncate">{e.description}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Roles */}
                <div>
                  <h3 className="font-medium mb-1">Roles ({bp.roles.length})</h3>
                  {bp.roles.length === 0 ? (
                    <p className="text-gray-400 italic">なし</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {bp.roles.map((r, i) => (
                        <span key={i} className="inline-block bg-purple-50 text-purple-800 rounded px-2.5 py-1 text-xs font-medium">
                          {r.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Screens */}
                <div>
                  <h3 className="font-medium mb-1">Screens ({bp.screens.length})</h3>
                  {bp.screens.length === 0 ? (
                    <p className="text-gray-400 italic">なし</p>
                  ) : (
                    <div className="grid gap-1">
                      {bp.screens.map((s, i) => (
                        <div key={i} className="flex items-center gap-2 bg-gray-50 rounded px-3 py-1.5">
                          <span className="font-medium shrink-0">{s.name}</span>
                          {s.path && (
                            <code className="text-xs text-gray-500">{s.path}</code>
                          )}
                          {s.role_access.length > 0 && (
                            <span className="text-xs text-gray-400 ml-auto">
                              {s.role_access.join(", ")}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Raw JSON (collapsible) */}
                <details className="mt-2">
                  <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700">
                    Raw JSON を表示
                  </summary>
                  <div className="mt-2 space-y-2">
                    {(["prd_json", "entities_json", "screens_json", "roles_json", "billing_json", "affiliate_json"] as const).map((key) => (
                      <div key={key}>
                        <p className="text-xs font-medium text-gray-600">{key}</p>
                        <pre className="bg-gray-50 p-2 rounded overflow-auto max-h-36 text-xs">
                          {JSON.stringify(latestBlueprint[key], null, 2)}
                        </pre>
                      </div>
                    ))}
                  </div>
                </details>
              </div>
            );
          })()
        )}
      </section>

      {/* Blueprint Diff */}
      {(() => {
        const diff = computeBlueprintDiff(data.blueprints ?? []);
        if (!diff) return null;
        return (
          <section className="border rounded-xl p-4 space-y-3">
            <h2 className="font-semibold">
              Blueprint Diff{" "}
              <span className="text-xs text-gray-400 font-normal">
                v{diff.previousVersion} → v{diff.latestVersion}
              </span>
            </h2>

            {!diff.hasAnyChange ? (
              <p className="text-sm text-gray-500">前回との差分はありません</p>
            ) : (
              <div className="space-y-3 text-sm">
                {/* Product field changes */}
                {diff.changedFields.length > 0 && (
                  <div>
                    <h3 className="font-medium text-gray-700 mb-1">Product Summary</h3>
                    <div className="space-y-1">
                      {diff.changedFields.map((cf) => (
                        <div key={cf.field} className="bg-gray-50 rounded px-3 py-1.5">
                          <span className="font-medium">{cf.field}: </span>
                          <span className="text-red-600 line-through">{cf.from || "(空)"}</span>
                          <span className="mx-1.5 text-gray-400">→</span>
                          <span className="text-green-700">{cf.to || "(空)"}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Entities */}
                {(diff.addedEntities.length > 0 || diff.removedEntities.length > 0) && (
                  <div>
                    <h3 className="font-medium text-gray-700 mb-1">Entities</h3>
                    <div className="flex flex-wrap gap-1.5">
                      {diff.addedEntities.map((n) => (
                        <span key={`+${n}`} className="inline-block bg-green-100 text-green-800 rounded px-2 py-0.5 text-xs">
                          + {n}
                        </span>
                      ))}
                      {diff.removedEntities.map((n) => (
                        <span key={`-${n}`} className="inline-block bg-red-100 text-red-800 rounded px-2 py-0.5 text-xs">
                          - {n}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Roles */}
                {(diff.addedRoles.length > 0 || diff.removedRoles.length > 0) && (
                  <div>
                    <h3 className="font-medium text-gray-700 mb-1">Roles</h3>
                    <div className="flex flex-wrap gap-1.5">
                      {diff.addedRoles.map((n) => (
                        <span key={`+${n}`} className="inline-block bg-green-100 text-green-800 rounded px-2 py-0.5 text-xs">
                          + {n}
                        </span>
                      ))}
                      {diff.removedRoles.map((n) => (
                        <span key={`-${n}`} className="inline-block bg-red-100 text-red-800 rounded px-2 py-0.5 text-xs">
                          - {n}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Screens */}
                {(diff.addedScreens.length > 0 || diff.removedScreens.length > 0) && (
                  <div>
                    <h3 className="font-medium text-gray-700 mb-1">Screens</h3>
                    <div className="flex flex-wrap gap-1.5">
                      {diff.addedScreens.map((n) => (
                        <span key={`+${n}`} className="inline-block bg-green-100 text-green-800 rounded px-2 py-0.5 text-xs">
                          + {n}
                        </span>
                      ))}
                      {diff.removedScreens.map((n) => (
                        <span key={`-${n}`} className="inline-block bg-red-100 text-red-800 rounded px-2 py-0.5 text-xs">
                          - {n}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Billing / Affiliate */}
                {(diff.billingChanged || diff.affiliateChanged) && (
                  <div className="flex gap-3">
                    {diff.billingChanged && (
                      <span className="text-xs bg-amber-100 text-amber-800 rounded px-2 py-0.5">
                        Billing 変更あり
                      </span>
                    )}
                    {diff.affiliateChanged && (
                      <span className="text-xs bg-amber-100 text-amber-800 rounded px-2 py-0.5">
                        Affiliate 変更あり
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}
          </section>
        );
      })()}

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

      {/* Quality Progress (active run) */}
      {(() => {
        const latestQr = data.qualityRuns?.[0];
        if (!latestQr) return null;
        const qp = toQualityProgress(latestQr);
        if (!qp.isActive && pollingTarget !== "quality" && generating !== "Run Quality Gate") return null;
        return (
          <section className="border-2 border-orange-300 rounded-xl p-4 space-y-3 bg-orange-50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="font-semibold">Quality Gate Progress</h2>
                <span
                  className={`inline-block px-2 py-0.5 text-xs font-medium rounded ${
                    qp.overallStatus === "passed"
                      ? "bg-green-100 text-green-800"
                      : qp.overallStatus === "failed"
                      ? "bg-red-100 text-red-800"
                      : "bg-orange-100 text-orange-800"
                  }`}
                >
                  {qp.overallStatus}
                </span>
              </div>
              <span className="text-xs text-gray-500">
                {qp.passedCount} / {qp.totalCount} checks
              </span>
            </div>

            {/* Progress bar */}
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all duration-500 ${
                  qp.overallStatus === "failed"
                    ? "bg-red-500"
                    : qp.overallStatus === "passed"
                    ? "bg-green-500"
                    : "bg-orange-500"
                }`}
                style={{
                  width: `${
                    qp.totalCount > 0
                      ? (qp.passedCount / qp.totalCount) * 100
                      : 0
                  }%`,
                }}
              />
            </div>

            {/* Checks */}
            <div className="grid gap-1.5">
              {qp.checks.map((check) => (
                <div key={check.key} className="bg-white rounded px-3 py-2">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-block w-2 h-2 rounded-full ${
                          check.status === "passed"
                            ? "bg-green-500"
                            : check.status === "running"
                            ? "bg-orange-500 animate-pulse"
                            : check.status === "failed" || check.status === "error"
                            ? "bg-red-500"
                            : "bg-gray-300"
                        }`}
                      />
                      <span className={check.status === "running" ? "font-medium" : ""}>
                        {check.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {check.durationMs != null && check.durationMs > 0 && (
                        <span className="text-xs text-gray-400">
                          {(check.durationMs / 1000).toFixed(1)}s
                        </span>
                      )}
                      <span
                        className={`text-xs ${
                          check.status === "passed"
                            ? "text-green-600"
                            : check.status === "running"
                            ? "text-orange-600 font-medium"
                            : check.status === "failed" || check.status === "error"
                            ? "text-red-600"
                            : "text-gray-400"
                        }`}
                      >
                        {check.status}
                      </span>
                    </div>
                  </div>
                  {check.errorPreview && (
                    <pre className="mt-1.5 bg-red-50 p-2 rounded text-xs text-red-700 whitespace-pre-wrap overflow-auto max-h-24">
                      {check.errorPreview}
                    </pre>
                  )}
                </div>
              ))}
            </div>

            {qp.summary && (
              <p className="text-sm text-gray-700">{qp.summary}</p>
            )}
          </section>
        );
      })()}

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

      {/* Generated Project Summary */}
      {(() => {
        const summary = buildGeneratedProjectSummary(data);
        if (!summary.hasResults) return null;
        return (
          <section className="border rounded-xl p-4 space-y-4">
            <h2 className="font-semibold">Generated Project Summary</h2>

            {/* Status row */}
            <div className="flex gap-3 flex-wrap">
              {summary.generationStatus && (
                <div
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium ${
                    summary.generationStatus === "completed"
                      ? "bg-green-100 text-green-800"
                      : summary.generationStatus === "failed"
                      ? "bg-red-100 text-red-800"
                      : "bg-blue-100 text-blue-800"
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      summary.generationStatus === "completed"
                        ? "bg-green-500"
                        : summary.generationStatus === "failed"
                        ? "bg-red-500"
                        : "bg-blue-500"
                    }`}
                  />
                  Generation: {summary.generationStatus}
                </div>
              )}
              {summary.qualityStatus && (
                <div
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium ${
                    summary.qualityStatus === "passed"
                      ? "bg-green-100 text-green-800"
                      : summary.qualityStatus === "failed"
                      ? "bg-red-100 text-red-800"
                      : "bg-orange-100 text-orange-800"
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      summary.qualityStatus === "passed"
                        ? "bg-green-500"
                        : summary.qualityStatus === "failed"
                        ? "bg-red-500"
                        : "bg-orange-500"
                    }`}
                  />
                  Quality: {summary.qualityStatus}
                </div>
              )}
              {summary.generationFinishedAt && (
                <span className="text-xs text-gray-400 self-center">
                  {summary.generationFinishedAt}
                </span>
              )}
            </div>

            {/* Counts grid */}
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {[
                { label: "Blueprints", count: summary.blueprintCount },
                { label: "Impl Runs", count: summary.implementationRunCount },
                { label: "Files", count: summary.generatedFileCount },
              ].map((item) => (
                <div
                  key={item.label}
                  className="border rounded-lg p-3 text-center"
                >
                  <div className="text-2xl font-bold text-gray-800">
                    {item.count}
                  </div>
                  <div className="text-xs text-gray-500">{item.label}</div>
                </div>
              ))}
            </div>

            {/* File type breakdown */}
            {summary.generatedFileCount > 0 && (
              <div>
                <h3 className="text-sm font-medium mb-2 text-gray-600">
                  File Types
                </h3>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                  {[
                    { label: "Pages", count: summary.pageCount, color: "bg-blue-50 text-blue-800" },
                    { label: "API Routes", count: summary.apiRouteCount, color: "bg-purple-50 text-purple-800" },
                    { label: "Components", count: summary.componentCount, color: "bg-green-50 text-green-800" },
                    { label: "Tests", count: summary.testCount, color: "bg-orange-50 text-orange-800" },
                    { label: "Lib/Utils", count: summary.libCount, color: "bg-cyan-50 text-cyan-800" },
                    { label: "Other", count: summary.otherCount, color: "bg-gray-50 text-gray-800" },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className={`rounded-lg p-2.5 text-center ${item.color}`}
                    >
                      <div className="text-lg font-bold">{item.count}</div>
                      <div className="text-xs">{item.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Category breakdown */}
            {summary.categoryBreakdown.length > 0 && (
              <details>
                <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700">
                  Category breakdown ({summary.categoryBreakdown.length} categories)
                </summary>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {summary.categoryBreakdown.map((cb) => (
                    <span
                      key={cb.category}
                      className="inline-block bg-gray-100 text-gray-700 rounded px-2 py-0.5 text-xs"
                    >
                      {cb.category}: {cb.count}
                    </span>
                  ))}
                </div>
              </details>
            )}
          </section>
        );
      })()}

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
