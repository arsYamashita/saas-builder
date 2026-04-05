"use client";

import { useState, useCallback } from "react";
import type { Category, RichTextBody, Post } from "@/types/database";
import { RichTextEditor, proseMirrorToPlainText } from "@/components/domain/rich-text-editor";

interface PostFormProps {
  tenantId: string;
  categories: Category[];
  /** If provided, the form enters edit mode */
  existingPost?: Post & { category?: Pick<Category, "id"> | null };
  onSuccess: (postId: string) => void;
  onCancel?: () => void;
}

export function PostForm({
  tenantId,
  categories,
  existingPost,
  onSuccess,
  onCancel,
}: PostFormProps) {
  const isEdit = !!existingPost;

  const [title, setTitle] = useState(existingPost?.title ?? "");
  const [categoryId, setCategoryId] = useState(
    existingPost?.category_id ?? ""
  );
  const [body, setBody] = useState<RichTextBody>(
    existingPost?.body ?? { type: "doc", content: [] }
  );
  const [plainText, setPlainText] = useState(
    existingPost ? proseMirrorToPlainText(existingPost.body) : ""
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isValid = title.trim().length > 0 && categoryId.length > 0;

  const handleBodyChange = useCallback(
    (newBody: RichTextBody, newPlainText: string) => {
      setBody(newBody);
      setPlainText(newPlainText);
    },
    []
  );

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!isValid || isSubmitting) return;

      setIsSubmitting(true);
      setError(null);

      try {
        const url = isEdit
          ? `/api/admin/tenants/${tenantId}/posts/${existingPost.id}`
          : `/api/admin/tenants/${tenantId}/posts`;

        const res = await fetch(url, {
          method: isEdit ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            category_id: categoryId,
            title: title.trim(),
            body,
          }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(
            data?.error ?? `投稿の${isEdit ? "更新" : "作成"}に失敗しました`
          );
        }

        const data = await res.json();
        onSuccess(data.post.id);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "予期しないエラーが発生しました"
        );
      } finally {
        setIsSubmitting(false);
      }
    },
    [isValid, isSubmitting, isEdit, tenantId, existingPost, categoryId, title, body, onSuccess]
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Helper text */}
      <p className="text-sm text-gray-500">
        カテゴリを選んで、コミュニティに投稿しましょう 💡
      </p>

      {/* Error */}
      {error && (
        <div
          role="alert"
          className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700"
        >
          {error}
        </div>
      )}

      {/* Title */}
      <div>
        <label
          htmlFor="post-title"
          className="block text-sm font-medium text-gray-700 mb-1.5"
        >
          タイトル
        </label>
        <input
          id="post-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="投稿のタイトルを入力..."
          required
          maxLength={200}
          className="
            w-full px-4 py-2.5 border border-gray-200 rounded-lg text-gray-900
            placeholder-gray-400 text-sm
            focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500
            transition-shadow
          "
          aria-label="投稿タイトル"
        />
      </div>

      {/* Category */}
      <div>
        <label
          htmlFor="post-category"
          className="block text-sm font-medium text-gray-700 mb-1.5"
        >
          カテゴリ
        </label>
        <select
          id="post-category"
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          required
          className="
            w-full px-4 py-2.5 border border-gray-200 rounded-lg text-gray-900 text-sm
            focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500
            transition-shadow bg-white
          "
          aria-label="カテゴリを選択"
        >
          <option value="" disabled>
            カテゴリを選択してください
          </option>
          {categories.map((cat) => (
            <option key={cat.id} value={cat.id}>
              {cat.emoji ? `${cat.emoji} ` : ""}
              {cat.name}
            </option>
          ))}
        </select>
      </div>

      {/* Body */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          本文
        </label>
        <RichTextEditor
          initialValue={plainText}
          placeholder="ここに本文を書きましょう。マークダウン記法が使えます。"
          onChange={handleBodyChange}
        />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={!isValid || isSubmitting}
          className="
            inline-flex items-center justify-center px-6 py-2.5 rounded-lg
            bg-blue-600 text-white text-sm font-semibold
            hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
            disabled:opacity-50 disabled:cursor-not-allowed
            transition-colors duration-150
          "
          aria-label={isEdit ? "投稿を更新" : "投稿を作成"}
        >
          {isSubmitting ? (
            <>
              <svg
                className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              送信中...
            </>
          ) : isEdit ? (
            "更新する"
          ) : (
            "投稿する"
          )}
        </button>

        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="
              px-6 py-2.5 rounded-lg text-sm font-medium text-gray-600
              hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-300
              transition-colors duration-150
            "
          >
            キャンセル
          </button>
        )}
      </div>
    </form>
  );
}
