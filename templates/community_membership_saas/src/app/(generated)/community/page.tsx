"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { PostCard } from "@/components/domain/post-card";
import { CategorySidebar } from "@/components/domain/category-sidebar";
import type { PostWithRelations } from "@/components/domain/post-card";
import type { Category } from "@/types/database";

interface CategoryWithCount extends Category {
  post_count?: number;
}

type SortMode = "newest" | "popular";

// Skeleton loader for post cards
function PostCardSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 animate-pulse">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-full bg-gray-200" />
        <div className="flex-1 space-y-1.5">
          <div className="h-3.5 bg-gray-200 rounded w-24" />
          <div className="h-3 bg-gray-100 rounded w-16" />
        </div>
        <div className="h-3 bg-gray-100 rounded w-12" />
      </div>
      <div className="h-5 bg-gray-200 rounded w-3/4 mb-2" />
      <div className="space-y-1.5 mb-3">
        <div className="h-3.5 bg-gray-100 rounded w-full" />
        <div className="h-3.5 bg-gray-100 rounded w-5/6" />
      </div>
      <div className="pt-2 border-t border-gray-100 flex items-center gap-3">
        <div className="h-5 bg-gray-100 rounded-full w-20" />
        <div className="flex-1" />
        <div className="h-3.5 bg-gray-100 rounded w-10" />
        <div className="h-3.5 bg-gray-100 rounded w-10" />
      </div>
    </div>
  );
}

/**
 * Community feed page.
 *
 * Uses tenantId from a hard-coded demo value for now. In production this would
 * come from auth context or route params.
 */
