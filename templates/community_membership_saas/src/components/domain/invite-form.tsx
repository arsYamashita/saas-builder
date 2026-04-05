"use client";

import { useState, useEffect, useCallback } from "react";
import type { Invite } from "@/types/database";

interface InviteFormProps {
  tenantId: string;
}

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffDay = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDay < 1) return "今日";
  if (diffDay === 1) return "昨日";
  if (diffDay < 7) return `${diffDay}日前`;
  if (diffDay < 30) return `${Math.floor(diffDay / 7)}週間前`;
  return `${Math.floor(diffDay / 30)}ヶ月前`;
}

function isExpired(invite: Invite): boolean {
  return new Date(invite.expires_at).getTime() < Date.now();
}

function isMaxedOut(invite: Invite): boolean {
  return invite.max_uses !== null && invite.use_count >= invite.max_uses;
}

function getInviteStatus(invite: Invite): {
  label: string;
  className: string;
} {
  if (invite.accepted_at) {
    return { label: "使用済み", className: "bg-gray-100 text-gray-600" };
  }
  if (isExpired(invite)) {
    return { label: "期限切れ", className: "bg-red-50 text-red-600" };
  }
  if (isMaxedOut(invite)) {
    return { label: "上限到達", className: "bg-orange-50 text-orange-600" };
  }
  return { label: "有効", className: "bg-green-50 text-green-700" };
}

