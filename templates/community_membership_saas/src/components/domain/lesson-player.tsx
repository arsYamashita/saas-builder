"use client";

import { useState, useCallback, useMemo } from "react";
import type { CourseLesson, CourseModule, RichTextBody } from "@/types/database";
import { ProgressBar } from "@/components/domain/progress-bar";

// ─── Types ───

export interface LessonWithAccess extends CourseLesson {
  locked: boolean;
  lock_reason?: string;
  unlock_date?: string;
  required_level?: number;
}

export interface ModuleWithLessons extends CourseModule {
  lessons: LessonWithAccess[];
}

interface LessonPlayerProps {
  /** Current lesson data */
  lesson: LessonWithAccess;
  /** All modules with their lessons (for sidebar navigation) */
  modules: ModuleWithLessons[];
  /** Parent course slug for navigation */
  courseSlug: string;
  /** Parent course title for display */
  courseTitle: string;
  /** Map of lessonId -> completed */
  progressMap: Record<string, boolean>;
  /** Current user level (for lock messages) */
  currentLevel?: number;
  /** Total / completed counts for the entire course */
  courseProgress: { completed: number; total: number };
}

// ─── Helpers ───

/**
 * Render ProseMirror JSON body as formatted text.
 * Falls back to raw display for unknown node types.
 */
function renderProseMirrorBody(body: RichTextBody | null): string {
  if (!body) return "";
  if (typeof body === "string") return body;

  const doc = body as { type: string; content?: Array<Record<string, unknown>> };
  if (!doc.content) return "";

  return doc.content
    .map((node) => {
      if (node.type === "paragraph") {
        const children = (node.content as Array<{ type: string; text?: string }>) ?? [];
        return children.map((c) => c.text ?? "").join("");
      }
      if (node.type === "heading") {
        const children = (node.content as Array<{ type: string; text?: string }>) ?? [];
        return children.map((c) => c.text ?? "").join("");
      }
      return "";
    })
    .join("\n\n");
}

function formatCountdown(unlockDateStr: string): string {
  const now = Date.now();
  const unlock = new Date(unlockDateStr).getTime();
  const diffMs = unlock - now;

  if (diffMs <= 0) return "まもなく解放されます";

  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

  if (days > 0) return `あと${days}日${hours}時間`;
  return `あと${hours}時間`;
}

// ─── Sidebar ───

