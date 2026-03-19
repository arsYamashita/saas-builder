import type { Metadata } from "next";
import { createAdminClient } from "@/lib/db/supabase/admin";
import Link from "next/link";

const TEMPLATE_LABELS: Record<string, string> = {
  membership_content_affiliate: "会員コンテンツ配信",
  reservation_saas: "予約管理 SaaS",
  simple_crm_saas: "顧客管理 CRM",
  community_membership_saas: "コミュニティ会員制",
  internal_admin_ops_saas: "社内管理オペレーション",
};

interface RunData {
  id: string;
  template_key: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  project: { name: string } | null;
  file_count: number;
  quality_passed: boolean;
}

async function getRunData(runId: string): Promise<RunData | null> {
  const supabase = createAdminClient();

  const { data: run, error } = await supabase
    .from("generation_runs")
    .select("id, project_id, template_key, status, started_at, finished_at")
    .eq("id", runId)
    .maybeSingle();

  if (error || !run) return null;

  const { data: project } = await supabase
    .from("projects")
    .select("name")
    .eq("id", run.project_id)
    .maybeSingle();

  const { count: fileCount } = await supabase
    .from("generated_files")
    .select("id", { count: "exact", head: true })
    .eq("project_id", run.project_id);

  const { data: qualityRun } = await supabase
    .from("quality_runs")
    .select("status")
    .eq("generation_run_id", run.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    id: run.id,
    template_key: run.template_key,
    status: run.status,
    started_at: run.started_at,
    finished_at: run.finished_at,
    project: project ? { name: project.name } : null,
    file_count: fileCount ?? 0,
    quality_passed: qualityRun?.status === "passed",
  };
}

function getDurationSeconds(startedAt: string, finishedAt: string | null): number {
  if (!finishedAt) return 0;
  return Math.round(
    (new Date(finishedAt).getTime() - new Date(startedAt).getTime()) / 1000
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ runId: string }>;
}): Promise<Metadata> {
  const { runId } = await params;
  const run = await getRunData(runId);
  if (!run) return { title: "Not Found" };

  const projectName = run.project?.name ?? "SaaS Project";
  const duration = getDurationSeconds(run.started_at, run.finished_at);
  const ogUrl = `/api/og?name=${encodeURIComponent(projectName)}&template=${encodeURIComponent(run.template_key)}&files=${run.file_count}&duration=${duration}&quality=${run.quality_passed ? "passed" : "failed"}`;

  return {
    title: `${projectName} — AI SaaS Builder`,
    description: `${projectName}をAI SaaS Builderで生成しました。${run.file_count}ファイル。`,
    openGraph: {
      title: `${projectName} — AI SaaS Builder`,
      description: `${projectName}をAI SaaS Builderで生成しました。`,
      images: [{ url: ogUrl, width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title: `${projectName} — AI SaaS Builder`,
      images: [ogUrl],
    },
  };
}

export default async function SharePage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;
  const run = await getRunData(runId);

  if (!run) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            ページが見つかりません
          </h1>
          <Link href="/" className="text-blue-600 hover:underline">
            トップページへ
          </Link>
        </div>
      </div>
    );
  }

  const projectName = run.project?.name ?? "SaaS Project";
  const templateLabel = TEMPLATE_LABELS[run.template_key] ?? run.template_key;
  const duration = getDurationSeconds(run.started_at, run.finished_at);
  const min = Math.floor(duration / 60);
  const sec = duration % 60;
  const durationText = min > 0 ? `${min}分${sec}秒` : `${sec}秒`;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-4">
      <div className="max-w-lg w-full">
        <div className="bg-white/10 backdrop-blur rounded-2xl p-8 text-white">
          <p className="text-slate-400 text-sm mb-2">AI SaaS Builder</p>
          <h1 className="text-3xl font-bold mb-4">{projectName}</h1>

          {templateLabel && (
            <span className="inline-block bg-blue-800/50 text-blue-300 text-sm px-3 py-1 rounded-full mb-6">
              {templateLabel}
            </span>
          )}

          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="bg-white/5 rounded-lg p-4">
              <p className="text-slate-400 text-xs mb-1">ファイル数</p>
              <p className="text-2xl font-bold">{run.file_count}</p>
            </div>
            <div className="bg-white/5 rounded-lg p-4">
              <p className="text-slate-400 text-xs mb-1">生成時間</p>
              <p className="text-2xl font-bold">{durationText}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 mb-8">
            <span
              className={`inline-block w-2 h-2 rounded-full ${
                run.quality_passed ? "bg-green-400" : "bg-red-400"
              }`}
            />
            <span className="text-sm text-slate-300">
              品質ゲート: {run.quality_passed ? "全パス" : "未通過"}
            </span>
          </div>

          <p className="text-slate-500 text-xs mb-6">
            SaaSを、つくれる人に。
          </p>

          <Link
            href="/"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-white text-slate-900 text-sm font-medium rounded-lg hover:bg-slate-100 transition-colors"
          >
            AI SaaS Builder を試す
          </Link>
        </div>
      </div>
    </div>
  );
}
