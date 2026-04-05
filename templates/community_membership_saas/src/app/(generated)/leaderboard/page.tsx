"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { LeaderboardTable } from "@/components/domain/leaderboard-table";
import { LevelBadge } from "@/components/domain/level-badge";
import type { LevelConfig } from "@/types/database";
import { DEFAULT_LEVEL_THRESHOLDS } from "@/types/database";
import type { LeaderboardEntry, MemberPointsInfo } from "@/lib/gamification";

// ─── Constants ───

const PAGE_SIZE = 20;

// ─── Level explanation data (static fallback) ───

function getLevelTierLabel(level: number): string {
  if (level <= 3) return "初心者";
  if (level <= 6) return "中級者";
  if (level <= 8) return "上級者";
  return "最上位";
}

// ─── Skeleton ───

function MyRankSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 animate-pulse">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-full bg-gray-200" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-gray-200 rounded w-24" />
          <div className="h-3 bg-gray-100 rounded w-32" />
        </div>
        <div className="h-8 bg-gray-200 rounded w-16" />
      </div>
    </div>
  );
}

// ─── Page ───

export default function LeaderboardPage() {
  // Tenant context — in production this comes from auth context or middleware
  const tenantSlug =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("tenantSlug") ?? ""
      : "";
  const tenantId =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("tenantId") ?? ""
      : "";

  // State
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [levelConfigs, setLevelConfigs] = useState<LevelConfig[]>([]);
  const [myPoints, setMyPoints] = useState<MemberPointsInfo | null>(null);
  const [myRank, setMyRank] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [totalCount, setTotalCount] = useState<number | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [showLevelExplainer, setShowLevelExplainer] = useState(false);

  // Fetch leaderboard
  const fetchLeaderboard = useCallback(async () => {
    if (!tenantSlug && !tenantId) return;

    setIsLoading(true);
    setError(null);

    try {
      // Fetch leaderboard (public API uses tenantSlug)
      const slug = tenantSlug || tenantId;
      const leaderboardRes = await fetch(
        `/api/public/tenants/${slug}/leaderboard`
      );

      if (!leaderboardRes.ok) {
        throw new Error("リーダーボードの取得に失敗しました");
      }

      const leaderboardData = await leaderboardRes.json();
      setEntries(leaderboardData.leaderboard ?? []);

      if (leaderboardData.total_count !== undefined) {
        setTotalCount(leaderboardData.total_count);
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "データの取得中にエラーが発生しました"
      );
    } finally {
      setIsLoading(false);
    }
  }, [tenantSlug, tenantId]);

  // Fetch level configs
  const fetchLevelConfigs = useCallback(async () => {
    if (!tenantId) {
      // Use defaults if no tenantId for config fetch
      setLevelConfigs(
        DEFAULT_LEVEL_THRESHOLDS.map((t) => ({
          tenant_id: "",
          level: t.level,
          name: t.name,
          min_points: t.min_points,
          rewards: null,
        }))
      );
      return;
    }

    try {
      const res = await fetch(
        `/api/admin/tenants/${tenantId}/level-configs`
      );
      if (res.ok) {
        const data = await res.json();
        setLevelConfigs(data.level_configs ?? []);
      } else {
        // Fallback to defaults
        setLevelConfigs(
          DEFAULT_LEVEL_THRESHOLDS.map((t) => ({
            tenant_id: tenantId,
            level: t.level,
            name: t.name,
            min_points: t.min_points,
            rewards: null,
          }))
        );
      }
    } catch {
      setLevelConfigs(
        DEFAULT_LEVEL_THRESHOLDS.map((t) => ({
          tenant_id: tenantId,
          level: t.level,
          name: t.name,
          min_points: t.min_points,
          rewards: null,
        }))
      );
    }
  }, [tenantId]);

  // Fetch my points
  const fetchMyPoints = useCallback(async () => {
    if (!tenantId) return;

    try {
      const res = await fetch(`/api/me/points?tenant_id=${tenantId}`);
      if (res.ok) {
        const data = await res.json();
        setMyPoints({
          total_points: data.total_points,
          level: data.level,
          level_name: data.level_name,
          next_level_name: data.next_level_name,
          points_to_next_level: data.points_to_next_level,
        });
      }
    } catch {
      // User may not be logged in — non-critical
    }
  }, [tenantId]);

  useEffect(() => {
    fetchLeaderboard();
    fetchLevelConfigs();
    fetchMyPoints();
  }, [fetchLeaderboard, fetchLevelConfigs, fetchMyPoints]);

  // Find current user rank in entries
  useEffect(() => {
    if (!myPoints || entries.length === 0) return;
    // We don't have userId easily here, so rank is derived from the entries later if needed
  }, [myPoints, entries]);

  // Load more handler
  const handleLoadMore = useCallback(async () => {
    if (!tenantSlug && !tenantId) return;

    setIsLoadingMore(true);
    try {
      const slug = tenantSlug || tenantId;
      const res = await fetch(
        `/api/public/tenants/${slug}/leaderboard?offset=${entries.length}&limit=${PAGE_SIZE}`
      );
      if (res.ok) {
        const data = await res.json();
        setEntries((prev) => [...prev, ...(data.leaderboard ?? [])]);
      }
    } catch {
      // Silently fail
    } finally {
      setIsLoadingMore(false);
    }
  }, [tenantSlug, tenantId, entries.length]);

  // Sorted level configs for display
  const sortedLevelConfigs = useMemo(
    () => [...levelConfigs].sort((a, b) => a.level - b.level),
    [levelConfigs]
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
          <h1 className="text-2xl font-bold text-gray-900">
            リーダーボード
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            コミュニティで最もアクティブなメンバーをチェックしましょう
          </p>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Error */}
        {error && (
          <div
            className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700"
            role="alert"
          >
            <p className="font-medium">エラー</p>
            <p className="mt-1">{error}</p>
            <button
              type="button"
              onClick={fetchLeaderboard}
              className="mt-2 text-red-600 underline hover:text-red-800 text-xs font-medium"
            >
              再試行する
            </button>
          </div>
        )}

        {/* My rank card */}
        {myPoints ? (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center flex-shrink-0">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="w-6 h-6 text-white"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    d="M7.5 6a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM3.751 20.105a8.25 8.25 0 0116.498 0 .75.75 0 01-.437.695A18.683 18.683 0 0112 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 01-.437-.695z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-gray-900">
                    あなたのステータス
                  </span>
                  <LevelBadge
                    level={myPoints.level}
                    name={myPoints.level_name}
                    size="sm"
                  />
                </div>
                {myPoints.points_to_next_level !== null &&
                  myPoints.next_level_name && (
                    <p className="text-xs text-gray-500 mt-0.5">
                      次のレベル「{myPoints.next_level_name}」まであと
                      <span className="font-semibold text-gray-700 tabular-nums">
                        {myPoints.points_to_next_level.toLocaleString()}
                      </span>
                      ポイント
                    </p>
                  )}
              </div>
              <div className="text-right flex-shrink-0">
                <div className="text-xl font-bold text-gray-900 tabular-nums">
                  {myPoints.total_points.toLocaleString()}
                </div>
                <div className="text-[11px] text-gray-400">ポイント</div>
              </div>
            </div>
          </div>
        ) : isLoading ? (
          <MyRankSkeleton />
        ) : null}

        {/* Level explanation - collapsible */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <button
            type="button"
            onClick={() => setShowLevelExplainer((v) => !v)}
            className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50 transition-colors"
            aria-expanded={showLevelExplainer}
            aria-controls="level-explainer-content"
          >
            <span className="text-sm font-semibold text-gray-900">
              レベルの仕組み
            </span>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className={`w-5 h-5 text-gray-400 transition-transform duration-200 ${
                showLevelExplainer ? "rotate-180" : ""
              }`}
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                clipRule="evenodd"
              />
            </svg>
          </button>

          {showLevelExplainer && (
            <div
              id="level-explainer-content"
              className="px-5 pb-5 border-t border-gray-100"
            >
              {/* Explanation text */}
              <p className="text-sm text-gray-600 leading-relaxed mt-4 mb-5">
                いいねをもらうとポイントが貯まり、ポイントに応じてレベルが上がります。レベルが上がると限定コースやコンテンツがアンロックされます。
              </p>

              {/* Level grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {sortedLevelConfigs.map((config) => (
                  <div
                    key={config.level}
                    className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors"
                  >
                    <LevelBadge
                      level={config.level}
                      name={config.name}
                      size="sm"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs text-gray-400">
                        {config.min_points === 0
                          ? "0 pt ~"
                          : `${config.min_points.toLocaleString()} pt ~`}
                      </div>
                      <div className="text-[10px] text-gray-400">
                        {getLevelTierLabel(config.level)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Point earning hint */}
              <div className="mt-4 flex items-start gap-2 p-3 bg-blue-50 rounded-lg border border-blue-100">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z"
                    clipRule="evenodd"
                  />
                </svg>
                <p className="text-xs text-blue-700 leading-relaxed">
                  <span className="font-semibold">ポイントの貯め方:</span>{" "}
                  いいね1つ = 1ポイント。コミュニティに貢献して、レベルアップを目指しましょう!
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Leaderboard table */}
        <LeaderboardTable
          entries={entries}
          levelConfigs={levelConfigs}
          isLoading={isLoading}
          totalCount={totalCount}
          onLoadMore={handleLoadMore}
          isLoadingMore={isLoadingMore}
        />
      </div>
    </div>
  );
}
