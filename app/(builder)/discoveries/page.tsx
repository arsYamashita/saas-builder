"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { DiscoveryFeedItem, DataSourceType } from "@/lib/idea-discovery/core/types";

type FilterSource = DataSourceType | "all";
type FilterUrgency = "all" | "high" | "medium" | "low";

/** ページあたりの表示件数 */
const PAGE_SIZE = 10;

export default function DiscoveriesPage() {
  const router = useRouter();
  const [feedItems, setFeedItems] = useState<DiscoveryFeedItem[]>([]);
  const [filteredItems, setFilteredItems] = useState<DiscoveryFeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterSource, setFilterSource] = useState<FilterSource>("all");
  const [filterUrgency, setFilterUrgency] = useState<FilterUrgency>("all");
  const [filterDomain, setFilterDomain] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [buildingId, setBuildingId] = useState<string | null>(null);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());

  // Fetch ideas on mount
  useEffect(() => {
    fetchIdeas();
  }, []);

  const fetchIdeas = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/idea-discovery");
      const data = await response.json();

      if (data.success && data.feedItems) {
        setFeedItems(data.feedItems);
      }
    } catch (error) {
      console.error("Failed to fetch ideas:", error);
    } finally {
      setLoading(false);
    }
  };

  // Apply filters
  useEffect(() => {
    let filtered = feedItems;

    if (filterSource !== "all") {
      filtered = filtered.filter((item) => item.idea.source === filterSource);
    }

    if (filterUrgency !== "all") {
      filtered = filtered.filter(
        (item) => item.idea.quickFilter.urgency === filterUrgency,
      );
    }

    if (filterDomain !== "all") {
      filtered = filtered.filter(
        (item) => item.idea.quickFilter.domain === filterDomain,
      );
    }

    setFilteredItems(filtered);
  }, [feedItems, filterSource, filterUrgency, filterDomain]);

  const domains = Array.from(
    new Set(feedItems.map((item) => item.idea.quickFilter.domain)),
  );
  const sources = Array.from(
    new Set(feedItems.map((item) => item.idea.source)),
  ) as DataSourceType[];

  const handleBuildThis = async (item: DiscoveryFeedItem) => {
    setBuildingId(item.ideaId);
    try {
      // Navigate to new project page with idea data encoded in query params
      const params = new URLSearchParams({
        ideaId: item.ideaId,
        domain: item.idea.quickFilter.domain || "",
        problemStatement: item.idea.needsAnalysis?.problemStatement || "",
        targetUsers: item.idea.needsAnalysis?.targetUsers || "",
        billingModel: item.idea.needsAnalysis?.billingModel || "subscription",
        affiliateEnabled: String(item.idea.needsAnalysis?.affiliateEnabled ?? false),
        templateKey: item.templateMatch.templateKey || "",
        confidence: String(item.templateMatch.confidence || 0),
        requiredFeatures: (item.idea.needsAnalysis?.requiredFeatures || []).join(","),
        mainUseCases: (item.idea.needsAnalysis?.mainUseCases || []).join(","),
        source: item.idea.source,
        sourceUrl: item.idea.sourceUrl || "",
      });
      router.push(`/projects/new?${params.toString()}`);
    } catch (error) {
      console.error("Failed to navigate:", error);
      setBuildingId(null);
    }
  };

  const handleSave = (ideaId: string) => {
    setSavedIds((prev) => {
      const next = new Set(prev);
      if (next.has(ideaId)) {
        next.delete(ideaId);
      } else {
        next.add(ideaId);
      }
      return next;
    });
  };

  const handleDismiss = (ideaId: string) => {
    setDismissedIds((prev) => new Set(prev).add(ideaId));
  };

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));
  const paginatedItems = filteredItems
    .filter((item) => !dismissedIds.has(item.ideaId))
    .slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-xl text-gray-600">Loading discoveries...</div>
      </div>
    );
  }

  return (
    <div className="space-y-8 p-8">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">Idea Discoveries</h1>
        <p className="text-gray-600">
          Curated ideas from social platforms, blogs, and communities.
        </p>
      </div>

      {/* Filters */}
      <div className="flex gap-4 flex-wrap">
        <div className="flex flex-col gap-2">
          <label className="text-sm font-semibold text-gray-700">Source</label>
          <select
            value={filterSource}
            onChange={(e) => setFilterSource(e.target.value as FilterSource)}
            className="px-3 py-2 border border-gray-300 rounded-lg"
          >
            <option value="all">All sources</option>
            {sources.map((source) => (
              <option key={source} value={source}>
                {source}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-semibold text-gray-700">Urgency</label>
          <select
            value={filterUrgency}
            onChange={(e) => setFilterUrgency(e.target.value as FilterUrgency)}
            className="px-3 py-2 border border-gray-300 rounded-lg"
          >
            <option value="all">All</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-semibold text-gray-700">Domain</label>
          <select
            value={filterDomain}
            onChange={(e) => setFilterDomain(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg"
          >
            <option value="all">All domains</option>
            {domains.map((domain) => (
              <option key={domain} value={domain}>
                {domain}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-end">
          <button
            onClick={fetchIdeas}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Results */}
      <div className="flex justify-between items-center">
        <div className="text-sm text-gray-600">
          {filteredItems.length} 件中 {Math.min((currentPage - 1) * PAGE_SIZE + 1, filteredItems.length)}–{Math.min(currentPage * PAGE_SIZE, filteredItems.length)} 件を表示
        </div>
        {savedIds.size > 0 && (
          <div className="text-sm text-blue-600 font-medium">
            {savedIds.size} 件保存済み
          </div>
        )}
      </div>

      {/* Feed Items */}
      <div className="grid gap-4">
        {paginatedItems.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            条件に一致するアイデアがありません
          </div>
        ) : (
          paginatedItems.map((item) => (
            <div
              key={item.ideaId}
              className={`border rounded-lg p-6 hover:shadow-lg transition-shadow ${
                savedIds.has(item.ideaId)
                  ? "border-blue-300 bg-blue-50/30"
                  : "border-gray-200"
              }`}
            >
              {/* Header */}
              <div className="flex justify-between items-start mb-4">
                <div className="flex-1">
                  <h3 className="text-xl font-semibold">
                    {item.idea.quickFilter.domain}
                  </h3>
                  <p className="text-gray-600 mt-1">
                    {item.idea.quickFilter.reason}
                  </p>
                </div>

                {/* Badges */}
                <div className="flex gap-2 ml-4">
                  <span
                    className={`px-3 py-1 rounded-full text-sm font-medium ${
                      item.idea.quickFilter.urgency === "high"
                        ? "bg-red-100 text-red-800"
                        : item.idea.quickFilter.urgency === "medium"
                          ? "bg-yellow-100 text-yellow-800"
                          : "bg-green-100 text-green-800"
                    }`}
                  >
                    {item.idea.quickFilter.urgency === "high" ? "高" : item.idea.quickFilter.urgency === "medium" ? "中" : "低"}
                  </span>
                  <span className="px-3 py-1 rounded-full text-sm font-medium bg-gray-100 text-gray-700 capitalize">
                    {item.idea.source}
                  </span>
                </div>
              </div>

              {/* Problem Statement */}
              <div className="bg-gray-50 p-4 rounded-lg mb-4">
                <div className="text-sm font-semibold text-gray-700 mb-2">
                  課題
                </div>
                <p className="text-gray-700">
                  {item.idea.needsAnalysis.problemStatement}
                </p>
              </div>

              {/* Details Grid */}
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <div className="text-sm font-semibold text-gray-700">
                    ターゲットユーザー
                  </div>
                  <p className="text-gray-600">
                    {item.idea.needsAnalysis.targetUsers}
                  </p>
                </div>

                <div>
                  <div className="text-sm font-semibold text-gray-700">
                    主なユースケース
                  </div>
                  <p className="text-gray-600">
                    {item.idea.needsAnalysis.mainUseCases.slice(0, 2).join("、")}
                  </p>
                </div>

                <div>
                  <div className="text-sm font-semibold text-gray-700">
                    課金モデル
                  </div>
                  <p className="text-gray-600 capitalize">
                    {item.idea.needsAnalysis.billingModel}
                  </p>
                </div>

                <div>
                  <div className="text-sm font-semibold text-gray-700">
                    必要機能
                  </div>
                  <p className="text-gray-600 text-sm">
                    {item.idea.needsAnalysis.requiredFeatures.slice(0, 3).join("、")}
                    {item.idea.needsAnalysis.requiredFeatures.length > 3 &&
                      ` 他${item.idea.needsAnalysis.requiredFeatures.length - 3}件`}
                  </p>
                </div>
              </div>

              {/* Template Match */}
              <div className="mb-4 p-4 border border-gray-200 rounded-lg bg-white">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="text-sm font-semibold text-gray-700">
                      テンプレートマッチ
                    </div>
                    <div className="mt-2 space-y-1">
                      <div className="text-sm">
                        <span className="font-medium">タイプ:</span>{" "}
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                            item.templateMatch.type === "matched"
                              ? "bg-green-100 text-green-800"
                              : item.templateMatch.type === "gap_detected"
                                ? "bg-yellow-100 text-yellow-800"
                                : "bg-gray-100 text-gray-800"
                          }`}
                        >
                          {item.templateMatch.type === "matched"
                            ? "マッチ"
                            : item.templateMatch.type === "gap_detected"
                              ? "ギャップ検出"
                              : "マッチなし"}
                        </span>
                      </div>
                      {item.templateMatch.templateKey && (
                        <div className="text-sm">
                          <span className="font-medium">テンプレート:</span>{" "}
                          {item.templateMatch.templateKey}
                        </div>
                      )}
                      <div className="text-sm">
                        <span className="font-medium">信頼度:</span>{" "}
                        <span
                          className={`font-semibold ${
                            item.templateMatch.confidence >= 70
                              ? "text-green-600"
                              : item.templateMatch.confidence >= 40
                                ? "text-yellow-600"
                                : "text-red-600"
                          }`}
                        >
                          {item.templateMatch.confidence}%
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Ranking Score */}
                  <div className="text-right">
                    <div className="text-sm font-semibold text-gray-700">
                      スコア
                    </div>
                    <div className="text-2xl font-bold text-blue-600 mt-2">
                      {item.rankingScore}
                    </div>
                    <p className="text-xs text-gray-600 mt-1 max-w-[160px]">
                      {item.rankingReason}
                    </p>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={() => handleBuildThis(item)}
                  disabled={buildingId === item.ideaId}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium disabled:opacity-50"
                >
                  {buildingId === item.ideaId ? "準備中..." : "このアイデアで作る"}
                </button>
                <button
                  onClick={() => handleSave(item.ideaId)}
                  className={`px-4 py-2 border rounded-lg font-medium ${
                    savedIds.has(item.ideaId)
                      ? "border-blue-400 bg-blue-50 text-blue-700"
                      : "border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  {savedIds.has(item.ideaId) ? "保存済み" : "保存"}
                </button>
                <button
                  onClick={() => handleDismiss(item.ideaId)}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-500 text-sm"
                >
                  非表示
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-2 pt-4">
          <button
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="px-3 py-1 border rounded-lg hover:bg-gray-50 disabled:opacity-40"
          >
            前へ
          </button>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
            <button
              key={page}
              onClick={() => setCurrentPage(page)}
              className={`px-3 py-1 border rounded-lg ${
                page === currentPage
                  ? "bg-blue-600 text-white border-blue-600"
                  : "hover:bg-gray-50"
              }`}
            >
              {page}
            </button>
          ))}
          <button
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            className="px-3 py-1 border rounded-lg hover:bg-gray-50 disabled:opacity-40"
          >
            次へ
          </button>
        </div>
      )}
    </div>
  );
}
