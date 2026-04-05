"use client";

import { useState, useEffect, useCallback } from "react";
import type { MembershipQuestion } from "@/types/database";

interface ApplicationFormProps {
  tenantId: string;
}

type FormAnswers = Record<string, string>;

export function ApplicationForm({ tenantId }: ApplicationFormProps) {
  const [questions, setQuestions] = useState<MembershipQuestion[]>([]);
  const [answers, setAnswers] = useState<FormAnswers>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<
    Record<string, string>
  >({});

  // Fetch questions
  useEffect(() => {
    if (!tenantId) return;

    (async () => {
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
          // Initialize answers
          const initial: FormAnswers = {};
          for (const q of sorted) {
            initial[q.id] = "";
          }
          setAnswers(initial);
        }
      } catch {
        setError("質問の読み込みに失敗しました。ページを再読み込みしてください。");
      } finally {
        setIsLoading(false);
      }
    })();
  }, [tenantId]);

  const handleAnswerChange = useCallback(
    (questionId: string, value: string) => {
      setAnswers((prev) => ({ ...prev, [questionId]: value }));
      // Clear validation error on change
      setValidationErrors((prev) => {
        const next = { ...prev };
        delete next[questionId];
        return next;
      });
    },
    []
  );

  const validate = useCallback((): boolean => {
    const errors: Record<string, string> = {};
    for (const q of questions) {
      if (q.is_required && !answers[q.id]?.trim()) {
        errors[q.id] = "この質問は必須です";
      }
    }
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  }, [questions, answers]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!tenantId) return;
      if (!validate()) return;

      setIsSubmitting(true);
      setError(null);

      try {
        const payload = {
          answers: questions.map((q) => ({
            question_id: q.id,
            answer: answers[q.id]?.trim() ?? "",
          })),
        };

        const res = await fetch(
          `/api/admin/tenants/${tenantId}/applications`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          }
        );

        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(data?.error ?? "申請の送信に失敗しました");
        }

        setIsSubmitted(true);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "予期しないエラーが発生しました"
        );
      } finally {
        setIsSubmitting(false);
      }
    },
    [tenantId, questions, answers, validate]
  );

  // Success state
  if (isSubmitted) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
        <div
          className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-100 flex items-center justify-center"
          aria-hidden="true"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="w-8 h-8 text-green-600"
          >
            <path
              fillRule="evenodd"
              d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zm13.36-1.814a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z"
              clipRule="evenodd"
            />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">
          申請を受け付けました
        </h2>
        <p className="text-sm text-gray-500 leading-relaxed">
          審査結果をお待ちください。
          <br />
          承認されるとコミュニティに参加できるようになります。
        </p>
      </div>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-8">
        <div className="animate-pulse space-y-6">
          <div className="h-6 bg-gray-200 rounded w-48" />
          <div className="h-4 bg-gray-100 rounded w-64" />
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="space-y-2">
                <div className="h-4 bg-gray-200 rounded w-3/4" />
                <div className="h-20 bg-gray-100 rounded" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Empty questions state
  if (questions.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
        <p className="text-sm text-gray-500">
          現在、参加申請を受け付けていません。
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h2 className="text-xl font-bold text-gray-900 mb-1">
        参加申請フォーム
      </h2>
      <p className="text-sm text-gray-500 mb-6">
        以下の質問に回答して申請してください
      </p>

      {error && (
        <div
          role="alert"
          className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 mb-4"
        >
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {questions.map((question, index) => {
          const hasError = !!validationErrors[question.id];
          return (
            <div key={question.id}>
              <label
                htmlFor={`question-${question.id}`}
                className="block text-sm font-medium text-gray-700 mb-1.5"
              >
                <span className="text-gray-400 mr-1.5">
                  {index + 1}.
                </span>
                {question.question_text}
                {question.is_required && (
                  <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-50 text-red-600">
                    必須
                  </span>
                )}
              </label>
              <textarea
                id={`question-${question.id}`}
                value={answers[question.id] ?? ""}
                onChange={(e) =>
                  handleAnswerChange(question.id, e.target.value)
                }
                rows={4}
                placeholder="回答を入力してください..."
                className={`
                  w-full px-3 py-2 border rounded-lg text-sm resize-none
                  placeholder-gray-400 text-gray-900
                  focus:outline-none focus:ring-2 focus:border-blue-500
                  transition-shadow
                  ${
                    hasError
                      ? "border-red-300 focus:ring-red-500"
                      : "border-gray-200 focus:ring-blue-500"
                  }
                `}
                aria-required={question.is_required}
                aria-invalid={hasError}
                aria-describedby={
                  hasError ? `error-${question.id}` : undefined
                }
              />
              {hasError && (
                <p
                  id={`error-${question.id}`}
                  className="text-xs text-red-500 mt-1"
                  role="alert"
                >
                  {validationErrors[question.id]}
                </p>
              )}
            </div>
          );
        })}

        <div className="pt-2">
          <button
            type="submit"
            disabled={isSubmitting}
            className="
              w-full sm:w-auto inline-flex items-center justify-center gap-2
              px-6 py-3 rounded-lg
              bg-blue-600 text-white text-sm font-semibold
              hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed
              focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
              transition-colors
            "
          >
            {isSubmitting ? (
              <>
                <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                送信中...
              </>
            ) : (
              "申請を送信する"
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
