"use client";

import { useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import type { ContentStatus, VisibilityMode } from "@/types/database";
import { ProgressBar } from "@/components/domain/progress-bar";

export interface CourseCardData {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  cover_image_url: string | null;
  status: ContentStatus;
  visibility_mode: VisibilityMode;
  sort_order: number;
  modules_count: number;
  lessons_count: number;
  created_at: string;
}

interface CourseCardProps {
  course: CourseCardData;
  /** User's progress (if started). Pass null if not started. */
  progress?: { completed_lessons: number; total_lessons: number } | null;
  /** Required unlock level for the course (from gamification rules). null = no level restriction. */
  requiredLevel?: number | null;
  /** Current user level (from member_points) */
  currentLevel?: number;
}

const statusLabels: Record<ContentStatus, { label: string; className: string }> = {
  draft: { label: "下書き", className: "bg-yellow-50 text-yellow-700 border-yellow-200" },
  published: { label: "公開中", className: "bg-green-50 text-green-700 border-green-200" },
  archived: { label: "アーカイブ", className: "bg-gray-50 text-gray-500 border-gray-200" },
};

const visibilityLabels: Record<VisibilityMode, { label: string; icon: string }> = {
  public: { label: "公開", icon: "M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418" },
  members_only: { label: "メンバー限定", icon: "M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" },
  rules_based: { label: "条件付き", icon: "M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" },
};

export function CourseCard({
  course,
  progress,
  requiredLevel,
  currentLevel = 1,
}: CourseCardProps) {
  const router = useRouter();
  const status = statusLabels[course.status];
  const visibility = visibilityLabels[course.visibility_mode];
  const isLevelLocked = requiredLevel != null && currentLevel < requiredLevel;
  const hasStarted = progress != null && progress.completed_lessons > 0;

  const handleClick = useCallback(() => {
    if (isLevelLocked) return;
    router.push(`/courses/${course.slug}`);
  }, [router, course.slug, isLevelLocked]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.key === "Enter" || e.key === " ") && !isLevelLocked) {
        e.preventDefault();
        handleClick();
      }
    },
    [handleClick, isLevelLocked]
  );

  const coverGradient = useMemo(() => {
    // Deterministic gradient based on course id hash
    const hash = course.id.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
    const gradients = [
      "from-blue-400 to-indigo-500",
      "from-emerald-400 to-teal-500",
      "from-purple-400 to-pink-500",
      "from-orange-400 to-rose-500",
      "from-cyan-400 to-blue-500",
      "from-violet-400 to-purple-500",
    ];
    return gradients[hash % gradients.length];
  }, [course.id]);

  return (
    <article
      role="article"
      tabIndex={isLevelLocked ? -1 : 0}
      aria-label={`コース: ${course.title}`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={`
        group bg-white rounded-xl border border-gray-200 overflow-hidden
        transition-all duration-200 ease-out
        ${
          isLevelLocked
            ? "opacity-70 cursor-not-allowed"
            : "hover:border-gray-300 hover:shadow-lg hover:-translate-y-0.5 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        }
      `}
    >
      {/* Cover image / gradient */}
      <div className="relative h-36 overflow-hidden">
        {course.cover_image_url ? (
          <img
            src={course.cover_image_url}
            alt={`${course.title}のカバー画像`}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div
            className={`w-full h-full bg-gradient-to-br ${coverGradient} group-hover:scale-105 transition-transform duration-300`}
            aria-hidden="true"
          />
        )}

        {/* Status badge */}
        {course.status !== "published" && (
          <span
            className={`absolute top-3 left-3 inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${status.className}`}
          >
            {status.label}
          </span>
        )}

        {/* Visibility badge */}
        <span className="absolute top-3 right-3 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-white/90 backdrop-blur-sm text-gray-700 border border-white/50">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="w-3 h-3"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d={visibility.icon} />
          </svg>
          {visibility.label}
        </span>

        {/* Level lock overlay */}
        {isLevelLocked && (
          <div className="absolute inset-0 bg-gray-900/40 backdrop-blur-[2px] flex items-center justify-center">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/95 shadow-sm">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="w-4 h-4 text-amber-500"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M10 1a4.5 4.5 0 0 0-4.5 4.5V9H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-.5V5.5A4.5 4.5 0 0 0 10 1Zm3 8V5.5a3 3 0 1 0-6 0V9h6Z"
                  clipRule="evenodd"
                />
              </svg>
              <span className="text-xs font-semibold text-gray-700">
                レベル{requiredLevel}で解放
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-4">
        <h3 className="text-base font-bold text-gray-900 mb-1 line-clamp-2 group-hover:text-blue-600 transition-colors">
          {course.title}
        </h3>

        {course.description && (
          <p className="text-sm text-gray-500 leading-relaxed line-clamp-2 mb-3">
            {course.description}
          </p>
        )}

        {/* Progress bar (if user has started) */}
        {hasStarted && progress && (
          <div className="mb-3">
            <ProgressBar
              completed={progress.completed_lessons}
              total={progress.total_lessons}
              size="sm"
            />
          </div>
        )}

        {/* Stats */}
        <div className="flex items-center gap-3 text-xs text-gray-400">
          <span className="inline-flex items-center gap-1">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="w-3.5 h-3.5"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z"
              />
            </svg>
            <span className="tabular-nums">{course.modules_count}</span> モジュール
          </span>
          <span className="inline-flex items-center gap-1">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="w-3.5 h-3.5"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25"
              />
            </svg>
            <span className="tabular-nums">{course.lessons_count}</span> レッスン数
          </span>
        </div>
      </div>
    </article>
  );
}
