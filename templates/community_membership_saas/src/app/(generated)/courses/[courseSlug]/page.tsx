"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { ProgressBar } from "@/components/domain/progress-bar";
import type { VisibilityMode } from "@/types/database";

// ─── Types ───

interface LessonSummary {
  id: string;
  title: string;
  slug: string;
  sort_order: number;
  is_preview: boolean;
  locked: boolean;
  lock_reason?: string;
  unlock_date?: string;
  required_level?: number;
  video_duration_seconds: number | null;
}

interface ModuleSummary {
  id: string;
  title: string;
  description: string | null;
  sort_order: number;
  lessons: LessonSummary[];
}

interface CourseDetail {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  cover_image_url: string | null;
  visibility_mode: VisibilityMode;
  modules: ModuleSummary[];
}

interface AccessResult {
  allowed: boolean;
  reason: string;
}

// ─── Skeleton ───

function ModuleSkeleton() {
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden animate-pulse">
      <div className="px-5 py-4 bg-gray-50 flex items-center gap-3">
        <div className="h-4 bg-gray-200 rounded w-8" />
        <div className="h-4 bg-gray-200 rounded w-48" />
      </div>
      <div className="divide-y divide-gray-100">
        {[1, 2, 3].map((i) => (
          <div key={i} className="px-5 py-3 flex items-center gap-3">
            <div className="w-5 h-5 rounded-full bg-gray-200" />
            <div className="h-3.5 bg-gray-200 rounded w-40" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Module Accordion ───

function ModuleAccordion({
  module: mod,
  moduleIndex,
  courseSlug,
  progressMap,
  defaultExpanded,
}: {
  module: ModuleSummary;
  moduleIndex: number;
  courseSlug: string;
  progressMap: Record<string, boolean>;
  defaultExpanded: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const completedCount = mod.lessons.filter((l) => progressMap[l.id]).length;

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-3 px-5 py-4 bg-gray-50/50 hover:bg-gray-50 transition-colors text-left"
        aria-expanded={isExpanded}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className={`w-5 h-5 text-gray-400 transition-transform duration-200 flex-shrink-0 ${
            isExpanded ? "rotate-90" : ""
          }`}
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.168 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z"
            clipRule="evenodd"
          />
        </svg>
        <div className="flex-1 min-w-0">
          <span className="text-xs font-bold text-gray-400 mr-2">
            {moduleIndex + 1}.
          </span>
          <span className="text-sm font-semibold text-gray-900">
            {mod.title}
          </span>
          {mod.description && (
            <p className="text-xs text-gray-500 mt-0.5 truncate">
              {mod.description}
            </p>
          )}
        </div>
        <span className="text-xs text-gray-400 tabular-nums flex-shrink-0">
          {completedCount}/{mod.lessons.length} 完了
        </span>
      </button>

      {isExpanded && (
        <ul className="divide-y divide-gray-100">
          {mod.lessons.map((lesson, li) => {
            const isCompleted = progressMap[lesson.id] ?? false;
            const estimatedMinutes = lesson.video_duration_seconds
              ? Math.ceil(lesson.video_duration_seconds / 60)
              : null;

            return (
              <li key={lesson.id}>
                <a
                  href={
                    lesson.locked
                      ? undefined
                      : `/courses/${courseSlug}/lessons/${lesson.slug}`
                  }
                  className={`
                    flex items-center gap-3 px-5 py-3 transition-colors
                    ${lesson.locked ? "opacity-60 cursor-not-allowed" : "hover:bg-gray-50 cursor-pointer"}
                  `}
                  onClick={
                    lesson.locked
                      ? (e) => e.preventDefault()
                      : undefined
                  }
                >
                  {/* Lesson number */}
                  <span className="text-xs text-gray-400 tabular-nums w-8 flex-shrink-0">
                    {moduleIndex + 1}.{li + 1}
                  </span>

                  {/* Status icon */}
                  {lesson.locked ? (
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 text-gray-400 flex-shrink-0">
                      <path fillRule="evenodd" d="M8 1a3.5 3.5 0 0 0-3.5 3.5V7A1.5 1.5 0 0 0 3 8.5v5A1.5 1.5 0 0 0 4.5 15h7a1.5 1.5 0 0 0 1.5-1.5v-5A1.5 1.5 0 0 0 11.5 7V4.5A3.5 3.5 0 0 0 8 1Zm2 6V4.5a2 2 0 1 0-4 0V7h4Z" clipRule="evenodd" />
                    </svg>
                  ) : isCompleted ? (
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 text-green-500 flex-shrink-0">
                      <path fillRule="evenodd" d="M8 15A7 7 0 1 0 8 1a7 7 0 0 0 0 14Zm3.844-8.791a.75.75 0 0 0-1.188-.918l-3.7 4.79-1.649-1.833a.75.75 0 1 0-1.114 1.004l2.25 2.5a.75.75 0 0 0 1.15-.043l4.25-5.5Z" clipRule="evenodd" />
                    </svg>
                  ) : (
                    <div className="w-4 h-4 rounded-full border-2 border-gray-300 flex-shrink-0" />
                  )}

                  {/* Title */}
                  <span className={`flex-1 text-sm ${isCompleted ? "text-gray-500" : "text-gray-700"} truncate`}>
                    {lesson.title}
                  </span>

                  {/* Badges */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {lesson.is_preview && (
                      <span className="text-[10px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded font-medium">
                        無料
                      </span>
                    )}
                    {lesson.locked && lesson.lock_reason === "drip_locked" && (
                      <span className="text-[10px] bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded font-medium">
                        時限解放
                      </span>
                    )}
                    {lesson.locked && lesson.lock_reason === "level_locked" && lesson.required_level && (
                      <span className="text-[10px] bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded font-medium">
                        Lv.{lesson.required_level}
                      </span>
                    )}
                    {estimatedMinutes && (
                      <span className="text-[10px] text-gray-400 tabular-nums">
                        {estimatedMinutes}分
                      </span>
                    )}
                  </div>
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ─── Page ───

export default function CourseDetailPage() {
  const params = useParams();
  const router = useRouter();
  const courseSlug = params.courseSlug as string;

  const [course, setCourse] = useState<CourseDetail | null>(null);
  const [access, setAccess] = useState<AccessResult | null>(null);
  const [progressMap, setProgressMap] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const tenantSlug =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("tenantSlug") ?? ""
      : "";

  // Fetch course detail
  const fetchCourse = useCallback(async () => {
    if (!tenantSlug || !courseSlug) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/public/tenants/${tenantSlug}/courses/${courseSlug}`
      );

      if (!res.ok) {
        if (res.status === 404) {
          throw new Error("コースが見つかりませんでした");
        }
        throw new Error("コースの取得に失敗しました");
      }

      const data = await res.json();
      setCourse(data.course);
      setAccess(data.access);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "予期しないエラーが発生しました"
      );
    } finally {
      setIsLoading(false);
    }
  }, [tenantSlug, courseSlug]);

  // Fetch user progress (if course is loaded)
  useEffect(() => {
    if (!course) return;

    (async () => {
      try {
        const res = await fetch(`/api/me/courses/${course.id}/progress`);
        if (!res.ok) return;

        // Also fetch individual lesson progress
        const allLessons = course.modules.flatMap((m) => m.lessons);
        const progressEntries = await Promise.all(
          allLessons.map(async (lesson) => {
            try {
              const pRes = await fetch(`/api/me/progress/${lesson.id}`);
              if (!pRes.ok) return [lesson.id, false] as const;
              const pData = await pRes.json();
              return [lesson.id, pData.progress?.completed ?? false] as const;
            } catch {
              return [lesson.id, false] as const;
            }
          })
        );

        setProgressMap(Object.fromEntries(progressEntries));
      } catch {
        // Progress is non-critical
      }
    })();
  }, [course]);

  useEffect(() => {
    fetchCourse();
  }, [fetchCourse]);

  // Computed values
  const totalLessons = useMemo(
    () => course?.modules.reduce((sum, m) => sum + m.lessons.length, 0) ?? 0,
    [course]
  );

  const completedLessons = useMemo(
    () => Object.values(progressMap).filter(Boolean).length,
    [progressMap]
  );

  const hasStarted = completedLessons > 0;

  const firstAccessibleLesson = useMemo(() => {
    if (!course) return null;
    for (const mod of course.modules) {
      for (const lesson of mod.lessons) {
        if (!lesson.locked) return lesson;
      }
    }
    return null;
  }, [course]);

  // Find first uncompleted accessible lesson (for "continue" button)
  const nextUncompletedLesson = useMemo(() => {
    if (!course) return null;
    for (const mod of course.modules) {
      for (const lesson of mod.lessons) {
        if (!lesson.locked && !progressMap[lesson.id]) return lesson;
      }
    }
    return null;
  }, [course, progressMap]);

  // ─── Render ───

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white border-b border-gray-200">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-48 mb-4" />
            <div className="h-8 bg-gray-200 rounded w-3/4 mb-3" />
            <div className="h-4 bg-gray-100 rounded w-full mb-1" />
            <div className="h-4 bg-gray-100 rounded w-5/6" />
          </div>
        </header>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-4">
          <ModuleSkeleton />
          <ModuleSkeleton />
        </div>
      </div>
    );
  }

  if (error || !course) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-50 flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 text-red-400">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-gray-900 mb-2">
            {error ?? "コースが見つかりませんでした"}
          </h2>
          <button
            type="button"
            onClick={() => router.push("/courses")}
            className="mt-4 inline-flex items-center px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
          >
            コース一覧に戻る
          </button>
        </div>
      </div>
    );
  }

  // Access denied
  if (access && !access.allowed) {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white border-b border-gray-200">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
            <h1 className="text-2xl font-bold text-gray-900">{course.title}</h1>
          </div>
        </header>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-16 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-amber-50 flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 text-amber-500">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-gray-900 mb-2">
            このコースにアクセスするには権限が必要です
          </h2>
          <p className="text-sm text-gray-500 max-w-md mx-auto leading-relaxed mb-6">
            {access.reason === "authentication_required"
              ? "ログインしてコミュニティに参加すると、このコースにアクセスできます。"
              : access.reason === "membership_required"
              ? "メンバーシップに登録すると、このコースにアクセスできます。"
              : "このコースにアクセスするための条件を満たしていません。"}
          </p>
          <button
            type="button"
            onClick={() => router.push("/courses")}
            className="inline-flex items-center px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
          >
            コース一覧に戻る
          </button>
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
          <nav className="flex items-center gap-2 text-xs text-gray-400 mb-4" aria-label="パンくずリスト">
            <a href="/courses" className="hover:text-gray-600 transition-colors">
              コース一覧
            </a>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
              <path fillRule="evenodd" d="M6.22 4.22a.75.75 0 0 1 1.06 0l3.25 3.25a.75.75 0 0 1 0 1.06l-3.25 3.25a.75.75 0 0 1-1.06-1.06L8.94 8 6.22 5.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
            </svg>
            <span className="text-gray-600 font-medium truncate">
              {course.title}
            </span>
          </nav>

          <h1 className="text-2xl font-bold text-gray-900 mb-3">
            {course.title}
          </h1>

          {course.description && (
            <p className="text-sm text-gray-600 leading-relaxed mb-5 max-w-2xl">
              {course.description}
            </p>
          )}

          {/* Progress summary */}
          {totalLessons > 0 && (
            <div className="max-w-md mb-5">
              <ProgressBar
                completed={completedLessons}
                total={totalLessons}
                size="md"
              />
            </div>
          )}

          {/* Action button */}
          <div className="flex items-center gap-3">
            {hasStarted && nextUncompletedLesson ? (
              <a
                href={`/courses/${courseSlug}/lessons/${nextUncompletedLesson.slug}`}
                className="
                  inline-flex items-center gap-2 px-6 py-2.5 rounded-lg
                  bg-blue-600 text-white text-sm font-semibold
                  hover:bg-blue-700 transition-colors
                "
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                  <path d="M6.3 2.84A1.5 1.5 0 0 0 4 4.11v11.78a1.5 1.5 0 0 0 2.3 1.27l9.344-5.891a1.5 1.5 0 0 0 0-2.538L6.3 2.841Z" />
                </svg>
                続きから学習
              </a>
            ) : firstAccessibleLesson ? (
              <a
                href={`/courses/${courseSlug}/lessons/${firstAccessibleLesson.slug}`}
                className="
                  inline-flex items-center gap-2 px-6 py-2.5 rounded-lg
                  bg-blue-600 text-white text-sm font-semibold
                  hover:bg-blue-700 transition-colors
                "
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                  <path d="M6.3 2.84A1.5 1.5 0 0 0 4 4.11v11.78a1.5 1.5 0 0 0 2.3 1.27l9.344-5.891a1.5 1.5 0 0 0 0-2.538L6.3 2.841Z" />
                </svg>
                学習を始める
              </a>
            ) : null}

            <span className="text-xs text-gray-400">
              {totalLessons} レッスン / {course.modules.length} モジュール
            </span>
          </div>
        </div>
      </header>

      {/* Module list */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-4">
        {course.modules.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-sm text-gray-400">
              このコースにはまだモジュールが追加されていません。
            </p>
          </div>
        ) : (
          course.modules.map((mod, mi) => (
            <ModuleAccordion
              key={mod.id}
              module={mod}
              moduleIndex={mi}
              courseSlug={courseSlug}
              progressMap={progressMap}
              defaultExpanded={mi === 0}
            />
          ))
        )}
      </div>
    </div>
  );
}
