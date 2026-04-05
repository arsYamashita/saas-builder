"use client";

import { useState, useEffect, useCallback } from "react";
import type { JoinMode } from "@/types/database";

interface JoinModeOption {
  value: JoinMode;
  label: string;
  description: string;
  icon: React.ReactNode;
}

const JOIN_MODE_OPTIONS: JoinModeOption[] = [
  {
    value: "open",
    label: "オープン",
    description: "誰でも自由に参加できます",
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="currentColor"
        className="w-6 h-6"
      >
        <path d="M15.75 8.25a.75.75 0 01.75.75c0 1.12-.492 2.126-1.27 2.812a.75.75 0 11-.992-1.124A2.243 2.243 0 0015 9a.75.75 0 01.75-.75z" />
        <path
          fillRule="evenodd"
          d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25zM4.575 15.6a8.25 8.25 0 009.348 4.425 1.966 1.966 0 00-1.84-1.275.983.983 0 01-.97-.822l-.073-.437c-.094-.565.25-1.11.8-1.267l.99-.282c.427-.122.708-.53.654-.968a5.539 5.539 0 00-2.082-3.517 3.745 3.745 0 00-2.827-.562l-.348.074a1.873 1.873 0 01-1.234-.146l-1.295-.648a1.873 1.873 0 01-.7-2.608l.56-.994a1.873 1.873 0 012.487-.688l1.064.532c.186.093.395.135.604.127a2.906 2.906 0 012.556 1.213l.003.004c.178.267.448.466.765.548l.6.156a1.873 1.873 0 011.334 1.81v.003c0 .476.178.935.5 1.286A8.22 8.22 0 004.575 15.6z"
          clipRule="evenodd"
        />
      </svg>
    ),
  },
  {
    value: "invite_only",
    label: "招待制",
    description: "招待リンクを持つ人のみ参加できます",
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="currentColor"
        className="w-6 h-6"
      >
        <path d="M12.232 4.232a2.5 2.5 0 013.536 3.536l-1.225 1.224a.75.75 0 001.061 1.06l1.224-1.224a4 4 0 00-5.656-5.656l-3 3a4 4 0 00.225 5.865.75.75 0 00.977-1.138 2.5 2.5 0 01-.142-3.667l3-3z" />
        <path d="M11.603 7.963a.75.75 0 00-.977 1.138 2.5 2.5 0 01.142 3.667l-3 3a2.5 2.5 0 01-3.536-3.536l1.225-1.224a.75.75 0 00-1.061-1.06l-1.224 1.224a4 4 0 105.656 5.656l3-3a4 4 0 00-.225-5.865z" />
      </svg>
    ),
  },
  {
    value: "application",
    label: "申請制",
    description:
      "申請フォームに回答し、管理者の承認を経て参加できます",
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="currentColor"
        className="w-6 h-6"
      >
        <path
          fillRule="evenodd"
          d="M7.502 6h7.128A3.375 3.375 0 0118 9.375v9.375a3 3 0 003-3V6.108c0-1.505-1.125-2.811-2.664-2.94A48.972 48.972 0 0012 3c-2.227 0-4.406.148-6.336.432A2.94 2.94 0 003 6.108v8.017a3 3 0 003 3h1.502V6z"
          clipRule="evenodd"
        />
        <path
          fillRule="evenodd"
          d="M13.003 8.125c.003 0 .001 0 0 0zM11.25 8.003A48.11 48.11 0 006 8.528v10.597a1.5 1.5 0 001.5 1.5h9a1.5 1.5 0 001.5-1.5V8.528a48.11 48.11 0 00-5.25-.525H11.25zm.75 3.122a.75.75 0 01.75.75v3.75a.75.75 0 01-1.5 0v-3.75a.75.75 0 01.75-.75zm.75-1.5a.75.75 0 00-1.5 0 .75.75 0 001.5 0z"
          clipRule="evenodd"
        />
      </svg>
    ),
  },
];

