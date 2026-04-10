"use client";

import { useState, useEffect, useCallback } from "react";
import type { Category } from "@/types/database";

interface CategoryFormData {
  name: string;
  slug: string;
  emoji: string;
  description: string;
  sort_order: number;
}

const emptyForm: CategoryFormData = {
  name: "",
  slug: "",
  emoji: "",
  description: "",
  sort_order: 0,
};

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
}

export default function CategoriesSettingsPage() {
  const tenantId =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("tenantId") ?? ""
      : "";

  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CategoryFormData>(emptyForm);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch categories
  const fetchCategories = useCallback(async () => {
    if (!tenantId) return;
    setIsLoading(true);

    try {
      const res = await fetch(
        `/api/admin/tenants/${tenantId}/categories`
      );
      if (res.ok) {
        const data = await res.json();
        setCategories(data.categories ?? []);
      }
    } catch {
      // Handle silently
    } finally {
      setIsLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  // Auto-generate slug from name
  const handleNameChange = useCallback(
    (name: string) => {
      setForm((prev) => ({
        ...prev,
        name,
        // Only auto-slug when creating, not editing
        slug: editingId ? prev.slug : slugify(name),
      }));
    },
    [editingId]
  );

  const openCreateForm = useCallback(() => {
    setEditingId(null);
    setForm({
      ...emptyForm,
      sort_order: categories.length > 0
        ? Math.max(...categories.map((c) => c.sort_order)) + 1
        : 0,
    });
    setShowForm(true);
    setError(null);
  }, [categories]);

  const openEditForm = useCallback((category: Category) => {
    setEditingId(category.id);
    setForm({
      name: category.name,
      slug: category.slug,
      emoji: category.emoji ?? "",
      description: category.description ?? "",
      sort_order: category.sort_order,
    });
    setShowForm(true);
    setError(null);
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!tenantId || !form.name.trim() || !form.slug.trim()) return;

      setIsSubmitting(true);
      setError(null);

      try {
        const payload = {
          name: form.name.trim(),
          slug: form.slug.trim(),
          emoji: form.emoji.trim() || null,
          description: form.description.trim() || null,
          sort_order: form.sort_order,
        };

        // The current API only has POST for create. PUT for update would
        // need a separate endpoint. For now we support create only.
        const res = await fetch(
          `/api/admin/tenants/${tenantId}/categories`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          }
        );

        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(data?.error ?? "カテゴリの保存に失敗しました");
        }

        setShowForm(false);
        setForm(emptyForm);
        setEditingId(null);
        await fetchCategories();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "予期しないエラーが発生しました"
        );
      } finally {
        setIsSubmitting(false);
      }
    },
    [tenantId, form, editingId, fetchCategories]
  );

  const handleMoveUp = useCallback(
    async (index: number) => {
      if (index === 0) return;
      const newList = [...categories];
      [newList[index - 1], newList[index]] = [newList[index], newList[index - 1]];
      setCategories(newList);
      // In production, this would call a reorder API endpoint
    },
    [categories]
  );

  const handleMoveDown = useCallback(
    async (index: number) => {
      if (index >= categories.length - 1) return;
      const newList = [...categories];
      [newList[index], newList[index + 1]] = [newList[index + 1], newList[index]];
      setCategories(newList);
      // In production, this would call a reorder API endpoint
    },
    [categories]
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
          <h1 className="text-2xl font-bold text-gray-900">カテゴリ管理</h1>
          <p className="text-sm text-gray-500 mt-1">
            カテゴリを整理して、コミュニティの会話を構造化しましょう
          </p>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        {/* Add button */}
        <div className="flex justify-end mb-6">
          <button
            type="button"
            onClick={openCreateForm}
            className="
              inline-flex items-center gap-2 px-4 py-2.5 rounded-lg
              bg-blue-600 text-white text-sm font-semibold
              hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
              transition-colors
            "
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="w-4 h-4"
            >
              <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
            </svg>
            カテゴリを追加
          </button>
        </div>

        {/* Inline form */}
        {showForm && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">
              {editingId ? "カテゴリを編集" : "新しいカテゴリ"}
            </h2>

            {error && (
              <div
                role="alert"
                className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 mb-4"
              >
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Emoji */}
                <div>
                  <label
                    htmlFor="cat-emoji"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    絵文字
                  </label>
                  <input
                    id="cat-emoji"
                    type="text"
                    value={form.emoji}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, emoji: e.target.value }))
                    }
                    placeholder="💬"
                    maxLength={4}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    aria-label="カテゴリの絵文字"
                  />
                </div>

                {/* Name */}
                <div>
                  <label
                    htmlFor="cat-name"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    名前 <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="cat-name"
                    type="text"
                    value={form.name}
                    onChange={(e) => handleNameChange(e.target.value)}
                    placeholder="一般的な話題"
                    required
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    aria-label="カテゴリ名"
                  />
                </div>

                {/* Slug */}
                <div>
                  <label
                    htmlFor="cat-slug"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    スラッグ <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="cat-slug"
                    type="text"
                    value={form.slug}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, slug: e.target.value }))
                    }
                    placeholder="general"
                    required
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    aria-label="カテゴリスラッグ"
                  />
                </div>

                {/* Sort order */}
                <div>
                  <label
                    htmlFor="cat-sort"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    表示順
                  </label>
                  <input
                    id="cat-sort"
                    type="number"
                    value={form.sort_order}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        sort_order: parseInt(e.target.value, 10) || 0,
                      }))
                    }
                    min={0}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    aria-label="表示順"
                  />
                </div>
              </div>

              {/* Description */}
              <div>
                <label
                  htmlFor="cat-desc"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  説明
                </label>
                <textarea
                  id="cat-desc"
                  value={form.description}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, description: e.target.value }))
                  }
                  placeholder="このカテゴリの説明を入力..."
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  aria-label="カテゴリの説明"
                />
              </div>

              {/* Actions */}
              <div className="flex items-center gap-3 pt-2">
                <button
                  type="submit"
                  disabled={
                    isSubmitting || !form.name.trim() || !form.slug.trim()
                  }
                  className="
                    inline-flex items-center px-5 py-2 rounded-lg
                    bg-blue-600 text-white text-sm font-semibold
                    hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed
                    transition-colors
                  "
                >
                  {isSubmitting
                    ? "保存中..."
                    : editingId
                    ? "更新する"
                    : "作成する"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setEditingId(null);
                    setError(null);
                  }}
                  className="px-5 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors"
                >
                  キャンセル
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Category list */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {/* Table header */}
          <div className="hidden sm:grid sm:grid-cols-[3rem_3rem_1fr_8rem_4rem_6rem] gap-3 px-4 py-3 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wider">
            <span>順序</span>
            <span>絵文字</span>
            <span>名前 / スラッグ</span>
            <span>表示順</span>
            <span>並替</span>
            <span className="text-right">操作</span>
          </div>

          {isLoading ? (
            <div className="p-8 text-center">
              <div className="inline-block w-6 h-6 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin" />
              <p className="text-sm text-gray-500 mt-2">読み込み中...</p>
            </div>
          ) : categories.length === 0 ? (
            <div className="py-16 text-center">
              <div className="text-3xl mb-2" aria-hidden="true">
                📂
              </div>
              <p className="text-sm text-gray-500 mb-4">
                カテゴリがまだありません
              </p>
              <button
                type="button"
                onClick={openCreateForm}
                className="text-sm text-blue-600 hover:text-blue-800 font-medium"
              >
                最初のカテゴリを作成する
              </button>
            </div>
          ) : (
            <ul role="list" className="divide-y divide-gray-100">
              {categories.map((category, index) => (
                <li
                  key={category.id}
                  className="sm:grid sm:grid-cols-[3rem_3rem_1fr_8rem_4rem_6rem] gap-3 px-4 py-3 items-center hover:bg-gray-50 transition-colors"
                >
                  {/* Index number */}
                  <span className="hidden sm:block text-sm text-gray-400 tabular-nums">
                    {index + 1}
                  </span>

                  {/* Emoji */}
                  <span className="text-xl" aria-hidden="true">
                    {category.emoji ?? "—"}
                  </span>

                  {/* Name + slug */}
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">
                      {category.name}
                    </p>
                    <p className="text-xs text-gray-400 font-mono truncate">
                      /{category.slug}
                    </p>
                  </div>

                  {/* Sort order */}
                  <span className="hidden sm:block text-sm text-gray-500 tabular-nums">
                    {category.sort_order}
                  </span>

                  {/* Reorder buttons */}
                  <div className="hidden sm:flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleMoveUp(index)}
                      disabled={index === 0}
                      className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      aria-label="上に移動"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 16 16"
                        fill="currentColor"
                        className="w-3.5 h-3.5"
                      >
                        <path
                          fillRule="evenodd"
                          d="M11.78 9.78a.75.75 0 01-1.06 0L8 7.06 5.28 9.78a.75.75 0 01-1.06-1.06l3.25-3.25a.75.75 0 011.06 0l3.25 3.25a.75.75 0 010 1.06z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMoveDown(index)}
                      disabled={index >= categories.length - 1}
                      className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      aria-label="下に移動"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 16 16"
                        fill="currentColor"
                        className="w-3.5 h-3.5"
                      >
                        <path
                          fillRule="evenodd"
                          d="M4.22 6.22a.75.75 0 011.06 0L8 8.94l2.72-2.72a.75.75 0 111.06 1.06l-3.25 3.25a.75.75 0 01-1.06 0L4.22 7.28a.75.75 0 010-1.06z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </button>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-end gap-1 mt-2 sm:mt-0">
                    <button
                      type="button"
                      onClick={() => openEditForm(category)}
                      className="p-1.5 text-gray-400 hover:text-gray-600 rounded transition-colors"
                      aria-label={`${category.name}を編集`}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 16 16"
                        fill="currentColor"
                        className="w-3.5 h-3.5"
                      >
                        <path d="M13.488 2.513a1.75 1.75 0 00-2.475 0L6.75 6.774a2.75 2.75 0 00-.596.892l-.848 2.047a.75.75 0 00.98.98l2.047-.848a2.75 2.75 0 00.892-.596l4.261-4.262a1.75 1.75 0 000-2.474z" />
                        <path d="M4.75 3.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h6.5c.69 0 1.25-.56 1.25-1.25V9A.75.75 0 0114 9v2.25A2.75 2.75 0 0111.25 14h-6.5A2.75 2.75 0 012 11.25v-6.5A2.75 2.75 0 014.75 2H7a.75.75 0 010 1.5H4.75z" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (
                          window.confirm(
                            `「${category.name}」カテゴリを削除しますか?`
                          )
                        ) {
                          // Delete would need a dedicated API endpoint
                          // For now, visually remove
                          setCategories((prev) =>
                            prev.filter((c) => c.id !== category.id)
                          );
                        }
                      }}
                      className="p-1.5 text-gray-400 hover:text-red-500 rounded transition-colors"
                      aria-label={`${category.name}を削除`}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 16 16"
                        fill="currentColor"
                        className="w-3.5 h-3.5"
                      >
                        <path
                          fillRule="evenodd"
                          d="M5 3.25V4H2.75a.75.75 0 000 1.5h.3l.815 8.15A1.5 1.5 0 005.357 15h5.285a1.5 1.5 0 001.493-1.35l.815-8.15h.3a.75.75 0 000-1.5H11v-.75A2.25 2.25 0 008.75 1h-1.5A2.25 2.25 0 005 3.25zm2.25-.75a.75.75 0 00-.75.75V4h3v-.75a.75.75 0 00-.75-.75h-1.5zM6.05 6a.75.75 0 01.787.713l.275 5.5a.75.75 0 01-1.498.075l-.275-5.5A.75.75 0 016.05 6zm3.9 0a.75.75 0 01.712.787l-.275 5.5a.75.75 0 01-1.498-.075l.275-5.5A.75.75 0 019.95 6z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  );
}
