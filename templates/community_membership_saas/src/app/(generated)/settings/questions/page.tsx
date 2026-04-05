"use client";

import { useState, useEffect, useCallback } from "react";
import type { MembershipQuestion } from "@/types/database";

interface QuestionFormData {
  question_text: string;
  is_required: boolean;
}

const emptyForm: QuestionFormData = {
  question_text: "",
  is_required: false,
};

export default function QuestionsSettingsPage() {
  const tenantId =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("tenantId") ?? ""
      : "";

  const [questions, setQuestions] = useState<MembershipQuestion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<QuestionFormData>(emptyForm);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  const fetchQuestions = useCallback(async () => {
    if (!tenantId) return;
    setIsLoading(true);
    try {
      const res = await fetch(
        `/api/admin/tenants/${tenantId}/membership-questions`
      );
      if (res.ok) {
        const data = await res.json();
        const sorted = (data.questions ?? []).sort(
          (a: MembershipQuestion, b: MembershipQuestion) =>
            a.sort_order - b.sort_order
        );
        setQuestions(sorted);
      }
    } catch {
      // Handle silently
    } finally {
      setIsLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    fetchQuestions();
  }, [fetchQuestions]);

  const openCreateForm = useCallback(() => {
    setEditingId(null);
    setForm(emptyForm);
    setShowForm(true);
    setError(null);
  }, []);

  const openEditForm = useCallback((question: MembershipQuestion) => {
    setEditingId(question.id);
    setForm({
      question_text: question.question_text,
      is_required: question.is_required,
    });
    setShowForm(true);
    setError(null);
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!tenantId || !form.question_text.trim()) return;

      setIsSubmitting(true);
      setError(null);

      try {
        const payload = {
          question_text: form.question_text.trim(),
          is_required: form.is_required,
          sort_order: editingId
            ? undefined
            : questions.length > 0
            ? Math.max(...questions.map((q) => q.sort_order)) + 1
            : 0,
        };

        const url = editingId
          ? `/api/admin/tenants/${tenantId}/membership-questions/${editingId}`
          : `/api/admin/tenants/${tenantId}/membership-questions`;

        const res = await fetch(url, {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(data?.error ?? "質問の保存に失敗しました");
        }

        setShowForm(false);
        setForm(emptyForm);
        setEditingId(null);
        await fetchQuestions();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "予期しないエラーが発生しました"
        );
      } finally {
        setIsSubmitting(false);
      }
    },
    [tenantId, form, editingId, questions, fetchQuestions]
  );

  const handleDelete = useCallback(
    async (questionId: string, questionText: string) => {
      if (
        !window.confirm(
          `「${questionText.slice(0, 30)}...」を削除しますか?`
        )
      ) {
        return;
      }

      try {
        const res = await fetch(
          `/api/admin/tenants/${tenantId}/membership-questions/${questionId}`,
          { method: "DELETE" }
        );
        if (!res.ok) {
          throw new Error("質問の削除に失敗しました");
        }
        await fetchQuestions();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "予期しないエラーが発生しました"
        );
      }
    },
    [tenantId, fetchQuestions]
  );

  const handleMoveUp = useCallback(
    (index: number) => {
      if (index === 0) return;
      const newList = [...questions];
      [newList[index - 1], newList[index]] = [
        newList[index],
        newList[index - 1],
      ];
      setQuestions(newList);
      // In production, call a reorder API endpoint
    },
    [questions]
  );

  const handleMoveDown = useCallback(
    (index: number) => {
      if (index >= questions.length - 1) return;
      const newList = [...questions];
      [newList[index], newList[index + 1]] = [
        newList[index + 1],
        newList[index],
      ];
      setQuestions(newList);
      // In production, call a reorder API endpoint
    },
    [questions]
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
          <h1 className="text-2xl font-bold text-gray-900">
            スクリーニング質問の管理
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            申請時にメンバーに回答してもらう質問を設定します
          </p>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        {/* Info banner */}
        <div className="p-4 rounded-lg bg-blue-50 border border-blue-200 mb-6">
          <p className="text-sm text-blue-800">
            質問は申請制モードの場合にのみ表示されます。参加モードの設定は
            <a
              href={`/settings/join-mode${tenantId ? `?tenantId=${tenantId}` : ""}`}
              className="font-medium underline hover:text-blue-900"
            >
              こちら
            </a>
            から変更できます。
          </p>
        </div>

        {error && (
          <div
            role="alert"
            className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 mb-6"
          >
            {error}
          </div>
        )}

        {/* Action bar */}
        <div className="flex items-center justify-between mb-6">
          <button
            type="button"
            onClick={() => setShowPreview((p) => !p)}
            className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
          >
            {showPreview ? "編集モードに戻る" : "プレビューを表示"}
          </button>
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
            質問を追加
          </button>
        </div>

        {/* Inline form */}
        {showForm && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">
              {editingId ? "質問を編集" : "新しい質問"}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="question-text"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  質問内容 <span className="text-red-500">*</span>
                </label>
                <textarea
                  id="question-text"
                  value={form.question_text}
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      question_text: e.target.value,
                    }))
                  }
                  placeholder="例: このコミュニティに参加したい理由を教えてください"
                  rows={3}
                  required
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 placeholder-gray-400"
                  aria-label="質問内容"
                />
              </div>

              {/* Required toggle */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  role="switch"
                  aria-checked={form.is_required}
                  onClick={() =>
                    setForm((p) => ({
                      ...p,
                      is_required: !p.is_required,
                    }))
                  }
                  className={`
                    relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer
                    rounded-full border-2 border-transparent transition-colors duration-200
                    focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
                    ${form.is_required ? "bg-blue-600" : "bg-gray-200"}
                  `}
                >
                  <span
                    className={`
                      pointer-events-none inline-block h-5 w-5 transform rounded-full
                      bg-white shadow ring-0 transition duration-200
                      ${form.is_required ? "translate-x-5" : "translate-x-0"}
                    `}
                  />
                </button>
                <span className="text-sm text-gray-700">
                  回答を必須にする
                </span>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-3 pt-2">
                <button
                  type="submit"
                  disabled={isSubmitting || !form.question_text.trim()}
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
                    : "追加する"}
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

        {/* Preview mode */}
        {showPreview ? (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="border-b border-gray-100 pb-4 mb-6">
              <h3 className="text-base font-bold text-gray-900">
                申請者から見たプレビュー
              </h3>
              <p className="text-xs text-gray-400 mt-0.5">
                実際の申請フォームの見た目を確認できます
              </p>
            </div>

            {questions.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">
                まだ質問が追加されていません
              </p>
            ) : (
              <div className="space-y-6">
                <div className="mb-4">
                  <h2 className="text-xl font-bold text-gray-900 mb-1">
                    参加申請フォーム
                  </h2>
                  <p className="text-sm text-gray-500">
                    以下の質問に回答して申請してください
                  </p>
                </div>

                {questions.map((q, i) => (
                  <div key={q.id}>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      <span className="text-gray-400 mr-1.5">
                        {i + 1}.
                      </span>
                      {q.question_text}
                      {q.is_required && (
                        <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-50 text-red-600">
                          必須
                        </span>
                      )}
                    </label>
                    <textarea
                      disabled
                      rows={3}
                      placeholder="回答を入力してください..."
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none bg-gray-50 text-gray-400 placeholder-gray-300"
                    />
                  </div>
                ))}

                <button
                  type="button"
                  disabled
                  className="inline-flex items-center px-6 py-3 rounded-lg bg-blue-600/50 text-white text-sm font-semibold cursor-not-allowed"
                >
                  申請を送信する
                </button>
              </div>
            )}
          </div>
        ) : (
          /* Question list - edit mode */
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {isLoading ? (
              <div className="p-8 text-center">
                <div className="inline-block w-6 h-6 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin" />
                <p className="text-sm text-gray-500 mt-2">読み込み中...</p>
              </div>
            ) : questions.length === 0 ? (
              <div className="py-16 text-center">
                <div className="text-3xl mb-2" aria-hidden="true">
                  📋
                </div>
                <p className="text-sm text-gray-500 mb-4">
                  スクリーニング質問がまだありません
                </p>
                <button
                  type="button"
                  onClick={openCreateForm}
                  className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                >
                  最初の質問を追加する
                </button>
              </div>
            ) : (
              <ul role="list" className="divide-y divide-gray-100">
                {questions.map((question, index) => (
                  <li
                    key={question.id}
                    className="px-6 py-4 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-start gap-4">
                      {/* Reorder buttons */}
                      <div className="flex flex-col items-center gap-0.5 pt-1">
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
                        <span className="text-xs text-gray-400 tabular-nums">
                          {index + 1}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleMoveDown(index)}
                          disabled={index >= questions.length - 1}
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

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-900 leading-relaxed">
                          {question.question_text}
                        </p>
                        <div className="flex items-center gap-2 mt-1.5">
                          {question.is_required ? (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-50 text-red-600">
                              必須
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-gray-100 text-gray-500">
                              任意
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          type="button"
                          onClick={() => openEditForm(question)}
                          className="p-1.5 text-gray-400 hover:text-gray-600 rounded transition-colors"
                          aria-label={`質問 ${index + 1} を編集`}
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
                          onClick={() =>
                            handleDelete(
                              question.id,
                              question.question_text
                            )
                          }
                          className="p-1.5 text-gray-400 hover:text-red-500 rounded transition-colors"
                          aria-label={`質問 ${index + 1} を削除`}
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
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