export default function JoinModeSettingsPage() {
  const tenantId =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("tenantId") ?? ""
      : "";

  const [currentMode, setCurrentMode] = useState<JoinMode | null>(null);
  const [selectedMode, setSelectedMode] = useState<JoinMode | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showWarning, setShowWarning] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch current mode
  useEffect(() => {
    if (!tenantId) return;

    (async () => {
      setIsLoading(true);
      try {
        const res = await fetch(`/api/admin/tenants/${tenantId}`);
        if (res.ok) {
          const data = await res.json();
          const mode = (data.tenant?.join_mode ?? "open") as JoinMode;
          setCurrentMode(mode);
          setSelectedMode(mode);
        }
      } catch {
        setError("設定の読み込みに失敗しました");
      } finally {
        setIsLoading(false);
      }
    })();
  }, [tenantId]);

  const handleModeSelect = useCallback(
    (mode: JoinMode) => {
      setSelectedMode(mode);
      setSuccessMessage(null);
      if (mode !== currentMode) {
        setShowWarning(true);
      } else {
        setShowWarning(false);
      }
    },
    [currentMode]
  );

  const handleSave = useCallback(async () => {
    if (!tenantId || !selectedMode) return;

    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const res = await fetch(
        `/api/admin/tenants/${tenantId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ join_mode: selectedMode }),
        }
      );

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "設定の保存に失敗しました");
      }

      setCurrentMode(selectedMode);
      setShowWarning(false);
      setSuccessMessage("参加モードを更新しました");
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "予期しないエラーが発生しました"
      );
    } finally {
      setIsSaving(false);
    }
  }, [tenantId, selectedMode]);

  const hasChanges = selectedMode !== currentMode;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
          <h1 className="text-2xl font-bold text-gray-900">
            参加モードの設定
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            コミュニティへの参加方法を選択してください
          </p>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
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
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="bg-white rounded-xl border border-gray-200 p-6 animate-pulse"
              >
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-gray-200 rounded-lg" />
                  <div className="flex-1 space-y-2">
                    <div className="h-5 bg-gray-200 rounded w-24" />
                    <div className="h-4 bg-gray-100 rounded w-48" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <>
            {/* Mode options */}
            <div className="space-y-4">
              {JOIN_MODE_OPTIONS.map((option) => {
                const isSelected = selectedMode === option.value;
                const isCurrent = currentMode === option.value;

                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => handleModeSelect(option.value)}
                    className={`
                      w-full text-left bg-white rounded-xl border-2 p-6
                      transition-all duration-200
                      focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
                      ${
                        isSelected
                          ? "border-blue-500 shadow-sm"
                          : "border-gray-200 hover:border-gray-300"
                      }
                    `}
                    aria-pressed={isSelected}
                  >
                    <div className="flex items-start gap-4">
                      {/* Radio indicator */}
                      <div
                        className={`
                          w-5 h-5 rounded-full border-2 flex-shrink-0 mt-0.5
                          flex items-center justify-center
                          transition-colors
                          ${
                            isSelected
                              ? "border-blue-500"
                              : "border-gray-300"
                          }
                        `}
                      >
                        {isSelected && (
                          <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                        )}
                      </div>

                      {/* Icon */}
                      <div
                        className={`
                          w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0
                          ${
                            isSelected
                              ? "bg-blue-50 text-blue-600"
                              : "bg-gray-100 text-gray-500"
                          }
                        `}
                      >
                        {option.icon}
                      </div>

                      {/* Text */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3
                            className={`text-base font-semibold ${
                              isSelected
                                ? "text-blue-900"
                                : "text-gray-900"
                            }`}
                          >
                            {option.label}
                          </h3>
                          {isCurrent && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-700">
                              現在の設定
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-500 mt-0.5">
                          {option.description}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Warning */}
            {showWarning && hasChanges && (
              <div
                role="alert"
                className="mt-6 p-4 rounded-lg bg-amber-50 border border-amber-200"
              >
                <div className="flex items-start gap-3">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5"
                  >
                    <path
                      fillRule="evenodd"
                      d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <p className="text-sm text-amber-800">
                    参加モードを変更すると、既存の招待リンクや未処理の申請に影響する場合があります
                  </p>
                </div>
              </div>
            )}

            {/* Save button */}
            <div className="mt-8 flex items-center gap-3">
              <button
                type="button"
                onClick={handleSave}
                disabled={!hasChanges || isSaving}
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
              {!hasChanges && currentMode && (
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
