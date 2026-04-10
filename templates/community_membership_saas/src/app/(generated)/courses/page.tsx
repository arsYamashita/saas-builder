"use client";

import { useState, useEffect, useCallback } from "react";
import { CourseCard } from "@/components/domain/course-card";
import type { CourseCardData } from "@/components/domain/course-card";

// ─── Skeleton ───

function CourseCardSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden animate-pulse">
      <div className="h-36 bg-gray-200" />
      <div className="p-4 space-y-3">
        <div className="h-5 bg-gray-200 rounded w-3/4" />
        <div className="space-y-1.5">
          <div className="h-3.5 bg-gray-100 rounded w-full" />
          <div className="h-3.5 bg-gray-100 rounded w-5/6" />
        </div>
        <div className="flex items-center gap-3 pt-2">
          <div className="h-3 bg-gray-100 rounded w-20" />
          <div className="h-3 bg-gray-100 rounded w-20" />
        </div>
      </div>
    </div>
  );
}

// ─── Page ───

/**
 * Course listing page (public).
 *
 * Fetches published courses from the public API.
 * tenantSlug is read from query params for now.
 */
export default function CoursesPage() {
  const [courses, setCourses] = useState<CourseCardData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // In production this would come from auth context / middleware
  const tenantSlug =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("tenantSlug") ?? ""
      : "";

  const fetchCourses = useCallback(async () => {
    if (!tenantSlug) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/public/tenants/${tenantSlug}/courses`
      );

      if (!res.ok) {
        throw new Error("コースの取得に失敗しました");
      }

      const data = await res.json();
      setCourses(data.courses ?? []);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "予期しないエラーが発生しました"
      );
    } finally {
      setIsLoading(false);
    }
  }, [tenantSlug]);

  useEffect(() => {
    fetchCourses();
  }, [fetchCourses]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
          <h1 className="text-2xl font-bold text-gray-900">
            コース一覧
          </h1>
          <p className="mt-2 text-sm text-gray-500 leading-relaxed">
            スキルアップのためのコースを選んで学習を始めましょう
          </p>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        {/* Error state */}
        {error && (
          <div
            role="alert"
            className="mb-6 p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 flex items-center gap-3"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="w-5 h-5 flex-shrink-0"
            >
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-8-5a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-1.5 0v-4.5A.75.75 0 0 1 10 5Zm0 10a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
                clipRule="evenodd"
              />
            </svg>
            <span>{error}</span>
            <button
              type="button"
              onClick={fetchCourses}
              className="ml-auto text-xs font-medium text-red-700 underline hover:no-underline"
            >
              再試行
            </button>
          </div>
        )}

        {/* Loading state */}
        {isLoading && (
          <div
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6"
            aria-busy="true"
            aria-label="読み込み中"
          >
            <CourseCardSkeleton />
            <CourseCardSkeleton />
            <CourseCardSkeleton />
            <CourseCardSkeleton />
            <CourseCardSkeleton />
            <CourseCardSkeleton />
          </div>
        )}

        {/* Empty state */}
        {!isLoading && !error && courses.length === 0 && (
          <div className="py-24 text-center">
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gray-100 flex items-center justify-center">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="w-10 h-10 text-gray-300"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4.26 10.147a60.438 60.438 0 0 0-.491 6.347A48.62 48.62 0 0 1 12 20.904a48.62 48.62 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.636 50.636 0 0 0-2.658-.813A59.906 59.906 0 0 1 12 3.493a59.903 59.903 0 0 1 10.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0 1 12 13.489a50.702 50.702 0 0 1 7.74-3.342M6.75 15a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm0 0v-3.675A55.378 55.378 0 0 1 12 8.443m-7.007 11.55A5.981 5.981 0 0 0 6.75 15.75v-1.5"
                />
              </svg>
            </div>
            <h2 className="text-lg font-bold text-gray-900 mb-2">
              まだコースがありません
            </h2>
            <p className="text-sm text-gray-500 max-w-md mx-auto leading-relaxed">
              コースが公開されるとここに表示されます。しばらくお待ちください。
            </p>
          </div>
        )}

        {/* Course grid */}
        {!isLoading && !error && courses.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {courses.map((course) => (
              <CourseCard key={course.id} course={course} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
