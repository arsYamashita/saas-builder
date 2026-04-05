"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { ReactionButton } from "@/components/domain/reaction-button";
import {
  CommentThread,
  type CommentWithRelations,
} from "@/components/domain/comment-thread";
import { proseMirrorToPlainText } from "@/components/domain/rich-text-editor";
import type { Post, Category, User } from "@/types/database";

interface PostDetail extends Post {
  author: Pick<User, "display_name" | "avatar_url"> | null;
  category: Pick<Category, "id" | "name" | "slug" | "emoji"> | null;
}

function PostDetailSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="h-4 bg-gray-200 rounded w-48 mb-6" />
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 rounded-full bg-gray-200" />
        <div className="space-y-2">
          <div className="h-4 bg-gray-200 rounded w-28" />
          <div className="h-3 bg-gray-100 rounded w-20" />
        </div>
      </div>
      <div className="h-7 bg-gray-200 rounded w-3/4 mb-4" />
      <div className="space-y-2 mb-6">
        <div className="h-4 bg-gray-100 rounded w-full" />
        <div className="h-4 bg-gray-100 rounded w-full" />
        <div className="h-4 bg-gray-100 rounded w-5/6" />
        <div className="h-4 bg-gray-100 rounded w-3/4" />
      </div>
    </div>
  );
}

