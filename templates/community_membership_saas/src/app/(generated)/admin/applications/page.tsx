"use client";

import { useState, useEffect, useCallback } from "react";
import { ApplicationReview } from "@/components/domain/application-review";
import type {
  MembershipApplication,
  MembershipQuestion,
  ApplicationStatus,
  User,
} from "@/types/database";

type TabValue = "pending" | "approved" | "rejected";

interface ApplicationWithDetails extends MembershipApplication {
  applicant?: Pick<User, "display_name" | "avatar_url" | "email"> | null;
  questions?: MembershipQuestion[];
}

const TABS: { value: TabValue; label: string }[] = [
  { value: "pending", label: "未処理" },
  { value: "approved", label: "承認済み" },
  { value: "rejected", label: "却下" },
];

const EMPTY_MESSAGES: Record<TabValue, string> = {
  pending: "未処理の申請はありません",
  approved: "承認済みの申請はありません",
  rejected: "却下された申請はありません",
};

export default function AdminApplicationsPage() {
  const tenantId =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("tenantId") ?? ""
      : "";

  const [applications, setApplications] = useState<
    ApplicationWithDetails[]
  >([]);
  const [questions, setQuestions] = useState<MembershipQuestion[]>([]);
  const [activeTab, setActiveTab] = useState<TabValue>("pending");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);

  // Fetch applications and questions
  const fetchData = useCallback(async () => {
    if (!tenantId) return;
    setIsLoading(true);
    setError(null);
    try {
      const [appsRes, questionsRes] = await Promise.all([
        fetch(
          `/api/admin/tenants/${tenantId}/applications?status=${activeTab}`
        ),
        fetch(
          `/api/admin/tenants/${tenantId}/membership-questions`
        ),
      ]);

      if (appsRes.ok) {
        const appsData = await appsRes.json();
        setApplications(appsData.applications ?? []);
      }

      if (questionsRes.ok) {
        const questionsData = await questionsRes.json();
        setQuestions(questionsData.questions ?? []);
      }
    } catch {
      setError("データの読み込みに失敗しました");
    } finally {
      setIsLoading(false);
    }
  }, [tenantId, activeTab]);

  useEffect(() => {
    fetchData();
    setSelectedIds(new Set());
    setExpandedIds(new Set());
  }, [fetchData]);

  const pendingCount = applications.filter(
    (a) => a.status === "pending"
  ).length;

  const handleTabChange = useCallback((tab: TabValue) => {
    setActiveTab(tab);
    setSelectedIds(new Set());
    setExpandedIds(new Set());
  }, []);

  const toggleExpanded = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const toggleSelected = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size === applications.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(applications.map((a) => a.id)));
    }
  }, [applications, selectedIds.size]);

  const handleStatusChange = useCallback(
    (applicationId: string, newStatus: ApplicationStatus) => {
      setApplications((prev) =>
        prev.map((a) =>
          a.id === applicationId ? { ...a, status: newStatus } : a
        )
      );
      // Optionally remove from current view
      setTimeout(() => {
        setApplications((prev) =>
          prev.filter((a) => a.id !== applicationId)
        );
      }, 1000);
    },
    []
  );

  const handleBatchAction = useCallback(
    async (action: "approved" | "rejected") => {
      if (selectedIds.size === 0) return;
      if (
        !window.confirm(
          `選択した ${selectedIds.size} 件の申請を${
            action === "approved" ? "承認" : "却下"
          }しますか?`
        )
      ) {
        return;
      }

      setIsBatchProcessing(true);
      setError(null);

      try {
        const res = await fetch(
          `/api/admin/tenants/${tenantId}/applications/batch`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              application_ids: Array.from(selectedIds),
              status: action,
            }),
          }
        );

        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(data?.error ?? "一括処理に失敗しました");
        }

        // Remove processed items
        setApplications((prev) =>
          prev.filter((a) => !selectedIds.has(a.id))
        );
        setSelectedIds(new Set());
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "予期しないエラーが発生しました"
        );
      } finally {
        setIsBatchProcessing(false);
      }
    },
    [tenantId, selectedIds]
  );

  // Enrich applications with questions
  const enrichedApplications = applications.map((app) => ({
    ...app,
    questions,
  }));

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
          <h1 className="text-2xl font-bold text-gray-900">
            参加申請の管理
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            コミュニティへの参加申請を確認・審査します
          </p>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        {error && (
          <div
            role="alert"
            className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 mb-6"
          >
            {error}
          </div>
        )}

        {/* Stats */}
        {activeTab === "pending" && !isLoading && (
          <div className="mb-6">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-yellow-50 border border-yellow-200">
              <span className="text-sm text-yellow-800">
                未処理の申請:{" "}
                <span className="font-bold">{pendingCount}件</span>
              </span>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex items-center gap-1 mb-6 border-b border-gray-200">
          {TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => handleTabChange(tab.value)}
              className={`
                px-4 py-2.5 text-sm font-medium -mb-px border-b-2 transition-colors
                ${
                  activeTab === tab.value
                    ? "border-blue-500 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }
              `}
              aria-selected={activeTab === tab.value}
              role="tab"
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Batch actions (pending tab only) */}
        {activeTab === "pending" && selectedIds.size > 0 && (
          <div className="flex items-center gap-3 mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <span className="text-sm text-blue-800">
              {selectedIds.size}件を選択中
            </span>
            <div className="flex-1" />
            <button
              type="button"
              onClick={() => handleBatchAction("approved")}
              disabled={isBatchProcessing}
              className="
                inline-flex items-center px-3 py-1.5 rounded-lg
                bg-green-600 text-white text-xs font-medium
                hover:bg-green-700 disabled:opacity-50
                transition-colors
              "
            >
              一括承認
            </button>
            <button
              type="button"
              onClick={() => handleBatchAction("rejected")}
              disabled={isBatchProcessing}
              className="
                inline-flex items-center px-3 py-1.5 rounded-lg
                bg-red-600 text-white text-xs font-medium
                hover:bg-red-700 disabled:opacity-50
                transition-colors
              "
            >
              一括却下
            </button>
          </div>
        )}

        {/* Select all checkbox (pending tab) */}
        {activeTab === "pending" &&
          !isLoading &&
          applications.length > 0 && (
            <div className="flex items-center gap-2 mb-4">
              <input
                type="checkbox"
                checked={
                  selectedIds.size === applications.length &&
                  applications.length > 0
                }
                onChange={toggleSelectAll}
                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                aria-label="すべて選択"
              />
              <span className="text-xs text-gray-500">
                すべて選択
              </span>
            </div>
          )}

        {/* Applications list */}
        {isLoading ? (
          <div className="space-y-4" aria-busy="true">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="bg-white rounded-xl border border-gray-200 p-6 animate-pulse"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gray-200" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-gray-200 rounded w-32" />
                    <div className="h-3 bg-gray-100 rounded w-48" />
                  </div>
                  <div className="h-6 bg-gray-200 rounded-full w-16" />
                </div>
              </div>
            ))}
          </div>
        ) : applications.length === 0 ? (
          <div className="py-20 text-center">
            <div className="text-4xl mb-3" aria-hidden="true">
              📋
            </div>
            <p className="text-sm text-gray-500">
              {EMPTY_MESSAGES[activeTab]}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {enrichedApplications.map((application) => {
              const isExpanded = expandedIds.has(application.id);
              const isSelected = selectedIds.has(application.id);
              const displayName =
                application.applicant?.display_name ?? "名前未設定";

              return (
                <div key={application.id}>
                  {/* Summary row */}
                  <div
                    className={`
                      bg-white rounded-xl border transition-all
                      ${isExpanded ? "border-blue-200 shadow-sm" : "border-gray-200 hover:border-gray-300"}
                    `}
                  >
                    <div className="px-5 py-4 flex items-center gap-3">
                      {/* Checkbox (pending only) */}
                      {activeTab === "pending" && (
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelected(application.id)}
                          className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 flex-shrink-0"
                          aria-label={`${displayName}の申請を選択`}
                          onClick={(e) => e.stopPropagation()}
                        />
                      )}

                      {/* Applicant avatar */}
                      {application.applicant?.avatar_url ? (
                        <img
                          src={application.applicant.avatar_url}
                          alt={`${displayName}のアバター`}
                          className="w-9 h-9 rounded-full object-cover flex-shrink-0"
                        />
                      ) : (
                        <div
                          className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                          aria-hidden="true"
                        >
                          {displayName.slice(0, 2).toUpperCase()}
                        </div>
                      )}

                      {/* Name + email */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">
                          {displayName}
                        </p>
                        {application.applicant?.email && (
                          <p className="text-xs text-gray-400 truncate">
                            {application.applicant.email}
                          </p>
                        )}
                      </div>

                      {/* Applied date */}
                      <time
                        dateTime={application.created_at}
                        className="text-xs text-gray-400 flex-shrink-0 hidden sm:block"
                      >
                        {new Date(
                          application.created_at
                        ).toLocaleDateString("ja-JP")}
                      </time>

                      {/* Status badge */}
                      <span
                        className={`
                          inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0
                          ${
                            application.status === "pending"
                              ? "bg-yellow-50 text-yellow-700"
                              : application.status === "approved"
                              ? "bg-green-50 text-green-700"
                              : "bg-red-50 text-red-700"
                          }
                        `}
                      >
                        {application.status === "pending"
                          ? "未処理"
                          : application.status === "approved"
                          ? "承認済み"
                          : "却下"}
                      </span>

                      {/* Expand toggle */}
                      <button
                        type="button"
                        onClick={() => toggleExpanded(application.id)}
                        className="p-1.5 text-gray-400 hover:text-gray-600 rounded transition-colors flex-shrink-0"
                        aria-label={
                          isExpanded ? "詳細を閉じる" : "詳細を開く"
                        }
                        aria-expanded={isExpanded}
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                          className={`w-4 h-4 transition-transform duration-200 ${
                            isExpanded ? "rotate-180" : ""
                          }`}
                        >
                          <path
                            fillRule="evenodd"
                            d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </button>
                    </div>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <div className="border-t border-gray-100">
                        <ApplicationReview
                          application={application}
                          tenantId={tenantId}
                          onStatusChange={handleStatusChange}
                        />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
