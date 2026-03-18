"use client";

import { useEffect, useState } from "react";
import type { DiscoveryFeedItem, DataSourceType } from "@/lib/idea-discovery/core/types";

type FilterSource = DataSourceType | "all";
type FilterUrgency = "all" | "high" | "medium" | "low";

export default function DiscoveriesPage() {
  const [feedItems, setFeedItems] = useState<DiscoveryFeedItem[]>([]);
  const [filteredItems, setFilteredItems] = useState<DiscoveryFeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterSource, setFilterSource] = useState<FilterSource>("all");
  const [filterUrgency, setFilterUrgency] = useState<FilterUrgency>("all");
  const [filterDomain, setFilterDomain] = useState<string>("all");

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

  const handleBuildThis = (ideaId: string) => {
    // In a real implementation, this would navigate to project creation
    console.log("Build project from idea:", ideaId);
  };

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
      <div className="text-sm text-gray-600">
        Showing {filteredItems.length} of {feedItems.length} ideas
      </div>

      {/* Feed Items */}
      <div className="grid gap-4">
        {filteredItems.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            No ideas match your filters
          </div>
        ) : (
          filteredItems.map((item) => (
            <div
              key={item.ideaId}
              className="border border-gray-200 rounded-lg p-6 hover:shadow-lg transition-shadow"
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
                    {item.idea.quickFilter.urgency} urgency
                  </span>
                </div>
              </div>

              {/* Problem Statement */}
              <div className="bg-gray-50 p-4 rounded-lg mb-4">
                <div className="text-sm font-semibold text-gray-700 mb-2">
                  Problem Statement
                </div>
                <p className="text-gray-700">
                  {item.idea.needsAnalysis.problemStatement}
                </p>
              </div>

              {/* Details Grid */}
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <div className="text-sm font-semibold text-gray-700">
                    Target Users
                  </div>
                  <p className="text-gray-600">
                    {item.idea.needsAnalysis.targetUsers}
                  </p>
                </div>

                <div>
                  <div className="text-sm font-semibold text-gray-700">
                    Source
                  </div>
                  <p className="text-gray-600 capitalize">{item.idea.source}</p>
                </div>

                <div>
                  <div className="text-sm font-semibold text-gray-700">
                    Main Use Cases
                  </div>
                  <p className="text-gray-600">
                    {item.idea.needsAnalysis.mainUseCases.slice(0, 2).join(", ")}
                  </p>
                </div>

                <div>
                  <div className="text-sm font-semibold text-gray-700">
                    Billing Model
                  </div>
                  <p className="text-gray-600 capitalize">
                    {item.idea.needsAnalysis.billingModel}
                  </p>
                </div>
              </div>

              {/* Template Match */}
              <div className="mb-4 p-4 border border-gray-200 rounded-lg bg-white">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="text-sm font-semibold text-gray-700">
                      Template Match
                    </div>
                    <div className="mt-2 space-y-1">
                      <div className="text-sm">
                        <span className="font-medium">Type:</span>{" "}
                        <span className="capitalize">
                          {item.templateMatch.type.replace("_", " ")}
                        </span>
                      </div>
                      {item.templateMatch.templateKey && (
                        <div className="text-sm">
                          <span className="font-medium">Template:</span>{" "}
                          {item.templateMatch.templateKey}
                        </div>
                      )}
                      <div className="text-sm">
                        <span className="font-medium">Confidence:</span>{" "}
                        {item.templateMatch.confidence}%
                      </div>
                    </div>
                  </div>

                  {/* Engagement Score */}
                  <div className="text-right">
                    <div className="text-sm font-semibold text-gray-700">
                      Engagement
                    </div>
                    <div className="text-2xl font-bold text-blue-600 mt-2">
                      {item.rankingScore}%
                    </div>
                    <p className="text-xs text-gray-600 mt-1">
                      {item.rankingReason}
                    </p>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={() => handleBuildThis(item.ideaId)}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium"
                >
                  Build This
                </button>
                <button className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
                  View Details
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
