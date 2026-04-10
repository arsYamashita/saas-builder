"use client";

import { useState, useEffect, useCallback } from "react";
import { InviteForm } from "@/components/domain/invite-form";

interface InviteStats {
  active_count: number;
  monthly_joins: number;
}

export default function InvitesSettingsPage() {
  const tenantId =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("tenantId") ?? ""
      : "";

  const [stats, setStats] = useState<InviteStats>({
    active_count: 0,
    monthly_joins: 0,
  });
  const [isLoadingStats, setIsLoadingStats] = useState(true);

  const fetchStats = useCallback(async () => {
    if (!tenantId) return;
    setIsLoadingStats(true);
    try {
      const res = await fetch(
        `/api/admin/tenants/${tenantId}/invites/stats`
      );
      if (res.ok) {
        const data = await res.json();
        setStats({
          active_count: data.active_count ?? 0,
          monthly_joins: data.monthly_joins ?? 0,
        });
      }
    } catch {
      // Stats are non-critical
    } finally {
      setIsLoadingStats(false);
    }
  }, [tenantId]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
          <h1 className="text-2xl font-bold text-gray-900">
            招待リンク管理
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            招待リンクを作成して、新しいメンバーをコミュニティに迎えましょう
          </p>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
              アクティブな招待
            </p>
            {isLoadingStats ? (
              <div className="h-8 w-16 bg-gray-100 rounded animate-pulse" />
            ) : (
              <p className="text-2xl font-bold text-gray-900">
                {stats.active_count}
                <span className="text-sm font-normal text-gray-500 ml-1">
                  件
                </span>
              </p>
            )}
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
              今月の招待による参加
            </p>
            {isLoadingStats ? (
              <div className="h-8 w-16 bg-gray-100 rounded animate-pulse" />
            ) : (
              <p className="text-2xl font-bold text-gray-900">
                {stats.monthly_joins}
                <span className="text-sm font-normal text-gray-500 ml-1">
                  人
                </span>
              </p>
            )}
          </div>
        </div>

        {/* Invite form + list */}
        <InviteForm tenantId={tenantId} />
      </main>
    </div>
  );
}
