"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { CourseForm } from "@/components/domain/course-form";
import type { Course, CourseModule, CourseLesson } from "@/types/database";

// ─── Types ───

type CourseWithModules = Course & {
  modules: (CourseModule & { lessons: CourseLesson[] })[];
};

// ─── Skeleton ───

function FormSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 sm:p-8 animate-pulse space-y-6">
      <div className="h-4 bg-gray-200 rounded w-48" />
      <div className="space-y-4">
        <div>
          <div className="h-3 bg-gray-200 rounded w-24 mb-2" />
          <div className="h-10 bg-gray-100 rounded w-full" />
        </div>
        <div>
          <div className="h-3 bg-gray-200 rounded w-24 mb-2" />
          <div className="h-10 bg-gray-100 rounded w-full" />
        </div>
        <div>
          <div className="h-3 bg-gray-200 rounded w-24 mb-2" />
          <div className="h-24 bg-gray-100 rounded w-full" />
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div className="h-10 bg-gray-100 rounded" />
          <div className="h-10 bg-gray-100 rounded" />
          <div className="h-10 bg-gray-100 rounded" />
        </div>
      </div>
      <div className="h-4 bg-gray-200 rounded w-32" />
      <div className="border border-gray-200 rounded-xl p-4 space-y-3">
        <div className="h-8 bg-gray-100 rounded" />
        <div className="h-8 bg-gray-100 rounded" />
      </div>
    </div>
  );
}

// ─── Page ───

/**
 * Admin page: Edit existing course.
 *
 * Guard: admin+ role required (enforced by API routes).
 * Fetches course with modules and lessons, passes to CourseForm in edit mode.
 */
export default function AdminCourseEditPage() {
  const params = useParams();
  const router = useRouter();
  const courseId = params.courseId as string;

  const tenantId =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("tenantId") ?? ""
      : "";

  const [course, setCourse] = useState<CourseWithModules | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch course with modules and lessons
  const fetchCourse = useCallback(async () => {
    if (!tenantId || !courseId) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // 1. Fetch course
      const courseRes = await fetch(
        `/api/admin/tenants/${tenantId}/courses/${courseId}`
      );
      if (!courseRes.ok) {
        throw new Error(
          courseRes.status === 404
            ? "コースが見つかりませんでした"
            : "コースの取得に失敗しました"
        );
      }
      const courseData = await courseRes.json();

      // 2. Fetch modules
      const modulesRes = await fetch(
        `/api/admin/tenants/${tenantId}/courses/${courseId}/modules`
      );
      let modules: (CourseModule & { lessons: CourseLesson[] })[] = [];

      if (modulesRes.ok) {
        const modulesData = await modulesRes.json();
        const rawModules = modulesData.modules ?? [];

        // 3. Fetch lessons for each module
        modules = await Promise.all(
          rawModules.map(
            async (mod: CourseModule & { lessons_count?: number }) => {
              try {
                const lessonsRes = await fetch(
                  `/api/admin/tenants/${tenantId}/modules/${mod.id}/lessons`
                );
                if (lessonsRes.ok) {
                  const lessonsData = await lessonsRes.json();
                  return { ...mod, lessons: lessonsData.lessons ?? [] };
                }
              } catch {
                // Non-critical
              }
              return { ...mod, lessons: [] };
            }
          )
        );
      }

      setCourse({
        ...courseData.course,
        modules,
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "予期しないエラーが発生しました"
      );
    } finally {
      setIsLoading(false);
    }
  }, [tenantId, courseId]);

  useEffect(() => {
    fetchCourse();
  }, [fetchCourse]);

  const handleSuccess = useCallback(
    (_courseId: string) => {
      // Reload the page to show updated data
      fetchCourse();
    },
    [fetchCourse]
  );

  const handleCancel = useCallback(() => {
    router.back();
  }, [router]);

  // ─── Render ───

  if (!tenantId) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-sm text-gray-500">
            tenantId パラメータが必要です。
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
          {/* Breadcrumb */}
          <nav
            className="flex items-center gap-2 text-xs text-gray-400 mb-4"
            aria-label="パンくずリスト"
          >
            <span className="hover:text-gray-600 transition-colors">
              管理
            </span>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
              <path fillRule="evenodd" d="M6.22 4.22a.75.75 0 0 1 1.06 0l3.25 3.25a.75.75 0 0 1 0 1.06l-3.25 3.25a.75.75 0 0 1-1.06-1.06L8.94 8 6.22 5.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
            </svg>
            <span className="hover:text-gray-600 transition-colors">
              コース管理
            </span>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
              <path fillRule="evenodd" d="M6.22 4.22a.75.75 0 0 1 1.06 0l3.25 3.25a.75.75 0 0 1 0 1.06l-3.25 3.25a.75.75 0 0 1-1.06-1.06L8.94 8 6.22 5.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
            </svg>
            {course && (
              <>
                <span className="text-gray-500 truncate max-w-[160px]">
                  {course.title}
                </span>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                  <path fillRule="evenodd" d="M6.22 4.22a.75.75 0 0 1 1.06 0l3.25 3.25a.75.75 0 0 1 0 1.06l-3.25 3.25a.75.75 0 0 1-1.06-1.06L8.94 8 6.22 5.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
                </svg>
              </>
            )}
            <span className="text-gray-600 font-medium">編集</span>
          </nav>

          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            {isLoading ? (
              <span className="inline-block h-7 bg-gray-200 rounded w-48 animate-pulse" />
            ) : (
              course?.title ?? "コースを編集"
            )}
          </h1>
          <p className="text-sm text-gray-500 leading-relaxed">
            コースの内容を編集してください。変更は保存ボタンを押すと反映されます。
          </p>
        </div>
      </header>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        {/* Error */}
        {error && (
          <div
            role="alert"
            className="mb-6 p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 flex items-center gap-3"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 flex-shrink-0">
              <path fillRule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-8-5a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-1.5 0v-4.5A.75.75 0 0 1 10 5Zm0 10a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" />
            </svg>
            <span>{error}</span>
            <button
              type="button"
              onClick={fetchCourse}
              className="ml-auto text-xs font-medium text-red-700 underline hover:no-underline"
            >
              再試行
            </button>
          </div>
        )}

        {/* Loading */}
        {isLoading && <FormSkeleton />}

        {/* Form */}
        {!isLoading && !error && course && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 sm:p-8">
            <CourseForm
              tenantId={tenantId}
              existingCourse={course}
              onSuccess={handleSuccess}
              onCancel={handleCancel}
            />
          </div>
        )}
      </div>
    </div>
  );
}
