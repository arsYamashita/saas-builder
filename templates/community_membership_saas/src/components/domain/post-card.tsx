"use client";

import { useMemo } from "react";
import type { Post, Category, User } from "@/types/database";
import { proseMirrorToPlainText } from "@/components/domain/rich-text-editor";

/** Post with joined author and category from the API */
export interface PostWithRelations extends Omit<Post, "author_id" | "category_id"> {
  author_id: string;
  category_id: string;
  author: Pick<User, "display_name" | "avatar_url"> | null;
  category: Pick<Category, "name" | "slug" | "emoji"> | null;
}

interface PostCardProps {
  post: PostWithRelations;
  authorLevel?: number;
  authorHeadline?: string | null;
  onClick?: (postId: string) => void;
}

function getInitials(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

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

function LevelBadge({ level }: { level: number }) {
  const colors: Record<number, string> = {
    1: "bg-gray-100 text-gray-600",
    2: "bg-green-100 text-green-700",
    3: "bg-blue-100 text-blue-700",
    4: "bg-purple-100 text-purple-700",
    5: "bg-yellow-100 text-yellow-800",
    6: "bg-orange-100 text-orange-700",
    7: "bg-red-100 text-red-700",
    8: "bg-pink-100 text-pink-700",
    9: "bg-indigo-100 text-indigo-700",
  };
  const colorClass = colors[level] ?? colors[1];
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold leading-none ${colorClass}`}
      aria-label={`レベル ${level}`}
    >
      Lv.{level}
    </span>
  );
}

export function PostCard({
  post,
  authorLevel = 1,
  authorHeadline,
  onClick,
}: PostCardProps) {
  const displayName = post.author?.display_name ?? "名前未設定";
  const avatarUrl = post.author?.avatar_url;
  const initials = getInitials(displayName);

  const bodyPreview = useMemo(() => {
    const plain = proseMirrorToPlainText(post.body);
    if (plain.length <= 160) return plain;
    return plain.slice(0, 160) + "...";
  }, [post.body]);

  const relativeTime = useMemo(
    () => formatRelativeTime(post.published_at ?? post.created_at),
    [post.published_at, post.created_at]
  );

  return (
    <article
      role="article"
      tabIndex={0}
      aria-label={`${displayName}の投稿: ${post.title}`}
      onClick={() => onClick?.(post.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick?.(post.id);
        }
      }}
      className="
        group bg-white rounded-xl border border-gray-200 p-5
        hover:border-gray-300 hover:shadow-md
        transition-all duration-200 ease-out cursor-pointer
        focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
      "
    >
      {/* Author row */}
      <div className="flex items-center gap-3 mb-3">
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
            {initials}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-gray-900 truncate">
              {displayName}
            </span>
            <LevelBadge level={authorLevel} />
          </div>
          {authorHeadline && (
            <p className="text-xs text-gray-500 truncate mt-0.5">
              {authorHeadline}
            </p>
          )}
        </div>
        <time
          dateTime={post.published_at ?? post.created_at}
          className="text-xs text-gray-400 flex-shrink-0"
        >
          {relativeTime}
        </time>
      </div>

      {/* Title */}
      <h3 className="text-base font-bold text-gray-900 mb-1.5 group-hover:text-blue-600 transition-colors line-clamp-2">
        {post.is_pinned && (
          <span className="inline-block mr-1.5 text-amber-500" aria-label="ピン留め">
            📌
          </span>
        )}
        {post.title}
      </h3>

      {/* Body preview */}
      {bodyPreview && (
        <p className="text-sm text-gray-600 leading-relaxed line-clamp-3 mb-3">
          {bodyPreview}
        </p>
      )}

      {/* Footer */}
      <div className="flex items-center gap-3 pt-2 border-t border-gray-100">
        {/* Category badge */}
        {post.category && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 text-xs text-gray-600 font-medium">
            {post.category.emoji && (
              <span aria-hidden="true">{post.category.emoji}</span>
            )}
            {post.category.name}
          </span>
        )}

        <div className="flex-1" />

        {/* Like count */}
        <span
          className="inline-flex items-center gap-1 text-xs text-gray-400"
          aria-label={`いいね ${post.like_count}件`}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="w-3.5 h-3.5"
          >
            <path d="M9.653 16.915l-.005-.003-.019-.01a20.759 20.759 0 01-1.162-.682 22.045 22.045 0 01-2.582-1.9C4.045 12.733 2 10.352 2 7.5a4.5 4.5 0 018-2.828A4.5 4.5 0 0118 7.5c0 2.852-2.044 5.233-3.885 6.82a22.049 22.049 0 01-3.744 2.582l-.019.01-.005.003h-.002a.723.723 0 01-.692 0h-.002z" />
          </svg>
          <span className="tabular-nums">{post.like_count}</span>
        </span>

        {/* Comment count */}
        <span
          className="inline-flex items-center gap-1 text-xs text-gray-400"
          aria-label={`コメント ${post.comment_count}件`}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="w-3.5 h-3.5"
          >
            <path
              fillRule="evenodd"
              d="M3.43 2.524A41.29 41.29 0 0110 2c2.236 0 4.43.18 6.57.524 1.437.231 2.43 1.49 2.43 2.902v5.148c0 1.413-.993 2.67-2.43 2.902a41.202 41.202 0 01-5.183.501.78.78 0 00-.528.224l-3.579 3.58A.75.75 0 016 17.25v-3.443a41.033 41.033 0 01-2.57-.33C2.012 13.246 1 11.99 1 10.574V5.426c0-1.413.993-2.67 2.43-2.902z"
              clipRule="evenodd"
            />
          </svg>
          <span className="tabular-nums">{post.comment_count}</span>
        </span>
      </div>
    </article>
  );
}
