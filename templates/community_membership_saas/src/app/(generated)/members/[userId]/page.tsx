"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  MemberProfileCard,
  MemberProfileCardSkeleton,
} from "@/components/domain/member-profile-card";
import type { Post, Comment, Tag, LevelConfig, AppRole } from "@/types/database";
import { DEFAULT_LEVEL_THRESHOLDS } from "@/types/database";

// ─── Types ───

interface MemberData {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  headline: string | null;
  bio: string | null;
  social_links: Record<string, string> | null;
  role: AppRole;
  joined_at: string;
  // Points
  total_points: number;
  level: number;
  level_name: string;
  next_level_name: string | null;
  points_to_next_level: number | null;
  next_level_min_points: number | null;
  // Activity
  posts_count: number;
  comments_count: number;
  likes_received: number;
  // Extras
  tags: Pick<Tag, "id" | "name" | "color">[];
  plan_name: string | null;
}

interface RecentPost {
  id: string;
  title: string;
  like_count: number;
  comment_count: number;
  published_at: string | null;
  created_at: string;
  category_name: string | null;
}

interface RecentComment {
  id: string;
  post_id: string;
  post_title: string;
  body_preview: string;
  created_at: string;
}

// ─── Helpers ───

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 60) return "たった今";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}分前`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}時間前`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return `${diffDay}日前`;
  const diffWeek = Math.floor(diffDay / 7);
  if (diffWeek < 4) return `${diffWeek}週間前`;
  const diffMonth = Math.floor(diffDay / 30);
  if (diffMonth < 12) return `${diffMonth}ヶ月前`;
  const diffYear = Math.floor(diffDay / 365);
  return `${diffYear}年前`;
}

// ─── Skeleton components ───

function ActivitySkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="bg-white rounded-lg border border-gray-200 p-4"
        >
          <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
          <div className="h-3 bg-gray-100 rounded w-1/2" />
        </div>
      ))}
    </div>
  );
}

// ─── Page ───

