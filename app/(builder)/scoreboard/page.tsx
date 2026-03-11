"use client";

import { useCallback, useEffect, useState } from "react";

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
      <main className="max-w-5xl mx-auto p-6">
        <p className="text-gray-500">Loading...</p>
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="max-w-5xl mx-auto p-6">
        <p className="text-red-500">{error || "Failed to load scoreboard"}</p>
      </main>
    );
  }

  return (
    <main className="max-w-5xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold">Template Scoreboard</h1>
        <p className="text-xs text-gray-500">
          Generated at {new Date(data.generatedAt).toLocaleString("ja-JP")}
        </p>
      </div>

      {data.templates.length === 0 ? (
        <p className="text-sm text-gray-500">
          まだ生成実行がありません。
        </p>
      ) : (
        <div className="space-y-4">
          {data.templates.map((t) => (
            <section
              key={t.templateKey}
              className="border rounded-xl p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-semibold">{t.label}</h2>
                  <p className="text-xs text-gray-500">{t.templateKey}</p>
                </div>
                <div className="flex items-center gap-2">
                  {t.blueprintReviewStatus === "approved" ? (
                    <span className="inline-block bg-green-100 text-green-700 rounded px-2 py-0.5 text-xs font-medium">
                      Blueprint 承認済み
                    </span>
                  ) : t.blueprintReviewStatus === "rejected" ? (
                    <span className="inline-block bg-red-100 text-red-700 rounded px-2 py-0.5 text-xs font-medium">
                      Blueprint 却下
                    </span>
                  ) : t.blueprintReviewStatus ? (
                    <span className="inline-block bg-gray-100 text-gray-500 rounded px-2 py-0.5 text-xs font-medium">
                      Blueprint 未承認
                    </span>
                  ) : null}
                  {t.latestBaselineTag && (
                    <span className="inline-block bg-indigo-100 text-indigo-800 rounded px-2 py-0.5 text-xs font-medium">
                      {t.latestBaselineTag}
                    </span>
                  )}
                </div>
              </div>

              {/* Metrics Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {/* Green Rate */}
                <div className="border rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-green-700">
                    {t.greenRate}%
                  </p>
                  <p className="text-xs text-gray-500">Green Rate</p>
                  <p className="text-xs text-gray-400">
                    {t.completedRuns}/{t.totalRuns} runs
                  </p>
                </div>

                {/* Quality Pass Rate */}
                <div className="border rounded-lg p-3 text-center">
                  <p className={`text-2xl font-bold ${t.qualityTotalRuns > 0 ? "text-blue-700" : "text-gray-300"}`}>
                    {t.qualityTotalRuns > 0 ? `${t.qualityPassRate}%` : "N/A"}
                  </p>
                  <p className="text-xs text-gray-500">Quality Pass</p>
                  <p className="text-xs text-gray-400">
                    {t.qualityTotalRuns > 0
                      ? `${t.qualityPassedRuns}/${t.qualityTotalRuns} runs`
                      : "未実行"}
                  </p>
                </div>

                {/* Approval */}
                <div className="border rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-amber-700">
                    {t.approvedRuns}
                  </p>
                  <p className="text-xs text-gray-500">Approved</p>
                  <p className="text-xs text-gray-400">
                    {t.rejectedRuns} rejected
                  </p>
                </div>

                {/* Promoted */}
                <div className="border rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-indigo-700">
                    {t.promotedRuns}
                  </p>
                  <p className="text-xs text-gray-500">Promoted</p>
                  <p className="text-xs text-gray-400">
                    {t.approvedRuns > 0
                      ? `${t.promotionRate}% of approved`
                      : `${t.failedRuns} failed`}
                  </p>
                </div>
              </div>

              {/* Timestamps */}
              <div className="flex gap-4 text-xs text-gray-400">
                {t.lastApprovedAt && (
                  <span>
                    Last approved:{" "}
                    {new Date(t.lastApprovedAt).toLocaleString("ja-JP")}
                  </span>
                )}
                {t.lastPromotedAt && (
                  <span>
                    Last promoted:{" "}
                    {new Date(t.lastPromotedAt).toLocaleString("ja-JP")}
                  </span>
                )}
              </div>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
