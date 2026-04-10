"use client";

import { useState, useEffect, useCallback } from "react";
import type { LevelConfig } from "@/types/database";
import { DEFAULT_LEVEL_THRESHOLDS } from "@/types/database";

interface LevelFormRow {
  level: number;
  name: string;
  min_points: number;
  rewards: { unlock_course_ids?: string[] } | null;
  isDirty: boolean;
}

function levelToFormRow(config: LevelConfig): LevelFormRow {
  return {
    level: config.level,
    name: config.name,
    min_points: config.min_points,
    rewards: config.rewards,
    isDirty: false,
  };
}

const LEVEL_COLORS: Record<number, string> = {
  1: "bg-gray-100 text-gray-600",
  2: "bg-green-100 text-green-700",
  3: "bg-blue-100 text-blue-700",
  4: "bg-purple-100 text-purple-700",
  5: "bg-yellow-100 text-yellow-800",
  6: "bg-orange-100 text-orange-700",
  7: "bg-red-100 text-red-700",
  8: "bg-pink-100 text-pink-700",
  9: "bg-indigo-100 text-indigo-700",
};

export default function LevelsSettingsPage() {
  const tenantId =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("tenantId") ?? ""
      : "";

  const [levels, setLevels] = useState<LevelFormRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [editingRewardsLevel, setEditingRewardsLevel] = useState<
    number | null
  >(null);
  const [rewardsCourseIds, setRewardsCourseIds] = useState("");

  const fetchLevels = useCallback(async () => {
    if (!tenantId) return;
    setIsLoading(true);
    try {
      const res = await fetch(
        `/api/admin/tenants/${tenantId}/level-configs`
      );
      if (res.ok) {
        const data = await res.json();
        const configs = (data.level_configs ?? []) as LevelConfig[];
        if (configs.length > 0) {
          setLevels(
            configs
              .sort((a, b) => a.level - b.level)
              .map(levelToFormRow)
          );
        } else {
          // Use defaults
          setLevels(
            DEFAULT_LEVEL_THRESHOLDS.map((d) =>
              levelToFormRow({
                tenant_id: tenantId,
                level: d.level,
                name: d.name,
                min_points: d.min_points,
                rewards: null,
              })
            )
          );
        }
      }
    } catch {
      // Fall back to defaults
      setLevels(
        DEFAULT_LEVEL_THRESHOLDS.map((d) =>
          levelToFormRow({
            tenant_id: tenantId,
            level: d.level,
            name: d.name,
            min_points: d.min_points,
            rewards: null,
          })
        )
      );
    } finally {
      setIsLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    fetchLevels();
  }, [fetchLevels]);

  const handleFieldChange = useCallback(
    (level: number, field: "name" | "min_points", value: string | number) => {
      setLevels((prev) =>
        prev.map((row) =>
          row.level === level
            ? { ...row, [field]: value, isDirty: true }
            : row
        )
      );
    },
    []
  );

  const handleSaveRewards = useCallback(
    (level: number) => {
      const courseIds = rewardsCourseIds
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      setLevels((prev) =>
        prev.map((row) =>
          row.level === level
            ? {
                ...row,
                rewards:
                  courseIds.length > 0
                    ? { unlock_course_ids: courseIds }
                    : null,
                isDirty: true,
              }
            : row
        )
      );
      setEditingRewardsLevel(null);
      setRewardsCourseIds("");
    },
    [rewardsCourseIds]
  );

  const handleSave = useCallback(async () => {
    if (!tenantId) return;

    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const payload = {
        level_configs: levels.map((row) => ({
          level: row.level,
          name: row.name,
          min_points: row.min_points,
          rewards: row.rewards,
        })),
      };

      const res = await fetch(
        `/api/admin/tenants/${tenantId}/level-configs`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "レベル設定の保存に失敗しました");
      }

      setLevels((prev) =>
        prev.map((row) => ({ ...row, isDirty: false }))
      );
      setSuccessMessage("レベル設定を更新しました");
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "予期しないエラーが発生しました"
      );
    } finally {
      setIsSaving(false);
    }
  }, [tenantId, levels]);

  const handleResetDefaults = useCallback(() => {
    if (
      !window.confirm(
        "レベル設定をデフォルトに戻しますか?\n変更内容は失われます。"
      )
    ) {
      return;
    }
    setLevels(
      DEFAULT_LEVEL_THRESHOLDS.map((d) =>
        levelToFormRow({
          tenant_id: tenantId,
          level: d.level,
          name: d.name,
          min_points: d.min_points,
          rewards: null,
        })
      ).map((row) => ({ ...row, isDirty: true }))
    );
  }, [tenantId]);

  const hasDirty = levels.some((row) => row.isDirty);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
          <h1 className="text-2xl font-bold text-gray-900">レベル設定</h1>
          <p className="text-sm text-gray-500 mt-1">
            コミュニティのレベルシステムをカスタマイズします
          </p>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        {/* Info banners */}
        <div className="space-y-3 mb-6">
          <div className="p-4 rounded-lg bg-blue-50 border border-blue-200">
            <p className="text-sm text-blue-800">
              デフォルトはSkool互換の9段階です。ポイント閾値を変更してコミュニティに最適なバランスに調整してください。
            </p>
          </div>
          <div className="p-4 rounded-lg bg-gray-50 border border-gray-200">
            <p className="text-sm text-gray-600">
              メンバーはいいねをもらうとポイントが貯まり、ポイントに応じてレベルが上がります。
            </p>
          </div>
        </div>

        {error && (
          <div
            role="alert"
            className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 mb-6"
          >
            {error}
          </div>
        )}

        {successMessage && (
          <div
            role="status"
            className="p-3 rounded-lg bg-green-50 border border-green-200 text-sm text-green-700 mb-6"
          >
            {successMessage}
          </div>
        )}

        {isLoading ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
            <div className="inline-block w-6 h-6 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin" />
            <p className="text-sm text-gray-500 mt-2">読み込み中...</p>
          </div>
        ) : (
          <>
            {/* Level table */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              {/* Table header */}
              <div className="hidden sm:grid sm:grid-cols-[4rem_1fr_10rem_1fr_4rem] gap-3 px-4 py-3 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                <span>レベル</span>
                <span>名前</span>
                <span>必要ポイント</span>
                <span>特典</span>
                <span />
              </div>

              <ul role="list" className="divide-y divide-gray-100">
                {levels.map((row) => {
                  const colorClass =
                    LEVEL_COLORS[row.level] ?? LEVEL_COLORS[1];

                  return (
                    <li
                      key={row.level}
                      className={`
                        sm:grid sm:grid-cols-[4rem_1fr_10rem_1fr_4rem] gap-3 px-4 py-3.5 items-center
                        transition-colors
                        ${row.isDirty ? "bg-amber-50/50" : "hover:bg-gray-50"}
                      `}
                    >
                      {/* Level badge */}
                      <div>
                        <span
                          className={`inline-flex items-center px-2 py-1 rounded text-xs font-bold ${colorClass}`}
                        >
                          Lv.{row.level}
                        </span>
                      </div>

                      {/* Name */}
                      <div>
                        <input
                          type="text"
                          value={row.name}
                          onChange={(e) =>
                            handleFieldChange(
                              row.level,
                              "name",
                              e.target.value
                            )
                          }
                          className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          aria-label={`レベル ${row.level} の名前`}
                        />
                      </div>

                      {/* Min points */}
                      <div>
                        <input
                          type="number"
                          value={row.min_points}
                          onChange={(e) =>
                            handleFieldChange(
                              row.level,
                              "min_points",
                              parseInt(e.target.value, 10) || 0
                            )
                          }
                          min={0}
                          className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          aria-label={`レベル ${row.level} の必要ポイント`}
                        />
                      </div>

                      {/* Rewards */}
                      <div>
                        {editingRewardsLevel === row.level ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={rewardsCourseIds}
                              onChange={(e) =>
                                setRewardsCourseIds(e.target.value)
                              }
                              placeholder="コースIDをカンマ区切りで"
                              className="flex-1 px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 placeholder-gray-400"
                              aria-label="アンロックするコースID"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                handleSaveRewards(row.level)
                              }
                              className="text-xs text-blue-600 hover:text-blue-800 font-medium flex-shrink-0"
                            >
                              確定
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingRewardsLevel(null);
                                setRewardsCourseIds("");
                              }}
                              className="text-xs text-gray-400 hover:text-gray-600 flex-shrink-0"
                            >
                              取消
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingRewardsLevel(row.level);
                              setRewardsCourseIds(
                                row.rewards?.unlock_course_ids?.join(
                                  ", "
                                ) ?? ""
                              );
                            }}
                            className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                            aria-label={`レベル ${row.level} の特典を設定`}
                          >
                            {row.rewards?.unlock_course_ids &&
                            row.rewards.unlock_course_ids.length > 0 ? (
                              <span className="text-blue-600">
                                {row.rewards.unlock_course_ids.length}
                                コースをアンロック
                              </span>
                            ) : (
                              "特典を設定..."
                            )}
                          </button>
                        )}
                      </div>

                      {/* Dirty indicator */}
                      <div className="flex justify-end">
                        {row.isDirty && (
                          <span
                            className="w-2 h-2 rounded-full bg-amber-400"
                            title="未保存の変更"
                            aria-label="未保存の変更あり"
                          />
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>

            {/* Rewards hint */}
            <div className="mt-4 p-4 rounded-lg bg-gray-50 border border-gray-200">
              <p className="text-xs text-gray-500">
                レベル到達時の特典（コースのアンロックなど）を設定できます。特典の「コースID」は、コース管理画面から確認できます。
              </p>
            </div>

            {/* Actions */}
            <div className="mt-8 flex items-center gap-3 flex-wrap">
              <button
                type="button"
                onClick={handleSave}
                disabled={!hasDirty || isSaving}
                className="
                  inline-flex items-center gap-2 px-6 py-2.5 rounded-lg
                  bg-blue-600 text-white text-sm font-semibold
                  hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed
                  focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
                  transition-colors
                "
              >
                {isSaving ? (
                  <>
                    <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    保存中...
                  </>
                ) : (
                  "設定を保存する"
                )}
              </button>

              <button
                type="button"
                onClick={handleResetDefaults}
                className="
                  inline-flex items-center px-4 py-2.5 rounded-lg
                  border border-gray-200 text-sm font-medium text-gray-600
                  hover:bg-gray-50 transition-colors
                "
              >
                デフォルトに戻す
              </button>

              {!hasDirty && (
                <span className="text-xs text-gray-400">
                  変更はありません
                </span>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
