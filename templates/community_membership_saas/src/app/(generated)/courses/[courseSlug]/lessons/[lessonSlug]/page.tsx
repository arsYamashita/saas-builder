"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import {
  LessonPlayer,
  type LessonWithAccess,
  type ModuleWithLessons,
} from "@/components/domain/lesson-player";

// ─── Skeleton ───

function LessonSkeleton() {
  return (
    <div className="flex flex-col lg:flex-row gap-6 animate-pulse">
      <div className="flex-1 space-y-6">
        <div className="h-8 bg-gray-200 rounded w-2/3" />
        <div className="h-2.5 bg-gray-100 rounded-full w-full" />
        <div className="space-y-3">
          <div className="h-4 bg-gray-100 rounded w-full" />
          <div className="h-4 bg-gray-100 rounded w-5/6" />
          <div className="h-4 bg-gray-100 rounded w-4/6" />
          <div className="h-4 bg-gray-100 rounded w-full" />
          <div className="h-4 bg-gray-100 rounded w-3/4" />
        </div>
      </div>
      <div className="hidden lg:block lg:w-72">
        <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
          <div className="h-4 bg-gray-200 rounded w-24" />
          <div className="h-3 bg-gray-100 rounded w-full" />
          <div className="h-3 bg-gray-100 rounded w-full" />
          <div className="h-3 bg-gray-100 rounded w-full" />
          <div className="h-3 bg-gray-100 rounded w-full" />
        </div>
      </div>
    </div>
  );
}

// ─── Page ───

export default function LessonPage() {
  const params = useParams();
  const courseSlug = params.courseSlug as string;
  const lessonSlug = params.lessonSlug as string;

  const [course, setCourse] = useState<{
    id: string;
    title: string;
    slug: string;
    modules: ModuleWithLessons[];
  } | null>(null);
  const [lesson, setLesson] = useState<LessonWithAccess | null>(null);
  const [progressMap, setProgressMap] = useState<Record<string, boolean>>({});
  const [courseProgress, setCourseProgress] = useState({
    completed: 0,
    total: 0,
  });
  const [currentLevel, setCurrentLevel] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const tenantSlug =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("tenantSlug") ?? ""
      : "";

  // Fetch course data + find the lesson
  const fetchData = useCallback(async () => {
    if (!tenantSlug || !courseSlug || !lessonSlug) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // 1. Fetch course with full module/lesson structure
      const courseRes = await fetch(
        `/api/public/tenants/${tenantSlug}/courses/${courseSlug}`
      );
      if (!courseRes.ok) {
        throw new Error(
          courseRes.status === 404
            ? "コースが見つかりませんでした"
            : "コースの取得に失敗しました"
        );
      }

      const courseData = await courseRes.json();
      const courseDetail = courseData.course;
      setCourse(courseDetail);

      // 2. Find the lesson by slug
      let foundLesson: LessonWithAccess | null = null;
      for (const mod of courseDetail.modules) {
        const match = mod.lessons.find(
          (l: LessonWithAccess) => l.slug === lessonSlug
        );
        if (match) {
          foundLesson = match;
          break;
        }
      }

      if (!foundLesson) {
        throw new Error("レッスンが見つかりませんでした");
      }

      setLesson(foundLesson);

      // 3. Fetch progress for all lessons
      const allLessons = courseDetail.modules.flatMap(
        (m: ModuleWithLessons) => m.lessons
      );
      const progressEntries = await Promise.all(
        allLessons.map(async (l: LessonWithAccess) => {
          try {
            const pRes = await fetch(`/api/me/progress/${l.id}`);
            if (!pRes.ok) return [l.id, false] as const;
            const pData = await pRes.json();
            return [l.id, pData.progress?.completed ?? false] as const;
          } catch {
            return [l.id, false] as const;
          }
        })
      );

      const pMap = Object.fromEntries(progressEntries);
      setProgressMap(pMap);

      const completedCount = Object.values(pMap).filter(Boolean).length;
      setCourseProgress({
        completed: completedCount,
        total: allLessons.length,
      });

      // 4. Fetch current user level
      try {
        const pointsRes = await fetch("/api/me/points");
        if (pointsRes.ok) {
          const pointsData = await pointsRes.json();
          setCurrentLevel(pointsData.points?.level ?? 1);
        }
      } catch {
        // Non-critical
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "予期しないエラーが発生しました"
      );
    } finally {
      setIsLoading(false);
    }
  }, [tenantSlug, courseSlug, lessonSlug]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Find module name for breadcrumb
  const moduleName =
    course?.modules.find((m) =>
      m.lessons.some((l) => l.slug === lessonSlug)
    )?.title ?? "";

  // ─── Render ───

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white border-b border-gray-200">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 animate-pulse">
            <div className="h-3 bg-gray-100 rounded w-64" />
          </div>
        </header>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
          <LessonSkeleton />
        </div>
      </div>
    );
  }

  if (error || !course || !lesson) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-50 flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 text-red-400">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-gray-900 mb-2">
            {error ?? "レッスンが見つかりませんでした"}
          </h2>
          <a
            href={`/courses/${courseSlug}`}
            className="mt-4 inline-flex items-center px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
          >
            コースに戻る
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Breadcrumb header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4">
          <nav
            className="flex items-center gap-1.5 text-xs text-gray-400 overflow-x-auto whitespace-nowrap"
            aria-label="パンくずリスト"
          >
            <a
              href="/courses"
              className="hover:text-gray-600 transition-colors flex-shrink-0"
            >
              コース一覧
            </a>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3 flex-shrink-0">
              <path fillRule="evenodd" d="M6.22 4.22a.75.75 0 0 1 1.06 0l3.25 3.25a.75.75 0 0 1 0 1.06l-3.25 3.25a.75.75 0 0 1-1.06-1.06L8.94 8 6.22 5.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
            </svg>
            <a
              href={`/courses/${courseSlug}`}
              className="hover:text-gray-600 transition-colors truncate max-w-[160px] flex-shrink-0"
            >
              {course.title}
            </a>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3 flex-shrink-0">
              <path fillRule="evenodd" d="M6.22 4.22a.75.75 0 0 1 1.06 0l3.25 3.25a.75.75 0 0 1 0 1.06l-3.25 3.25a.75.75 0 0 1-1.06-1.06L8.94 8 6.22 5.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
            </svg>
            {moduleName && (
              <>
                <span className="text-gray-500 truncate max-w-[120px] flex-shrink-0">
                  {moduleName}
                </span>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3 flex-shrink-0">
                  <path fillRule="evenodd" d="M6.22 4.22a.75.75 0 0 1 1.06 0l3.25 3.25a.75.75 0 0 1 0 1.06l-3.25 3.25a.75.75 0 0 1-1.06-1.06L8.94 8 6.22 5.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
                </svg>
              </>
            )}
            <span className="text-gray-600 font-medium truncate">
              {lesson.title}
            </span>
          </nav>
        </div>
      </header>

      {/* Lesson player */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <LessonPlayer
          lesson={lesson}
          modules={course.modules}
          courseSlug={courseSlug}
          courseTitle={course.title}
          progressMap={progressMap}
          currentLevel={currentLevel}
          courseProgress={courseProgress}
        />
      </div>
    </div>
  );
}