export default function CommunityPage() {
  const router = useRouter();

  // In production these would come from auth context / route params
  const tenantId = typeof window !== "undefined"
    ? (new URLSearchParams(window.location.search).get("tenantId") ?? "")
    : "";

  const [posts, setPosts] = useState<PostWithRelations[]>([]);
  const [categories, setCategories] = useState<CategoryWithCount[]>([]);
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>("newest");
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [showWelcome, setShowWelcome] = useState(true);

  // Fetch categories
  useEffect(() => {
    if (!tenantId) return;

    (async () => {
      try {
        const res = await fetch(
          `/api/admin/tenants/${tenantId}/categories`
        );
        if (res.ok) {
          const data = await res.json();
          setCategories(data.categories ?? []);
        }
      } catch {
        // Categories are non-critical
      }
    })();
  }, [tenantId]);

  // Fetch posts
  const fetchPosts = useCallback(async () => {
    if (!tenantId) return;

    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        status: "published",
      });

      if (activeCategoryId) {
        params.set("category_id", activeCategoryId);
      }

      const res = await fetch(
        `/api/admin/tenants/${tenantId}/posts?${params.toString()}`
      );

      if (res.ok) {
        const data = await res.json();
        setPosts(data.posts ?? []);
        if (data.pagination) {
          setTotalPages(data.pagination.total_pages ?? 1);
        }
      }
    } catch {
      // Handle silently
    } finally {
      setIsLoading(false);
    }
  }, [tenantId, activeCategoryId, page]);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  // Sort and filter posts client-side
  const displayPosts = useMemo(() => {
    let filtered = [...posts];

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      filtered = filtered.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          (p.author?.display_name?.toLowerCase().includes(q) ?? false)
      );
    }

    // Sort
    if (sortMode === "popular") {
      filtered.sort((a, b) => {
        // Pinned posts always first
        if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
        return b.like_count - a.like_count;
      });
    }
    // "newest" is the default sort from the API (pinned first, then created_at desc)

    return filtered;
  }, [posts, searchQuery, sortMode]);

  const totalPostCount = posts.length;

  const handlePostClick = useCallback(
    (postId: string) => {
      const params = tenantId ? `?tenantId=${tenantId}` : "";
      router.push(`/community/${postId}${params}`);
    },
    [router, tenantId]
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
          <h1 className="text-2xl font-bold text-gray-900">コミュニティ</h1>
        </div>
      </header>

      {/* Welcome banner */}
      {showWelcome && (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 mt-4">
          <div className="relative bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-4">
            <button
              type="button"
              onClick={() => setShowWelcome(false)}
              className="absolute top-2 right-2 p-1 text-blue-400 hover:text-blue-600 transition-colors"
              aria-label="バナーを閉じる"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
              </svg>
            </button>
            <p className="text-sm text-blue-800 pr-6">
              👋 コミュニティへようこそ! 気になるカテゴリを選んで、会話に参加しましょう。
            </p>
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Sidebar - desktop: left column, mobile: top horizontal scroll */}
          <aside className="lg:w-56 flex-shrink-0">
            <div className="lg:sticky lg:top-6">
              <CategorySidebar
                categories={categories}
                activeCategoryId={activeCategoryId}
                totalPostCount={totalPostCount}
                onCategoryChange={(id) => {
                  setActiveCategoryId(id);
                  setPage(1);
                }}
              />
            </div>
          </aside>

          {/* Main content */}
          <main className="flex-1 min-w-0">
            {/* Search and sort controls */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-6">
              {/* Search */}
              <div className="relative flex-1">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
                    clipRule="evenodd"
                  />
                </svg>
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="投稿を検索..."
                  className="
                    w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm
                    placeholder-gray-400 text-gray-900 bg-white
                    focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                    transition-shadow
                  "
                  aria-label="投稿を検索"
                />
              </div>

              {/* Sort */}
              <div className="flex rounded-lg border border-gray-200 bg-white overflow-hidden flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setSortMode("newest")}
                  className={`px-4 py-2.5 text-sm font-medium transition-colors ${
                    sortMode === "newest"
                      ? "bg-gray-900 text-white"
                      : "text-gray-600 hover:bg-gray-50"
                  }`}
                  aria-pressed={sortMode === "newest"}
                >
                  新着順
                </button>
                <button
                  type="button"
                  onClick={() => setSortMode("popular")}
                  className={`px-4 py-2.5 text-sm font-medium transition-colors ${
                    sortMode === "popular"
                      ? "bg-gray-900 text-white"
                      : "text-gray-600 hover:bg-gray-50"
                  }`}
                  aria-pressed={sortMode === "popular"}
                >
                  人気順
                </button>
              </div>
            </div>

            {/* Post feed */}
            {isLoading ? (
              <div className="space-y-4" aria-busy="true" aria-label="読み込み中">
                <PostCardSkeleton />
                <PostCardSkeleton />
                <PostCardSkeleton />
              </div>
            ) : displayPosts.length === 0 ? (
              <div className="py-20 text-center">
                <div className="text-4xl mb-3" aria-hidden="true">
                  📝
                </div>
                <p className="text-gray-500 text-sm leading-relaxed">
                  まだ投稿がありません。最初の投稿を作成して、
                  <br />
                  コミュニティを盛り上げましょう! 🎉
                </p>
                <button
                  type="button"
                  onClick={() => {
                    const params = tenantId ? `?tenantId=${tenantId}` : "";
                    router.push(`/community/new${params}`);
                  }}
                  className="
                    mt-4 inline-flex items-center gap-2 px-5 py-2.5 rounded-lg
                    bg-blue-600 text-white text-sm font-semibold
                    hover:bg-blue-700 transition-colors
                  "
                >
                  最初の投稿を作成する
                </button>
              </div>
            ) : (
              <>
                <div className="space-y-4">
                  {displayPosts.map((post) => (
                    <PostCard
                      key={post.id}
                      post={post}
                      onClick={handlePostClick}
                    />
                  ))}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex justify-center items-center gap-2 mt-8">
                    <button
                      type="button"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page <= 1}
                      className="px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      aria-label="前のページ"
                    >
                      前へ
                    </button>
                    <span className="text-sm text-gray-500 tabular-nums px-2">
                      {page} / {totalPages}
                    </span>
                    <button
                      type="button"
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page >= totalPages}
                      className="px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      aria-label="次のページ"
                    >
                      次へ
                    </button>
                  </div>
                )}
              </>
            )}
          </main>
        </div>
      </div>

      {/* FAB - New Post */}
      <button
        type="button"
        onClick={() => {
          const params = tenantId ? `?tenantId=${tenantId}` : "";
          router.push(`/community/new${params}`);
        }}
        className="
          fixed bottom-6 right-6 z-50
          w-14 h-14 rounded-full bg-blue-600 text-white shadow-lg
          hover:bg-blue-700 hover:shadow-xl
          focus:outline-none focus:ring-4 focus:ring-blue-300
          transition-all duration-200
          flex items-center justify-center
          active:scale-95
        "
        aria-label="新規投稿"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="currentColor"
          className="w-6 h-6"
        >
          <path
            fillRule="evenodd"
            d="M12 3.75a.75.75 0 01.75.75v6.75h6.75a.75.75 0 010 1.5h-6.75v6.75a.75.75 0 01-1.5 0v-6.75H4.5a.75.75 0 010-1.5h6.75V4.5a.75.75 0 01.75-.75z"
            clipRule="evenodd"
          />
        </svg>
      </button>
    </div>
  );
}
