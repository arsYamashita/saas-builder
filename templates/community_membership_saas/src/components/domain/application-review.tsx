"use client";

import { useState, useCallback } from "react";
import type {
  MembershipApplication,
  MembershipQuestion,
  ApplicationStatus,
  User,
} from "@/types/database";

interface ApplicationWithDetails extends MembershipApplication {
  applicant?: Pick<User, "display_name" | "avatar_url" | "email"> | null;
  questions?: MembershipQuestion[];
}

interface ApplicationReviewProps {
  application: ApplicationWithDetails;
  tenantId: string;
  onStatusChange?: (
    applicationId: string,
    newStatus: ApplicationStatus
  ) => void;
}

function getStatusBadge(status: ApplicationStatus): {
  label: string;
  className: string;
} {
  switch (status) {
    case "pending":
      return {
        label: "未処理",
        className: "bg-yellow-50 text-yellow-700 border-yellow-200",
      };
    case "approved":
      return {
        label: "承認済み",
        className: "bg-green-50 text-green-700 border-green-200",
      };
    case "rejected":
      return {
        label: "却下",
        className: "bg-red-50 text-red-700 border-red-200",
      };
    default:
      return {
        label: status,
        className: "bg-gray-50 text-gray-700 border-gray-200",
      };
  }
}

function formatDaysAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "今日";
  if (diffDays === 1) return "1日前";
  return `${diffDays}日前`;
}

function getInitials(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

export function ApplicationReview({
  application,
  tenantId,
  onStatusChange,
}: ApplicationReviewProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const statusBadge = getStatusBadge(application.status);
  const daysAgo = formatDaysAgo(application.created_at);
  const displayName =
    application.applicant?.display_name ?? "名前未設定";
  const avatarUrl = application.applicant?.avatar_url;

  const handleAction = useCallback(
    async (action: "approved" | "rejected") => {
      if (!tenantId) return;

      setIsProcessing(true);
      setError(null);

      try {
        const payload: Record<string, unknown> = { status: action };
        if (action === "rejected" && rejectionReason.trim()) {
          payload.rejection_reason = rejectionReason.trim();
        }

        const res = await fetch(
          `/api/admin/tenants/${tenantId}/applications/${application.id}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          }
        );

        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(data?.error ?? "処理に失敗しました");
        }

        onStatusChange?.(application.id, action);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "予期しないエラーが発生しました"
        );
      } finally {
        setIsProcessing(false);
      }
    },
    [tenantId, application.id, rejectionReason, onStatusChange]
  );

  // Build a question lookup map
  const questionMap = new Map<string, MembershipQuestion>();
  if (application.questions) {
    for (const q of application.questions) {
      questionMap.set(q.id, q);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center gap-3">
        {/* Applicant info */}
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={`${displayName}のアバター`}
              className="w-10 h-10 rounded-full object-cover flex-shrink-0"
            />
          ) : (
            <div
              className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
              aria-hidden="true"
            >
              {getInitials(displayName)}
            </div>
          )}
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">
              {displayName}
            </p>
            {application.applicant?.email && (
              <p className="text-xs text-gray-400 truncate">
                {application.applicant.email}
              </p>
            )}
          </div>
        </div>

        {/* Status and timing */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <span className="text-xs text-gray-400">
            この申請は{daysAgo}に送信されました
          </span>
          <span
            className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${statusBadge.className}`}
          >
            {statusBadge.label}
          </span>
        </div>
      </div>

      {/* Answers */}
      <div className="px-6 py-4 space-y-5">
        {application.answers.length === 0 ? (
          <p className="text-sm text-gray-400">回答なし</p>
        ) : (
          application.answers.map((answer, index) => {
            const question = questionMap.get(answer.question_id);
            return (
              <div key={answer.question_id}>
                <p className="text-sm font-medium text-gray-700 mb-1">
                  <span className="text-gray-400 mr-1.5">
                    {index + 1}.
                  </span>
                  {question?.question_text ?? `質問 ${index + 1}`}
                  {question?.is_required && (
                    <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-50 text-red-600">
                      必須
                    </span>
                  )}
                </p>
                <div className="bg-gray-50 rounded-lg px-4 py-3">
                  <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
                    {answer.answer || (
                      <span className="text-gray-400 italic">
                        未回答
                      </span>
                    )}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Actions (only for pending) */}
      {application.status === "pending" && (
        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50">
          {error && (
            <div
              role="alert"
              className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 mb-4"
            >
              {error}
            </div>
          )}

          {/* Reject reason form */}
          {showRejectForm && (
            <div className="mb-4">
              <label
                htmlFor={`reject-reason-${application.id}`}
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                却下理由（任意）
              </label>
              <textarea
                id={`reject-reason-${application.id}`}
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                rows={3}
                placeholder="却下の理由を入力してください（申請者に通知されます）..."
                className="
                  w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none
                  placeholder-gray-400 text-gray-900
                  focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500
                "
              />
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => handleAction("approved")}
              disabled={isProcessing}
              className="
                inline-flex items-center gap-2 px-5 py-2.5 rounded-lg
                bg-green-600 text-white text-sm font-semibold
                hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed
                focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2
                transition-colors
              "
            >
              {isProcessing ? (
                <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="w-4 h-4"
                >
                  <path
                    fillRule="evenodd"
                    d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
                    clipRule="evenodd"
                  />
                </svg>
              )}
              承認する
            </button>

            {showRejectForm ? (
              <>
                <button
                  type="button"
                  onClick={() => handleAction("rejected")}
                  disabled={isProcessing}
                  className="
                    inline-flex items-center gap-2 px-5 py-2.5 rounded-lg
                    bg-red-600 text-white text-sm font-semibold
                    hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed
                    focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2
                    transition-colors
                  "
                >
                  却下を確定する
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowRejectForm(false);
                    setRejectionReason("");
                  }}
                  className="px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  キャンセル
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setShowRejectForm(true)}
                disabled={isProcessing}
                className="
                  inline-flex items-center gap-2 px-5 py-2.5 rounded-lg
                  border border-red-200 text-red-600 text-sm font-semibold
                  hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed
                  focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2
                  transition-colors
                "
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="w-4 h-4"
                >
                  <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                </svg>
                却下する
              </button>
            )}
          </div>
        </div>
      )}

      {/* Reviewed info */}
      {application.status !== "pending" && application.reviewed_at && (
        <div className="px-6 py-3 border-t border-gray-100 bg-gray-50">
          <p className="text-xs text-gray-400">
            {application.status === "approved" ? "承認" : "却下"}日時:{" "}
            {new Date(application.reviewed_at).toLocaleString("ja-JP")}
          </p>
        </div>
      )}
    </div>
  );
}