export function InviteForm({ tenantId }: InviteFormProps) {
  const [invites, setInvites] = useState<Invite[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form fields
  const [maxUses, setMaxUses] = useState<string>("");
  const [expiresAt, setExpiresAt] = useState<string>("");

  // Generated URL
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Revoke confirmation
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const fetchInvites = useCallback(async () => {
    if (!tenantId) return;
    setIsLoading(true);
    try {
      const res = await fetch(
        `/api/admin/tenants/${tenantId}/invites`
      );
      if (res.ok) {
        const data = await res.json();
        setInvites(data.invites ?? []);
      }
    } catch {
      // Non-critical
    } finally {
      setIsLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    fetchInvites();
  }, [fetchInvites]);

  const handleCreate = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!tenantId) return;

      setIsSubmitting(true);
      setError(null);
      setGeneratedUrl(null);

      try {
        const payload: Record<string, unknown> = {};
        if (maxUses.trim()) {
          const parsed = parseInt(maxUses, 10);
          if (isNaN(parsed) || parsed < 1) {
            throw new Error("使用回数は1以上の数値を入力してください");
          }
          payload.max_uses = parsed;
        }
        if (expiresAt) {
          payload.expires_at = new Date(expiresAt).toISOString();
        }

        const res = await fetch(
          `/api/admin/tenants/${tenantId}/invites`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          }
        );

        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(data?.error ?? "招待リンクの作成に失敗しました");
        }

        const data = await res.json();
        const invite = data.invite as Invite;

        // Build invite URL
        const baseUrl =
          typeof window !== "undefined" ? window.location.origin : "";
        setGeneratedUrl(`${baseUrl}/join?token=${invite.token}`);

        // Reset form
        setMaxUses("");
        setExpiresAt("");

        await fetchInvites();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "予期しないエラーが発生しました"
        );
      } finally {
        setIsSubmitting(false);
      }
    },
    [tenantId, maxUses, expiresAt, fetchInvites]
  );

  const handleCopy = useCallback(async () => {
    if (!generatedUrl) return;
    try {
      await navigator.clipboard.writeText(generatedUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const textarea = document.createElement("textarea");
      textarea.value = generatedUrl;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [generatedUrl]);

  const handleRevoke = useCallback(
    async (inviteId: string) => {
      if (!tenantId) return;
      setRevokingId(inviteId);
      try {
        const res = await fetch(
          `/api/admin/tenants/${tenantId}/invites/${inviteId}`,
          { method: "DELETE" }
        );
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(data?.error ?? "招待リンクの無効化に失敗しました");
        }
        await fetchInvites();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "予期しないエラーが発生しました"
        );
      } finally {
        setRevokingId(null);
      }
    },
    [tenantId, fetchInvites]
  );

  // Default expires_at to 7 days from now
  const defaultMinDate = new Date().toISOString().split("T")[0];

  return (
    <div className="space-y-8">
      {/* Create form */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-1">
          招待リンクを作成
        </h2>
        <p className="text-sm text-gray-500 mb-6">
          このリンクを共有してメンバーを招待しましょう
        </p>

        {error && (
          <div
            role="alert"
            className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 mb-4"
          >
            {error}
          </div>
        )}

        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Max uses */}
            <div>
              <label
                htmlFor="invite-max-uses"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                使用回数の上限
              </label>
              <input
                id="invite-max-uses"
                type="number"
                value={maxUses}
                onChange={(e) => setMaxUses(e.target.value)}
                placeholder="空欄で無制限"
                min={1}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 placeholder-gray-400"
                aria-describedby="max-uses-hint"
              />
              <p
                id="max-uses-hint"
                className="text-xs text-gray-400 mt-1"
              >
                空欄で無制限
              </p>
            </div>

            {/* Expires at */}
            <div>
              <label
                htmlFor="invite-expires"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                有効期限
              </label>
              <input
                id="invite-expires"
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                min={defaultMinDate}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                aria-describedby="expires-hint"
              />
              <p
                id="expires-hint"
                className="text-xs text-gray-400 mt-1"
              >
                有効期限を設定
              </p>
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="
              inline-flex items-center gap-2 px-5 py-2.5 rounded-lg
              bg-blue-600 text-white text-sm font-semibold
              hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed
              focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
              transition-colors
            "
          >
            {isSubmitting ? (
              <>
                <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                作成中...
              </>
            ) : (
              <>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="w-4 h-4"
                >
                  <path d="M12.232 4.232a2.5 2.5 0 013.536 3.536l-1.225 1.224a.75.75 0 001.061 1.06l1.224-1.224a4 4 0 00-5.656-5.656l-3 3a4 4 0 00.225 5.865.75.75 0 00.977-1.138 2.5 2.5 0 01-.142-3.667l3-3z" />
                  <path d="M11.603 7.963a.75.75 0 00-.977 1.138 2.5 2.5 0 01.142 3.667l-3 3a2.5 2.5 0 01-3.536-3.536l1.225-1.224a.75.75 0 00-1.061-1.06l-1.224 1.224a4 4 0 105.656 5.656l3-3a4 4 0 00-.225-5.865z" />
                </svg>
                招待リンクを作成
              </>
            )}
          </button>
        </form>

        {/* Generated URL */}
        {generatedUrl && (
          <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-sm font-medium text-green-800 mb-2">
              招待リンクが作成されました
            </p>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={generatedUrl}
                className="flex-1 px-3 py-2 bg-white border border-green-200 rounded-lg text-sm text-gray-700 font-mono"
                aria-label="招待リンク URL"
              />
              <button
                type="button"
                onClick={handleCopy}
                className="
                  inline-flex items-center gap-1.5 px-4 py-2 rounded-lg
                  bg-green-600 text-white text-sm font-medium
                  hover:bg-green-700 transition-colors flex-shrink-0
                "
                aria-label="リンクをコピー"
              >
                {copied ? (
                  <>
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
                    コピーしました!
                  </>
                ) : (
                  <>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      className="w-4 h-4"
                    >
                      <path d="M7 3.5A1.5 1.5 0 018.5 2h3.879a1.5 1.5 0 011.06.44l3.122 3.12A1.5 1.5 0 0117 6.622V12.5a1.5 1.5 0 01-1.5 1.5h-1v-3.379a3 3 0 00-.879-2.121L10.5 5.379A3 3 0 008.379 4.5H7v-1z" />
                      <path d="M4.5 6A1.5 1.5 0 003 7.5v9A1.5 1.5 0 004.5 18h7a1.5 1.5 0 001.5-1.5v-5.879a1.5 1.5 0 00-.44-1.06L9.44 6.439A1.5 1.5 0 008.378 6H4.5z" />
                    </svg>
                    コピー
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Active invites list */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-base font-bold text-gray-900">
            招待リンク一覧
          </h3>
        </div>

        {isLoading ? (
          <div className="p-8 text-center">
            <div className="inline-block w-6 h-6 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin" />
            <p className="text-sm text-gray-500 mt-2">読み込み中...</p>
          </div>
        ) : invites.length === 0 ? (
          <div className="py-16 text-center">
            <div className="text-3xl mb-2" aria-hidden="true">
              🔗
            </div>
            <p className="text-sm text-gray-500">
              招待リンクがまだありません
            </p>
          </div>
        ) : (
          <ul role="list" className="divide-y divide-gray-100">
            {invites.map((invite) => {
              const status = getInviteStatus(invite);
              const isActive =
                !isExpired(invite) && !isMaxedOut(invite) && !invite.accepted_at;

              return (
                <li
                  key={invite.id}
                  className="px-6 py-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <code className="text-xs text-gray-500 font-mono truncate">
                          ...{invite.token.slice(-12)}
                        </code>
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${status.className}`}
                        >
                          {status.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-gray-400">
                        <span>
                          使用: {invite.use_count}
                          {invite.max_uses !== null
                            ? ` / ${invite.max_uses}回`
                            : "回 (無制限)"}
                        </span>
                        <span>
                          期限:{" "}
                          {new Date(invite.expires_at).toLocaleDateString(
                            "ja-JP"
                          )}
                        </span>
                        <span>作成: {formatRelativeTime(invite.created_at)}</span>
                      </div>
                    </div>

                    {isActive && (
                      <button
                        type="button"
                        onClick={() => handleRevoke(invite.id)}
                        disabled={revokingId === invite.id}
                        className="
                          inline-flex items-center px-3 py-1.5 rounded-lg
                          text-xs font-medium text-red-600
                          border border-red-200 bg-white
                          hover:bg-red-50 disabled:opacity-50
                          transition-colors flex-shrink-0
                        "
                        aria-label={`招待リンク ${invite.token.slice(-8)} を無効にする`}
                      >
                        {revokingId === invite.id ? "処理中..." : "無効にする"}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