export default function MemberProfilePage() {
  const router = useRouter();
  const params = useParams<{ userId: string }>();
  const userId = params.userId;

  // Tenant context
  const tenantId =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("tenantId") ?? ""
      : "";

  // State
  const [member, setMember] = useState<MemberData | null>(null);
  const [recentPosts, setRecentPosts] = useState<RecentPost[]>([]);
  const [recentComments, setRecentComments] = useState<RecentComment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isOwnProfile, setIsOwnProfile] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"posts" | "comments">("posts");

  // Fetch member data
  const fetchMemberData = useCallback(async () => {
    if (!tenantId || !userId) return;

    setIsLoading(true);
    setError(null);

    try {
      // Fetch member info + points
      const memberRes = await fetch(
        `/api/admin/tenants/${tenantId}/members/${userId}`
      );

      if (!memberRes.ok) {
        if (memberRes.status === 404) {
          throw new Error("メンバーが見つかりませんでした");
        }
        throw new Error("メンバー情報の取得に失敗しました");
      }

      const memberData = await memberRes.json();
      const m = memberData.member ?? memberData;

      // Build profile with defaults for missing fields
      const profile: MemberData = {
        user_id: m.user_id ?? userId,
        display_name: m.display_name ?? m.user?.display_name ?? null,
        avatar_url: m.avatar_url ?? m.user?.avatar_url ?? null,
        headline: m.headline ?? m.user?.headline ?? null,
        bio: m.bio ?? m.user?.bio ?? null,
        social_links: m.social_links ?? m.user?.social_links ?? null,
        role: m.role ?? "member",
        joined_at: m.joined_at ?? m.created_at ?? new Date().toISOString(),
        total_points: m.total_points ?? 0,
        level: m.level ?? 1,
        level_name: m.level_name ?? "Newcomer",
        next_level_name: m.next_level_name ?? null,
        points_to_next_level: m.points_to_next_level ?? null,
        next_level_min_points: m.next_level_min_points ?? null,
        posts_count: m.posts_count ?? 0,
        comments_count: m.comments_count ?? 0,
        likes_received: m.likes_received ?? 0,
        tags: m.tags ?? [],
        plan_name: m.plan_name ?? null,
      };

      setMember(profile);

      // Check if own profile
      try {
        const meRes = await fetch("/api/me");
        if (meRes.ok) {
          const meData = await meRes.json();
          setIsOwnProfile(meData.id === userId || meData.user?.id === userId);
        }
      } catch {
        // Not logged in or error — not own profile
      }

      // Fetch recent posts by this user
      try {
        const postsRes = await fetch(
          `/api/admin/tenants/${tenantId}/posts?author_id=${userId}&status=published&limit=5`
        );
        if (postsRes.ok) {
          const postsData = await postsRes.json();
          const posts = (postsData.posts ?? []).map((p: any) => ({
            id: p.id,
            title: p.title,
            like_count: p.like_count ?? 0,
            comment_count: p.comment_count ?? 0,
            published_at: p.published_at,
            created_at: p.created_at,
            category_name: p.category?.name ?? null,
          }));
          setRecentPosts(posts);
        }
      } catch {
        // Non-critical
      }

      // Fetch recent comments by this user
      try {
        const commentsRes = await fetch(
          `/api/admin/tenants/${tenantId}/posts?commenter_id=${userId}&limit=5`
        );
        if (commentsRes.ok) {
          const commentsData = await commentsRes.json();
          const comments = (commentsData.comments ?? []).map((c: any) => ({
            id: c.id,
            post_id: c.post_id,
            post_title: c.post_title ?? "投稿",
            body_preview:
              typeof c.body === "string"
                ? c.body.slice(0, 100)
                : "コメント",
            created_at: c.created_at,
          }));
          setRecentComments(comments);
        }
      } catch {
        // Non-critical
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "データの取得中にエラーが発生しました"
      );
    } finally {
      setIsLoading(false);
    }
  }, [tenantId, userId]);

  useEffect(() => {
    fetchMemberData();
  }, [fetchMemberData]);

  const handleEditProfile = useCallback(() => {
    const params = tenantId ? `?tenantId=${tenantId}` : "";
    router.push(`/settings/profile${params}`);
  }, [router, tenantId]);

  const handlePostClick = useCallback(
    (postId: string) => {
      const params = tenantId ? `?tenantId=${tenantId}` : "";
      router.push(`/community/${postId}${params}`);
    },
    [router, tenantId]
  );

  // ─── Error state ───
  if (error && !isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white border-b border-gray-200">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4">
            <nav className="text-sm text-gray-500" aria-label="パンくず">
              <ol className="flex items-center gap-1.5">
                <li>
                  <button
                    type="button"
                    onClick={() => router.back()}
                    className="hover:text-gray-700 transition-colors"
                  >
                    メンバー
                  </button>
                </li>
                <li aria-hidden="true">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                    <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                  </svg>
                </li>
                <li className="text-gray-400">エラー</li>
              </ol>
            </nav>
          </div>
        </header>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
          <div className="bg-white rounded-xl border border-gray-200 py-16 text-center">
            <div className="text-4xl mb-3" aria-hidden="true">
              😔
            </div>
            <p className="text-gray-700 font-medium">{error}</p>
            <p className="text-gray-400 text-sm mt-1">
              URLを確認するか、しばらくしてからもう一度お試しください
            </p>
            <button
              type="button"
              onClick={fetchMemberData}
              className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              再試行する
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header with breadcrumb */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4">
          <nav className="text-sm text-gray-500" aria-label="パンくず">
            <ol className="flex items-center gap-1.5">
              <li>
                <button
                  type="button"
                  onClick={() => router.back()}
                  className="hover:text-gray-700 transition-colors"
                >
                  メンバー
                </button>
              </li>
              <li aria-hidden="true">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                  <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                </svg>
              </li>
              <li className="text-gray-900 font-medium truncate max-w-[200px]">
                {isLoading
                  ? "読み込み中..."
                  : member?.display_name ?? "メンバー"}
              </li>
            </ol>
          </nav>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Profile card */}
        {isLoading ? (
          <MemberProfileCardSkeleton />
        ) : member ? (
          <MemberProfileCard
            member={member}
            isOwnProfile={isOwnProfile}
            onEditProfile={handleEditProfile}
          />
        ) : null}

        {/* Activity feed */}
        {!isLoading && member && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {/* Tab navigation */}
            <div className="flex border-b border-gray-200">
              <button
                type="button"
                onClick={() => setActiveTab("posts")}
                className={`
                  flex-1 px-4 py-3 text-sm font-medium text-center transition-colors
                  ${
                    activeTab === "posts"
                      ? "text-blue-600 border-b-2 border-blue-600 bg-blue-50/30"
                      : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                  }
                `}
                aria-selected={activeTab === "posts"}
                role="tab"
              >
                最近の投稿
                {recentPosts.length > 0 && (
                  <span className="ml-1.5 text-xs tabular-nums bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">
                    {recentPosts.length}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("comments")}
                className={`
                  flex-1 px-4 py-3 text-sm font-medium text-center transition-colors
                  ${
                    activeTab === "comments"
                      ? "text-blue-600 border-b-2 border-blue-600 bg-blue-50/30"
                      : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                  }
                `}
                aria-selected={activeTab === "comments"}
                role="tab"
              >
                最近のコメント
                {recentComments.length > 0 && (
                  <span className="ml-1.5 text-xs tabular-nums bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">
                    {recentComments.length}
                  </span>
                )}
              </button>
            </div>

            {/* Tab content */}
            <div className="p-4" role="tabpanel">
              {activeTab === "posts" && (
                <>
                  {recentPosts.length === 0 ? (
                    <div className="py-10 text-center">
                      <p className="text-gray-400 text-sm">
                        まだ投稿がありません
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {recentPosts.map((post) => (
                        <button
                          key={post.id}
                          type="button"
                          onClick={() => handlePostClick(post.id)}
                          className="
                            w-full text-left p-3 rounded-lg
                            hover:bg-gray-50 transition-colors
                            focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1
                          "
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <h4 className="text-sm font-semibold text-gray-900 truncate">
                                {post.title}
                              </h4>
                              <div className="flex items-center gap-3 mt-1">
                                {post.category_name && (
                                  <span className="text-[11px] text-gray-400">
                                    {post.category_name}
                                  </span>
                                )}
                                <span className="text-[11px] text-gray-400 flex items-center gap-0.5">
                                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                                    <path d="M9.653 16.915l-.005-.003-.019-.01a20.759 20.759 0 01-1.162-.682 22.045 22.045 0 01-2.582-1.9C4.045 12.733 2 10.352 2 7.5a4.5 4.5 0 018-2.828A4.5 4.5 0 0118 7.5c0 2.852-2.044 5.233-3.885 6.82a22.049 22.049 0 01-3.744 2.582l-.019.01-.005.003h-.002a.723.723 0 01-.692 0h-.002z" />
                                  </svg>
                                  {post.like_count}
                                </span>
                                <span className="text-[11px] text-gray-400 flex items-center gap-0.5">
                                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                                    <path fillRule="evenodd" d="M3.43 2.524A41.29 41.29 0 0110 2c2.236 0 4.43.18 6.57.524 1.437.231 2.43 1.49 2.43 2.902v5.148c0 1.413-.993 2.67-2.43 2.902a41.202 41.202 0 01-5.183.501.78.78 0 00-.528.224l-3.579 3.58A.75.75 0 016 17.25v-3.443a41.033 41.033 0 01-2.57-.33C2.012 13.246 1 11.99 1 10.574V5.426c0-1.413.993-2.67 2.43-2.902z" clipRule="evenodd" />
                                  </svg>
                                  {post.comment_count}
                                </span>
                              </div>
                            </div>
                            <time
                              dateTime={post.published_at ?? post.created_at}
                              className="text-[11px] text-gray-400 flex-shrink-0 whitespace-nowrap"
                            >
                              {formatRelativeTime(
                                post.published_at ?? post.created_at
                              )}
                            </time>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}

              {activeTab === "comments" && (
                <>
                  {recentComments.length === 0 ? (
                    <div className="py-10 text-center">
                      <p className="text-gray-400 text-sm">
                        まだコメントがありません
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {recentComments.map((comment) => (
                        <button
                          key={comment.id}
                          type="button"
                          onClick={() => handlePostClick(comment.post_id)}
                          className="
                            w-full text-left p-3 rounded-lg
                            hover:bg-gray-50 transition-colors
                            focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1
                          "
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <p className="text-xs text-gray-400 mb-0.5">
                                「{comment.post_title}」へのコメント
                              </p>
                              <p className="text-sm text-gray-700 line-clamp-2">
                                {comment.body_preview}
                              </p>
                            </div>
                            <time
                              dateTime={comment.created_at}
                              className="text-[11px] text-gray-400 flex-shrink-0 whitespace-nowrap"
                            >
                              {formatRelativeTime(comment.created_at)}
                            </time>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* Activity loading skeleton */}
        {isLoading && <ActivitySkeleton />}

        {/* Edit profile CTA for own profile */}
        {!isLoading && isOwnProfile && (
          <div className="text-center py-2">
            <button
              type="button"
              onClick={handleEditProfile}
              className="text-sm text-blue-600 hover:text-blue-700 font-medium transition-colors"
            >
              設定からプロフィールを編集する →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