function LessonSidebar({
  modules,
  currentLessonId,
  progressMap,
  courseSlug,
}: {
  modules: ModuleWithLessons[];
  currentLessonId: string;
  progressMap: Record<string, boolean>;
  courseSlug: string;
}) {
  const [expandedModules, setExpandedModules] = useState<Record<string, boolean>>(() => {
    // Expand the module containing the current lesson by default
    const map: Record<string, boolean> = {};
    for (const mod of modules) {
      const containsCurrent = mod.lessons.some((l) => l.id === currentLessonId);
      map[mod.id] = containsCurrent;
    }
    return map;
  });

  const toggleModule = useCallback((moduleId: string) => {
    setExpandedModules((prev) => ({ ...prev, [moduleId]: !prev[moduleId] }));
  }, []);

  return (
    <nav
      className="bg-white border border-gray-200 rounded-xl overflow-hidden"
      aria-label="レッスン一覧"
    >
      <div className="px-4 py-3 border-b border-gray-100">
        <h3 className="text-sm font-bold text-gray-900">コース目次</h3>
      </div>
      <div className="max-h-[calc(100vh-16rem)] overflow-y-auto">
        {modules.map((mod) => {
          const isExpanded = expandedModules[mod.id] ?? false;
          const completedInModule = mod.lessons.filter(
            (l) => progressMap[l.id]
          ).length;

          return (
            <div key={mod.id} className="border-b border-gray-50 last:border-b-0">
              <button
                type="button"
                onClick={() => toggleModule(mod.id)}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-gray-50 transition-colors"
                aria-expanded={isExpanded}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className={`w-4 h-4 text-gray-400 transition-transform ${
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
                <span className="flex-1 text-sm font-medium text-gray-700 truncate">
                  {mod.title}
                </span>
                <span className="text-[10px] text-gray-400 tabular-nums flex-shrink-0">
                  {completedInModule}/{mod.lessons.length}
                </span>
              </button>

              {isExpanded && (
                <ul className="pb-1">
                  {mod.lessons.map((lesson) => {
                    const isCurrent = lesson.id === currentLessonId;
                    const isCompleted = progressMap[lesson.id] ?? false;

                    return (
                      <li key={lesson.id}>
                        <a
                          href={
                            lesson.locked
                              ? undefined
                              : `/courses/${courseSlug}/lessons/${lesson.slug}`
                          }
                          className={`
                            flex items-center gap-2 px-4 pl-10 py-2 text-sm transition-colors
                            ${isCurrent ? "bg-blue-50 text-blue-700 font-medium" : "text-gray-600 hover:bg-gray-50"}
                            ${lesson.locked ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
                          `}
                          aria-current={isCurrent ? "page" : undefined}
                          onClick={
                            lesson.locked
                              ? (e) => e.preventDefault()
                              : undefined
                          }
                        >
                          {/* Status icon */}
                          {lesson.locked ? (
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5 text-gray-400 flex-shrink-0">
                              <path fillRule="evenodd" d="M8 1a3.5 3.5 0 0 0-3.5 3.5V7A1.5 1.5 0 0 0 3 8.5v5A1.5 1.5 0 0 0 4.5 15h7a1.5 1.5 0 0 0 1.5-1.5v-5A1.5 1.5 0 0 0 11.5 7V4.5A3.5 3.5 0 0 0 8 1Zm2 6V4.5a2 2 0 1 0-4 0V7h4Z" clipRule="evenodd" />
                            </svg>
                          ) : isCompleted ? (
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5 text-green-500 flex-shrink-0">
                              <path fillRule="evenodd" d="M8 15A7 7 0 1 0 8 1a7 7 0 0 0 0 14Zm3.844-8.791a.75.75 0 0 0-1.188-.918l-3.7 4.79-1.649-1.833a.75.75 0 1 0-1.114 1.004l2.25 2.5a.75.75 0 0 0 1.15-.043l4.25-5.5Z" clipRule="evenodd" />
                            </svg>
                          ) : (
                            <div className="w-3.5 h-3.5 rounded-full border-2 border-gray-300 flex-shrink-0" />
                          )}
                          <span className="truncate">{lesson.title}</span>
                          {lesson.is_preview && (
                            <span className="ml-auto text-[10px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded font-medium flex-shrink-0">
                              無料
                            </span>
                          )}
                        </a>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </nav>
  );
}

// ─── Lock Messages ───

function DripLockMessage({ unlockDate }: { unlockDate: string }) {
  const formattedDate = new Date(unlockDate).toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
      <div className="w-16 h-16 rounded-full bg-amber-50 flex items-center justify-center mb-4">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 text-amber-500">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
        </svg>
      </div>
      <h3 className="text-lg font-bold text-gray-900 mb-2">
        このレッスンはまだ公開されていません
      </h3>
      <p className="text-sm text-gray-500 max-w-md leading-relaxed">
        このレッスンは<span className="font-semibold text-gray-700">{formattedDate}</span>に解放されます。
      </p>
      <p className="text-xs text-gray-400 mt-2">
        {formatCountdown(unlockDate)}
      </p>
    </div>
  );
}

function LevelLockMessage({
  requiredLevel,
  currentLevel,
}: {
  requiredLevel: number;
  currentLevel: number;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
      <div className="w-16 h-16 rounded-full bg-purple-50 flex items-center justify-center mb-4">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 text-purple-500">
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
        </svg>
      </div>
      <h3 className="text-lg font-bold text-gray-900 mb-2">
        レベル{requiredLevel}に到達すると解放されます
      </h3>
      <p className="text-sm text-gray-500 max-w-md leading-relaxed">
        現在レベル<span className="font-semibold text-gray-700">{currentLevel}</span>です。コミュニティに参加してポイントを貯めましょう。
      </p>
      <div className="mt-4 flex items-center gap-2">
        <span className="text-xs text-gray-400">現在</span>
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-gray-100 text-gray-600">
          Lv.{currentLevel}
        </span>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-gray-300">
          <path fillRule="evenodd" d="M3 10a.75.75 0 0 1 .75-.75h10.638L10.23 5.29a.75.75 0 1 1 1.04-1.08l5.5 5.25a.75.75 0 0 1 0 1.08l-5.5 5.25a.75.75 0 1 1-1.04-1.08l4.158-3.96H3.75A.75.75 0 0 1 3 10Z" clipRule="evenodd" />
        </svg>
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-purple-100 text-purple-700">
          Lv.{requiredLevel}
        </span>
        <span className="text-xs text-gray-400">必要</span>
      </div>
    </div>
  );
}

// ─── Main Component ───

export function LessonPlayer({
  lesson,
  modules,
  courseSlug,
  courseTitle,
  progressMap,
  currentLevel = 1,
  courseProgress,
}: LessonPlayerProps) {
  const [isCompleting, setIsCompleting] = useState(false);
  const [isCompleted, setIsCompleted] = useState(
    progressMap[lesson.id] ?? false
  );
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Find prev/next lesson across all modules
  const { prevLesson, nextLesson } = useMemo(() => {
    const allLessons = modules.flatMap((m) => m.lessons);
    const currentIdx = allLessons.findIndex((l) => l.id === lesson.id);

    return {
      prevLesson: currentIdx > 0 ? allLessons[currentIdx - 1] : null,
      nextLesson:
        currentIdx >= 0 && currentIdx < allLessons.length - 1
          ? allLessons[currentIdx + 1]
          : null,
    };
  }, [modules, lesson.id]);

  const bodyText = useMemo(
    () => renderProseMirrorBody(lesson.body),
    [lesson.body]
  );

  const handleComplete = useCallback(async () => {
    if (isCompleting || isCompleted) return;
    setIsCompleting(true);

    try {
      const res = await fetch(`/api/me/progress/${lesson.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed: true }),
      });

      if (res.ok) {
        setIsCompleted(true);
      }
    } catch {
      // Silent fail - user can retry
    } finally {
      setIsCompleting(false);
    }
  }, [lesson.id, isCompleting, isCompleted]);

  // ─── Locked states ───

  if (lesson.locked) {
    if (lesson.lock_reason === "drip_locked" && lesson.unlock_date) {
      return (
        <div className="flex flex-col lg:flex-row gap-6">
          <div className="flex-1 min-w-0">
            <DripLockMessage unlockDate={lesson.unlock_date} />
          </div>
          <aside className="lg:w-72 flex-shrink-0">
            <LessonSidebar
              modules={modules}
              currentLessonId={lesson.id}
              progressMap={progressMap}
              courseSlug={courseSlug}
            />
          </aside>
        </div>
      );
    }

    if (lesson.lock_reason === "level_locked" && lesson.required_level) {
      return (
        <div className="flex flex-col lg:flex-row gap-6">
          <div className="flex-1 min-w-0">
            <LevelLockMessage
              requiredLevel={lesson.required_level}
              currentLevel={currentLevel}
            />
          </div>
          <aside className="lg:w-72 flex-shrink-0">
            <LessonSidebar
              modules={modules}
              currentLessonId={lesson.id}
              progressMap={progressMap}
              courseSlug={courseSlug}
            />
          </aside>
        </div>
      );
    }

    // Generic lock
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-gray-500">このレッスンにアクセスする権限がありません。</p>
      </div>
    );
  }

  // ─── Accessible lesson ───

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      {/* Mobile sidebar toggle */}
      <button
        type="button"
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="lg:hidden flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors"
        aria-label="目次を表示"
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
        </svg>
        目次を{sidebarOpen ? "閉じる" : "開く"}
      </button>

      {/* Mobile sidebar */}
      {sidebarOpen && (
        <div className="lg:hidden">
          <LessonSidebar
            modules={modules}
            currentLessonId={lesson.id}
            progressMap={progressMap}
            courseSlug={courseSlug}
          />
        </div>
      )}

      {/* Main content */}
      <main className="flex-1 min-w-0">
        {/* Preview badge */}
        {lesson.is_preview && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-600 border border-blue-100 mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
              <path d="M8 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" />
              <path fillRule="evenodd" d="M1.38 8.28a.87.87 0 0 1 0-.566 7.003 7.003 0 0 1 13.24.002.87.87 0 0 1 0 .566A7.003 7.003 0 0 1 1.38 8.28ZM11 8a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" clipRule="evenodd" />
            </svg>
            無料プレビュー
          </span>
        )}

        {/* Lesson title */}
        <h1 className="text-2xl font-bold text-gray-900 mb-4">
          {lesson.title}
        </h1>

        {/* Course progress */}
        <div className="mb-6">
          <ProgressBar
            completed={courseProgress.completed}
            total={courseProgress.total}
            label={courseTitle}
            size="sm"
          />
        </div>

        {/* Lesson body */}
        <article className="prose prose-gray max-w-none mb-8">
          {bodyText ? (
            <div className="whitespace-pre-wrap text-gray-700 leading-relaxed">
              {bodyText}
            </div>
          ) : (
            <p className="text-gray-400 italic">
              このレッスンにはまだコンテンツがありません。
            </p>
          )}
        </article>

        {/* Complete button */}
        <div className="border-t border-gray-200 pt-6 mb-6">
          {isCompleted ? (
            <div className="flex items-center gap-2 text-green-600">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z" clipRule="evenodd" />
              </svg>
              <span className="text-sm font-semibold">完了済み</span>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleComplete}
              disabled={isCompleting}
              className="
                inline-flex items-center gap-2 px-6 py-2.5 rounded-lg
                bg-green-600 text-white text-sm font-semibold
                hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2
                disabled:opacity-50 disabled:cursor-not-allowed
                transition-colors duration-150
              "
            >
              {isCompleting ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  処理中...
                </>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                    <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
                  </svg>
                  完了にする
                </>
              )}
            </button>
          )}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between gap-4">
          {prevLesson && !prevLesson.locked ? (
            <a
              href={`/courses/${courseSlug}/lessons/${prevLesson.slug}`}
              className="
                inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-gray-200
                text-sm font-medium text-gray-600
                hover:bg-gray-50 hover:border-gray-300
                transition-colors
              "
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path fillRule="evenodd" d="M17 10a.75.75 0 0 1-.75.75H5.612l4.158 3.96a.75.75 0 1 1-1.04 1.08l-5.5-5.25a.75.75 0 0 1 0-1.08l5.5-5.25a.75.75 0 1 1 1.04 1.08L5.612 9.25H16.25A.75.75 0 0 1 17 10Z" clipRule="evenodd" />
              </svg>
              <span className="truncate max-w-[160px]">{prevLesson.title}</span>
            </a>
          ) : (
            <div />
          )}

          {nextLesson && !nextLesson.locked ? (
            <a
              href={`/courses/${courseSlug}/lessons/${nextLesson.slug}`}
              className="
                inline-flex items-center gap-2 px-4 py-2.5 rounded-lg
                bg-blue-600 text-white text-sm font-medium
                hover:bg-blue-700 transition-colors
              "
            >
              <span className="truncate max-w-[160px]">{nextLesson.title}</span>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path fillRule="evenodd" d="M3 10a.75.75 0 0 1 .75-.75h10.638L10.23 5.29a.75.75 0 1 1 1.04-1.08l5.5 5.25a.75.75 0 0 1 0 1.08l-5.5 5.25a.75.75 0 1 1-1.04-1.08l4.158-3.96H3.75A.75.75 0 0 1 3 10Z" clipRule="evenodd" />
              </svg>
            </a>
          ) : (
            <div />
          )}
        </div>
      </main>

      {/* Desktop sidebar */}
      <aside className="hidden lg:block lg:w-72 flex-shrink-0">
        <div className="sticky top-6">
          <LessonSidebar
            modules={modules}
            currentLessonId={lesson.id}
            progressMap={progressMap}
            courseSlug={courseSlug}
          />
        </div>
      </aside>
    </div>
  );
}