function getInitials(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function formatDateTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function PostDetailPage() {
  const params = useParams<{ postId: string }>();
  const router = useRouter();
  const postId = params.postId;

  const tenantId =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("tenantId") ?? ""
      : "";

  const [post, setPost] = useState<PostDetail | null>(null);
  const [comments, setComments] = useState<CommentWithRelations[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // For now, current user id would come from auth context
  const currentUserId: string | null = null;

  // Fetch post
  const fetchPost = useCallback(async () => {
    if (!tenantId || !postId) return;

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/admin/tenants/${tenantId}/posts/${postId}`
      );

      if (!res.ok) {
        if (res.status === 404) {
          setError("投稿が見つかりませんでした");
        } else {
          setError("投稿の取得に失敗しました");
        }
        return;
      }

      const data = await res.json();
      setPost(data.post);
    } catch {
      setError("ネットワークエラーが発生しました");
    } finally {
      setIsLoading(false);
    }
  }, [tenantId, postId]);

  // Fetch comments
  const fetchComments = useCallback(async () => {
    if (!tenantId || !postId) return;

    try {
      const res = await fetch(
        `/api/admin/tenants/${tenantId}/posts/${postId}/comments`
      );

      if (res.ok) {
        const data = await res.json();
        setComments(data.comments ?? []);
      }
    } catch {
      // Comments are non-critical
    }
  }, [tenantId, postId]);

  useEffect(() => {
    fetchPost();
    fetchComments();
  }, [fetchPost, fetchComments]);

  const handleCopyLink = useCallback(() => {
    if (typeof window === "undefined") return;
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, []);

  const handleDelete = useCallback(async () => {
    if (!tenantId || !postId) return;
    if (!window.confirm("この投稿を削除しますか? この操作は取り消せません。")) return;

    try {
      const res = await fetch(
        `/api/admin/tenants/${tenantId}/posts/${postId}`,
        { method: "DELETE" }
      );

      if (res.ok) {
        const qp = tenantId ? `?tenantId=${tenantId}` : "";
        router.push(`/community${qp}`);
      }
    } catch {
      // Handle silently
    }
  }, [tenantId, postId, router]);

  const communityUrl = tenantId
    ? `/community?tenantId=${tenantId}`
    : "/community";

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4">
          <button
            type="button"
            onClick={() => router.push(communityUrl)}
            className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
            aria-label="コミュニティに戻る"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="w-4 h-4"
            >
              <path
                fillRule="evenodd"
                d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z"
                clipRule="evenodd"
              />
            </svg>
            コミュニティに戻る
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        {isLoading ? (
          <PostDetailSkeleton />
        ) : error ? (
          <div className="py-20 text-center">
            <div className="text-4xl mb-3" aria-hidden="true">
              😥
            </div>
            <p className="text-gray-500 text-sm">{error}</p>
            <button
              type="button"
              onClick={() => router.push(communityUrl)}
              className="mt-4 text-sm text-blue-600 hover:text-blue-800 font-medium"
            >
              コミュニティに戻る
            </button>
          </div>
        ) : post ? (
          <>
            {/* Breadcrumb */}
            <nav aria-label="パンくずリスト" className="mb-6">
              <ol className="flex items-center gap-1.5 text-sm text-gray-400 flex-wrap">
                <li>
                  <a
                    href={communityUrl}
                    className="hover:text-gray-600 transition-colors"
                  >
                    コミュニティ
                  </a>
                </li>
                <li aria-hidden="true">&gt;</li>
                {post.category && (
                  <>
                    <li>
                      <span className="text-gray-500">
                        {post.category.emoji && `${post.category.emoji} `}
                        {post.category.name}
                      </span>
                    </li>
                    <li aria-hidden="true">&gt;</li>
                  </>
                )}
                <li>
                  <span className="text-gray-600 font-medium truncate max-w-[200px] inline-block align-bottom">
                    {post.title}
                  </span>
                </li>
              </ol>
            </nav>

            {/* Post content */}
            <article className="bg-white rounded-xl border border-gray-200 p-6 sm:p-8">
              {/* Author */}
              <div className="flex items-center gap-3 mb-6">
                {post.author?.avatar_url ? (
                  <img
                    src={post.author.avatar_url}
                    alt={`${post.author.display_name ?? "ユーザー"}のアバター`}
                    className="w-12 h-12 rounded-full object-cover"
                  />
                ) : (
                  <div
                    className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-sm font-bold"
                    aria-hidden="true"
                  >
                    {getInitials(post.author?.display_name)}
                  </div>
                )}
                <div>
                  <p className="text-sm font-semibold text-gray-900">
                    {post.author?.display_name ?? "名前未設定"}
                  </p>
                  <time
                    dateTime={post.published_at ?? post.created_at}
                    className="text-xs text-gray-400"
                  >
                    {formatDateTime(post.published_at ?? post.created_at)}
                  </time>
                </div>
              </div>

              {/* Category badge */}
              {post.category && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-gray-100 text-xs text-gray-600 font-medium mb-4">
                  {post.category.emoji && (
                    <span aria-hidden="true">{post.category.emoji}</span>
                  )}
                  {post.category.name}
                </span>
              )}

              {/* Title */}
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-4 leading-tight">
                {post.is_pinned && (
                  <span className="mr-2 text-amber-500" aria-label="ピン留め">
                    📌
                  </span>
                )}
                {post.title}
              </h1>

              {/* Body */}
              <div className="prose prose-sm prose-gray max-w-none mb-6">
                <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">
                  {proseMirrorToPlainText(post.body)}
                </p>
              </div>

              {/* Actions bar */}
              <div className="flex items-center gap-3 pt-4 border-t border-gray-100">
                <ReactionButton
                  targetType="post"
                  targetId={post.id}
                  tenantId={tenantId}
                  initialCount={post.like_count}
                  initialLiked={false}
                />

                <span className="inline-flex items-center gap-1 text-sm text-gray-400">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className="w-4 h-4"
                  >
                    <path
                      fillRule="evenodd"
                      d="M3.43 2.524A41.29 41.29 0 0110 2c2.236 0 4.43.18 6.57.524 1.437.231 2.43 1.49 2.43 2.902v5.148c0 1.413-.993 2.67-2.43 2.902a41.202 41.202 0 01-5.183.501.78.78 0 00-.528.224l-3.579 3.58A.75.75 0 016 17.25v-3.443a41.033 41.033 0 01-2.57-.33C2.012 13.246 1 11.99 1 10.574V5.426c0-1.413.993-2.67 2.43-2.902z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span className="tabular-nums">{post.comment_count}</span>
                </span>

                <div className="flex-1" />

                {/* Share */}
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors"
                  aria-label="リンクをコピー"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className="w-4 h-4"
                  >
                    <path d="M12.232 4.232a2.5 2.5 0 013.536 3.536l-1.225 1.224a.75.75 0 001.061 1.06l1.224-1.224a4 4 0 00-5.656-5.656l-3 3a4 4 0 00.225 5.865.75.75 0 00.977-1.138 2.5 2.5 0 01-.142-3.667l3-3z" />
                    <path d="M11.603 7.963a.75.75 0 00-.977 1.138 2.5 2.5 0 01.142 3.667l-3 3a2.5 2.5 0 01-3.536-3.536l1.225-1.224a.75.75 0 00-1.061-1.06l-1.224 1.224a4 4 0 105.656 5.656l3-3a4 4 0 00-.225-5.865z" />
                  </svg>
                  {copied ? "コピー済み" : "共有"}
                </button>

                {/* Edit (would check auth in production) */}
                <button
                  type="button"
                  onClick={() => {
                    const qp = tenantId ? `?tenantId=${tenantId}` : "";
                    router.push(`/community/${post.id}/edit${qp}`);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors"
                  aria-label="投稿を編集"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className="w-4 h-4"
                  >
                    <path d="M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z" />
                  </svg>
                  編集
                </button>

                {/* Delete */}
                <button
                  type="button"
                  onClick={handleDelete}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-red-500 hover:bg-red-50 hover:text-red-700 transition-colors"
                  aria-label="投稿を削除"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className="w-4 h-4"
                  >
                    <path
                      fillRule="evenodd"
                      d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z"
                      clipRule="evenodd"
                    />
                  </svg>
                  削除
                </button>
              </div>
            </article>

            {/* Comments */}
            <div className="mt-8 bg-white rounded-xl border border-gray-200 p-6 sm:p-8">
              <CommentThread
                tenantId={tenantId}
                postId={post.id}
                comments={comments}
                currentUserId={currentUserId}
                onCommentCreated={fetchComments}
              />
            </div>
          </>
        ) : null}
      </main>
    </div>
  );
}
