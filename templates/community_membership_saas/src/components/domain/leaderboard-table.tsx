"use client";

import { useState, useMemo, useCallback } from "react";
import { LevelBadge } from "@/components/domain/level-badge";
import type { LevelConfig } from "@/types/database";
import type { LeaderboardEntry } from "@/lib/gamification";

// ─── Constants ───

const PAGE_SIZE = 20;

const RANK_STYLES: Record<number, { bg: string; text: string; icon: string }> = {
  1: { bg: "bg-amber-50", text: "text-amber-700", icon: "🥇" },
  2: { bg: "bg-gray-50", text: "text-gray-500", icon: "🥈" },
  3: { bg: "bg-orange-50", text: "text-orange-600", icon: "🥉" },
};

// ─── Helper: initials ───

function getInitials(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

// ─── Skeleton ───

function RowSkeleton() {
  return (
    <div className="flex items-center gap-4 px-4 py-3 animate-pulse">
      <div className="w-8 h-5 rounded bg-gray-200" />
      <div className="w-9 h-9 rounded-full bg-gray-200" />
      <div className="flex-1 space-y-1.5">
        <div className="h-3.5 bg-gray-200 rounded w-28" />
        <div className="h-3 bg-gray-100 rounded w-16" />
      </div>
      <div className="h-4 bg-gray-200 rounded w-12" />
    </div>
  );
}

// ─── Types ───

interface LeaderboardTableProps {
  /** Ranked list of members — already sorted by points desc from the API */
  entries: LeaderboardEntry[];
  /** Level configurations for name lookup */
  levelConfigs: LevelConfig[];
  /** Currently authenticated user's ID (for row highlighting) */
  currentUserId?: string | null;
  /** Whether data is currently loading */
  isLoading?: boolean;
  /** Total count of members with points (for "more" logic) */
  totalCount?: number;
  /** Callback when "load more" is triggered */
  onLoadMore?: () => void;
  /** Whether more entries are being loaded */
  isLoadingMore?: boolean;
}

export function LeaderboardTable({
  entries,
  levelConfigs,
  currentUserId,
  isLoading = false,
  totalCount,
  onLoadMore,
  isLoadingMore = false,
}: LeaderboardTableProps) {
  // Level name lookup
  const levelNameMap = useMemo(() => {
    const map = new Map<number, string>();
    for (const config of levelConfigs) {
      map.set(config.level, config.name);
    }
    return map;
  }, [levelConfigs]);

  const hasMore = totalCount !== undefined && entries.length < totalCount;

  // ─── Loading state ───
  if (isLoading) {
    return (
      <div
        className="bg-white rounded-xl border border-gray-200 overflow-hidden"
        aria-busy="true"
        aria-label="ランキングを読み込み中"
      >
        <div className="divide-y divide-gray-100">
          {Array.from({ length: 5 }).map((_, i) => (
            <RowSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  // ─── Empty state ───
  if (entries.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 py-16 text-center">
        <div className="text-4xl mb-3" aria-hidden="true">
          🏆
        </div>
        <p className="text-gray-500 text-sm">
          まだランキングデータがありません
        </p>
        <p className="text-gray-400 text-xs mt-1">
          いいねをもらうとポイントが貯まり、ランキングに表示されます
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Table header */}
      <div className="grid grid-cols-[3rem_1fr_auto_5rem] sm:grid-cols-[3.5rem_1fr_auto_6rem] items-center gap-2 px-4 py-2.5 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wider">
        <span>順位</span>
        <span>メンバー</span>
        <span className="hidden sm:block">レベル</span>
        <span className="text-right">ポイント</span>
      </div>

      {/* Rows */}
      <div
        className="divide-y divide-gray-100"
        role="list"
        aria-label="リーダーボードランキング"
      >
        {entries.map((entry) => {
          const isCurrentUser = currentUserId === entry.user_id;
          const rankStyle = RANK_STYLES[entry.rank];
          const levelName =
            levelNameMap.get(entry.level) ?? entry.level_name ?? `Level ${entry.level}`;

          return (
            <div
              key={entry.user_id}
              role="listitem"
              className={`
                grid grid-cols-[3rem_1fr_auto_5rem] sm:grid-cols-[3.5rem_1fr_auto_6rem]
                items-center gap-2 px-4 py-3
                transition-colors duration-150
                ${isCurrentUser ? "bg-blue-50/60 ring-1 ring-inset ring-blue-200" : "hover:bg-gray-50"}
                ${rankStyle ? `${rankStyle.bg}` : ""}
              `}
              title="いいねをもらうとポイントが貯まります"
            >
              {/* Rank */}
              <div className="flex items-center justify-center">
                {rankStyle ? (
                  <span
                    className="text-lg leading-none"
                    aria-label={`${entry.rank}位`}
                  >
                    {rankStyle.icon}
                  </span>
                ) : (
                  <span
                    className="text-sm font-bold text-gray-400 tabular-nums"
                    aria-label={`${entry.rank}位`}
                  >
                    {entry.rank}
                  </span>
                )}
              </div>

              {/* Avatar + Name */}
              <div className="flex items-center gap-3 min-w-0">
                {entry.avatar_url ? (
                  <img
                    src={entry.avatar_url}
                    alt={`${entry.display_name ?? "メンバー"}のアバター`}
                    className="w-9 h-9 rounded-full object-cover flex-shrink-0"
                    loading="lazy"
                  />
                ) : (
                  <div
                    className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                    aria-hidden="true"
                  >
                    {getInitials(entry.display_name)}
                  </div>
                )}
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-sm font-semibold text-gray-900 truncate">
                      {entry.display_name ?? "名前未設定"}
                    </span>
                    {isCurrentUser && (
                      <span className="text-[10px] font-medium text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded-full leading-none">
                        あなた
                      </span>
                    )}
                  </div>
                  {/* Mobile: show level inline */}
                  <div className="sm:hidden mt-0.5">
                    <LevelBadge level={entry.level} name={levelName} size="sm" compact />
                  </div>
                </div>
              </div>

              {/* Level badge (desktop) */}
              <div className="hidden sm:block">
                <LevelBadge level={entry.level} name={levelName} size="sm" />
              </div>

              {/* Points */}
              <div className="text-right">
                <span className="text-sm font-bold text-gray-900 tabular-nums">
                  {entry.total_points.toLocaleString()}
                </span>
                <span className="text-xs text-gray-400 ml-0.5">pt</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Load more */}
      {hasMore && onLoadMore && (
        <div className="border-t border-gray-100 px-4 py-3 text-center">
          <button
            type="button"
            onClick={onLoadMore}
            disabled={isLoadingMore}
            className={`
              text-sm font-medium text-blue-600 hover:text-blue-700
              transition-colors duration-150
              ${isLoadingMore ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
            `}
            aria-label="さらにメンバーを表示"
          >
            {isLoadingMore ? (
              <span className="inline-flex items-center gap-2">
                <svg
                  className="animate-spin w-4 h-4"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                読み込み中...
              </span>
            ) : (
              "もっと見る"
            )}
          </button>
        </div>
      )}
    </div>
  );
}
