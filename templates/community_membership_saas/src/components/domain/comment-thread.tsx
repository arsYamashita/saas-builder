"use client";

import { useState, useCallback } from "react";
import type { Comment, User, RichTextBody } from "@/types/database";
import { ReactionButton } from "@/components/domain/reaction-button";
import { proseMirrorToPlainText } from "@/components/domain/rich-text-editor";

/** Comment with joined author from the API, plus nested replies */
export interface CommentWithRelations extends Omit<Comment, "author_id"> {
  author_id: string;
  author: Pick<User, "display_name" | "avatar_url"> | null;
  replies?: CommentWithRelations[];
}

interface CommentThreadProps {
  tenantId: string;
  postId: string;
  comments: CommentWithRelations[];
  currentUserId: string | null;
  onCommentCreated: () => void;
}

function getInitials(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function formatRelativeTime(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime();
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
  return `${Math.floor(diffDay / 365)}年前`;
}

function CommentItem({
  comment,
  tenantId,
  postId,
  currentUserId,
  isReply,
  onCommentCreated,
}: {
  comment: CommentWithRelations;
  tenantId: string;
  postId: string;
  currentUserId: string | null;
  isReply?: boolean;
  onCommentCreated: () => void;
}) {
  const [showReplyForm, setShowReplyForm] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [isSubmittingReply, setIsSubmittingReply] = useState(false);

  const displayName = comment.author?.display_name ?? "名前未設定";
  const avatarUrl = comment.author?.avatar_url;
  const bodyText = proseMirrorToPlainText(comment.body);

  const handleReplySubmit = useCallback(async () => {
    if (!replyText.trim() || isSubmittingReply) return;

    setIsSubmittingReply(true);
    try {
      const bodyJson: RichTextBody = {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: replyText.trim() }],
          },
        ],
      };

      const res = await fetch(
        `/api/admin/tenants/${tenantId}/posts/${postId}/comments`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            body: bodyJson,
            parent_id: comment.id,
          }),
        }
      );

      if (res.ok) {
        setReplyText("");
        setShowReplyForm(false);
        onCommentCreated();
      }
    } catch {
      // Silently handle - user can retry
    } finally {
      setIsSubmittingReply(false);
    }
  }, [replyText, isSubmittingReply, tenantId, postId, comment.id, onCommentCreated]);

  return (
    <div
      className={`${isReply ? "ml-10 pl-4 border-l-2 border-gray-100" : ""}`}
    >
      <div className="flex gap-3 py-4">
        {/* Avatar */}
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={`${displayName}のアバター`}
            className="w-8 h-8 rounded-full object-cover flex-shrink-0 mt-0.5"
          />
        ) : (
          <div
            className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0 mt-0.5"
            aria-hidden="true"
          >
            {getInitials(displayName)}
          </div>
        )}

        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-semibold text-gray-900">
              {displayName}
            </span>
            <time
              dateTime={comment.created_at}
              className="text-xs text-gray-400"
            >
              {formatRelativeTime(comment.created_at)}
            </time>
          </div>

          {/* Body */}
          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
            {bodyText}
          </p>

          {/* Actions */}
          <div className="flex items-center gap-3 mt-2">
            <ReactionButton
              targetType="comment"
              targetId={comment.id}
              tenantId={tenantId}
              initialCount={comment.like_count}
              initialLiked={false}
            />

            {/* Only show reply button for top-level comments */}
            {!isReply && currentUserId && (
              <button
                type="button"
                onClick={() => setShowReplyForm(!showReplyForm)}
                className="text-xs text-gray-500 hover:text-gray-700 font-medium transition-colors"
                aria-label="返信する"
              >
                返信
              </button>
            )}
          </div>

          {/* Inline reply form */}
          {showReplyForm && (
            <div className="mt-3 flex gap-2">
              <input
                type="text"
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder="返信を入力..."
                className="
                  flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm
                  placeholder-gray-400 text-gray-900
                  focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                "
                aria-label="返信テキスト"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleReplySubmit();
                  }
                }}
              />
              <button
                type="button"
                onClick={handleReplySubmit}
                disabled={!replyText.trim() || isSubmittingReply}
                className="
                  px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium
                  hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed
                  transition-colors
                "
              >
                {isSubmittingReply ? "送信中..." : "送信"}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Replies */}
      {comment.replies && comment.replies.length > 0 && (
        <div>
          {comment.replies.map((reply) => (
            <CommentItem
              key={reply.id}
              comment={reply}
              tenantId={tenantId}
              postId={postId}
              currentUserId={currentUserId}
              isReply
              onCommentCreated={onCommentCreated}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function CommentThread({
  tenantId,
  postId,
  comments,
  currentUserId,
  onCommentCreated,
}: CommentThreadProps) {
  const [newComment, setNewComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = useCallback(async () => {
    if (!newComment.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const bodyJson: RichTextBody = {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: newComment.trim() }],
          },
        ],
      };

      const res = await fetch(
        `/api/admin/tenants/${tenantId}/posts/${postId}/comments`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: bodyJson }),
        }
      );

      if (res.ok) {
        setNewComment("");
        onCommentCreated();
      }
    } catch {
      // Silently handle
    } finally {
      setIsSubmitting(false);
    }
  }, [newComment, isSubmitting, tenantId, postId, onCommentCreated]);

  return (
    <section aria-label="コメント">
      <h2 className="text-lg font-bold text-gray-900 mb-4">
        コメント ({comments.length})
      </h2>

      {/* Comment list */}
      {comments.length === 0 ? (
        <div className="py-12 text-center">
          <div className="text-3xl mb-2" aria-hidden="true">
            💬
          </div>
          <p className="text-sm text-gray-500">
            まだコメントはありません。最初のコメントを投稿しましょう!
          </p>
        </div>
      ) : (
        <div className="divide-y divide-gray-100">
          {comments.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              tenantId={tenantId}
              postId={postId}
              currentUserId={currentUserId}
              onCommentCreated={onCommentCreated}
            />
          ))}
        </div>
      )}

      {/* New comment form */}
      {currentUserId && (
        <div className="mt-6 pt-4 border-t border-gray-200">
          <label htmlFor="new-comment" className="sr-only">
            新しいコメント
          </label>
          <div className="flex gap-2">
            <textarea
              id="new-comment"
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="コメントを入力..."
              rows={2}
              className="
                flex-1 px-4 py-3 border border-gray-200 rounded-lg text-sm
                placeholder-gray-400 text-gray-900 resize-none
                focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                transition-shadow
              "
              aria-label="コメントを入力"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
            />
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!newComment.trim() || isSubmitting}
              className="
                self-end px-5 py-3 rounded-lg bg-blue-600 text-white text-sm font-semibold
                hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed
                transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
              "
            >
              {isSubmitting ? "送信中..." : "送信"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
