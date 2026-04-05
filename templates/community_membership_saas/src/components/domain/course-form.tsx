"use client";

import { useState, useCallback, useRef } from "react";
import type {
  ContentStatus,
  VisibilityMode,
  Course,
  CourseModule,
  CourseLesson,
} from "@/types/database";

// ─── Local form types ───

interface LessonFormData {
  _key: string; // client-side key for React
  id?: string; // existing lesson id (edit mode)
  title: string;
  slug: string;
  body: string; // plain text for now (rich text placeholder)
  is_preview: boolean;
  drip_days: number | null;
  unlock_level: number | null;
  sort_order: number;
}

interface ModuleFormData {
  _key: string;
  id?: string;
  title: string;
  description: string;
  sort_order: number;
  lessons: LessonFormData[];
}

interface CourseFormData {
  title: string;
  slug: string;
  description: string;
  status: ContentStatus;
  visibility_mode: VisibilityMode;
  sort_order: number;
  modules: ModuleFormData[];
}

interface CourseFormProps {
  tenantId: string;
  /** If provided, the form enters edit mode */
  existingCourse?: Course & {
    modules?: (CourseModule & { lessons?: CourseLesson[] })[];
  };
  onSuccess: (courseId: string) => void;
  onCancel?: () => void;
}

// ─── Helpers ───

let keyCounter = 0;
function nextKey(): string {
  return `_form_${++keyCounter}_${Date.now()}`;
}

function toSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function createEmptyLesson(sortOrder: number): LessonFormData {
  return {
    _key: nextKey(),
    title: "",
    slug: "",
    body: "",
    is_preview: false,
    drip_days: null,
    unlock_level: null,
    sort_order: sortOrder,
  };
}

function createEmptyModule(sortOrder: number): ModuleFormData {
  return {
    _key: nextKey(),
    title: "",
    description: "",
    sort_order: sortOrder,
    lessons: [],
  };
}

function initFormData(
  existing?: CourseFormProps["existingCourse"]
): CourseFormData {
  if (!existing) {
    return {
      title: "",
      slug: "",
      description: "",
      status: "draft",
      visibility_mode: "members_only",
      sort_order: 0,
      modules: [],
    };
  }

  return {
    title: existing.title,
    slug: existing.slug,
    description: existing.description ?? "",
    status: existing.status,
    visibility_mode: existing.visibility_mode,
    sort_order: existing.sort_order,
    modules: (existing.modules ?? [])
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((mod) => ({
        _key: nextKey(),
        id: mod.id,
        title: mod.title,
        description: mod.description ?? "",
        sort_order: mod.sort_order,
        lessons: (mod.lessons ?? [])
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((lesson) => ({
            _key: nextKey(),
            id: lesson.id,
            title: lesson.title,
            slug: lesson.slug,
            body:
              typeof lesson.body === "string"
                ? lesson.body
                : lesson.body
                ? JSON.stringify(lesson.body)
                : "",
            is_preview: lesson.is_preview,
            drip_days: lesson.drip_days,
            unlock_level: lesson.unlock_level,
            sort_order: lesson.sort_order,
          })),
      })),
  };
}

// ─── Spinner ───

function Spinner() {
  return (
    <svg
      className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

// ─── Component ───

export function CourseForm({
  tenantId,
  existingCourse,
  onSuccess,
  onCancel,
}: CourseFormProps) {
  const isEdit = !!existingCourse;
  const [form, setForm] = useState<CourseFormData>(() =>
    initFormData(existingCourse)
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // ─── Course field updates ───

  const updateField = useCallback(
    <K extends keyof CourseFormData>(key: K, value: CourseFormData[K]) => {
      setForm((prev) => {
        const next = { ...prev, [key]: value };
        // Auto-generate slug from title (only if slug was empty or auto-generated)
        if (key === "title" && typeof value === "string") {
          const currentAutoSlug = toSlug(prev.title);
          if (!prev.slug || prev.slug === currentAutoSlug) {
            next.slug = toSlug(value);
          }
        }
        return next;
      });
      setErrors((prev) => {
        const next = { ...prev };
        delete next[key as string];
        return next;
      });
    },
    []
  );

  // ─── Module operations ───

  const addModule = useCallback(() => {
    setForm((prev) => ({
      ...prev,
      modules: [
        ...prev.modules,
        createEmptyModule(prev.modules.length),
      ],
    }));
  }, []);

  const removeModule = useCallback((moduleKey: string) => {
    setForm((prev) => ({
      ...prev,
      modules: prev.modules
        .filter((m) => m._key !== moduleKey)
        .map((m, i) => ({ ...m, sort_order: i })),
    }));
  }, []);

  const moveModule = useCallback((moduleKey: string, direction: "up" | "down") => {
    setForm((prev) => {
      const idx = prev.modules.findIndex((m) => m._key === moduleKey);
      if (idx < 0) return prev;
      const newIdx = direction === "up" ? idx - 1 : idx + 1;
      if (newIdx < 0 || newIdx >= prev.modules.length) return prev;
      const newModules = [...prev.modules];
      [newModules[idx], newModules[newIdx]] = [newModules[newIdx], newModules[idx]];
      return {
        ...prev,
        modules: newModules.map((m, i) => ({ ...m, sort_order: i })),
      };
    });
  }, []);

  const updateModule = useCallback(
    (moduleKey: string, field: keyof ModuleFormData, value: unknown) => {
      setForm((prev) => ({
        ...prev,
        modules: prev.modules.map((m) =>
          m._key === moduleKey ? { ...m, [field]: value } : m
        ),
      }));
    },
    []
  );

  // ─── Lesson operations ───

  const addLesson = useCallback((moduleKey: string) => {
    setForm((prev) => ({
      ...prev,
      modules: prev.modules.map((m) => {
        if (m._key !== moduleKey) return m;
        return {
          ...m,
          lessons: [
            ...m.lessons,
            createEmptyLesson(m.lessons.length),
          ],
        };
      }),
    }));
  }, []);

  const removeLesson = useCallback((moduleKey: string, lessonKey: string) => {
    setForm((prev) => ({
      ...prev,
      modules: prev.modules.map((m) => {
        if (m._key !== moduleKey) return m;
        return {
          ...m,
          lessons: m.lessons
            .filter((l) => l._key !== lessonKey)
            .map((l, i) => ({ ...l, sort_order: i })),
        };
      }),
    }));
  }, []);

  const moveLesson = useCallback(
    (moduleKey: string, lessonKey: string, direction: "up" | "down") => {
      setForm((prev) => ({
        ...prev,
        modules: prev.modules.map((m) => {
          if (m._key !== moduleKey) return m;
          const idx = m.lessons.findIndex((l) => l._key === lessonKey);
          if (idx < 0) return m;
          const newIdx = direction === "up" ? idx - 1 : idx + 1;
          if (newIdx < 0 || newIdx >= m.lessons.length) return m;
          const newLessons = [...m.lessons];
          [newLessons[idx], newLessons[newIdx]] = [newLessons[newIdx], newLessons[idx]];
          return {
            ...m,
            lessons: newLessons.map((l, i) => ({ ...l, sort_order: i })),
          };
        }),
      }));
    },
    []
  );

  const updateLesson = useCallback(
    (
      moduleKey: string,
      lessonKey: string,
      field: keyof LessonFormData,
      value: unknown
    ) => {
      setForm((prev) => ({
        ...prev,
        modules: prev.modules.map((m) => {
          if (m._key !== moduleKey) return m;
          return {
            ...m,
            lessons: m.lessons.map((l) => {
              if (l._key !== lessonKey) return l;
              const updated = { ...l, [field]: value };
              // Auto-generate lesson slug from title
              if (field === "title" && typeof value === "string") {
                const currentAutoSlug = toSlug(l.title);
                if (!l.slug || l.slug === currentAutoSlug) {
                  updated.slug = toSlug(value);
                }
              }
              return updated;
            }),
          };
        }),
      }));
    },
    []
  );

  // ─── Validation ───

  const validate = useCallback((): boolean => {
    const errs: Record<string, string> = {};

    if (!form.title.trim()) {
      errs.title = "コースタイトルは必須です";
    }
    if (!form.slug.trim()) {
      errs.slug = "スラッグは必須です";
    } else if (!/^[a-z0-9-]+$/.test(form.slug)) {
      errs.slug = "スラッグは英小文字・数字・ハイフンのみ使用できます";
    }

    form.modules.forEach((mod, mi) => {
      if (!mod.title.trim()) {
        errs[`module_${mi}_title`] = `モジュール ${mi + 1} のタイトルは必須です`;
      }
      mod.lessons.forEach((lesson, li) => {
        if (!lesson.title.trim()) {
          errs[`module_${mi}_lesson_${li}_title`] = `レッスン ${li + 1} のタイトルは必須です`;
        }
        if (!lesson.slug.trim()) {
          errs[`module_${mi}_lesson_${li}_slug`] = `レッスン ${li + 1} のスラッグは必須です`;
        }
      });
    });

    setErrors(errs);
    return Object.keys(errs).length === 0;
  }, [form]);

  // ─── Submit ───

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!validate() || isSubmitting) return;

      setIsSubmitting(true);
      setGlobalError(null);

      try {
        // 1. Create or update course
        const coursePayload = {
          title: form.title.trim(),
          slug: form.slug.trim(),
          description: form.description.trim() || null,
          status: form.status,
          visibility_mode: form.visibility_mode,
          sort_order: form.sort_order,
        };

        const courseUrl = isEdit
          ? `/api/admin/tenants/${tenantId}/courses/${existingCourse!.id}`
          : `/api/admin/tenants/${tenantId}/courses`;

        const courseRes = await fetch(courseUrl, {
          method: isEdit ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(coursePayload),
        });

        if (!courseRes.ok) {
          const data = await courseRes.json().catch(() => null);
          throw new Error(
            data?.error ?? `コースの${isEdit ? "更新" : "作成"}に失敗しました`
          );
        }

        const courseData = await courseRes.json();
        const courseId = courseData.course.id;

        // 2. Create modules and lessons (sequential to respect sort_order)
        for (const mod of form.modules) {
          const modulePayload = {
            title: mod.title.trim(),
            description: mod.description.trim() || null,
            sort_order: mod.sort_order,
          };

          const moduleUrl = mod.id
            ? `/api/admin/tenants/${tenantId}/modules/${mod.id}`
            : `/api/admin/tenants/${tenantId}/courses/${courseId}/modules`;

          const moduleRes = await fetch(moduleUrl, {
            method: mod.id ? "PUT" : "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(modulePayload),
          });

          if (!moduleRes.ok) {
            const data = await moduleRes.json().catch(() => null);
            throw new Error(
              data?.error ?? `モジュール「${mod.title}」の保存に失敗しました`
            );
          }

          const moduleData = await moduleRes.json();
          const moduleId = moduleData.module.id;

          // 3. Create lessons for this module
          for (const lesson of mod.lessons) {
            const lessonPayload = {
              title: lesson.title.trim(),
              slug: lesson.slug.trim(),
              body: lesson.body.trim()
                ? { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: lesson.body.trim() }] }] }
                : null,
              is_preview: lesson.is_preview,
              drip_days: lesson.drip_days,
              unlock_level: lesson.unlock_level,
              sort_order: lesson.sort_order,
            };

            const lessonUrl = lesson.id
              ? `/api/admin/tenants/${tenantId}/lessons/${lesson.id}`
              : `/api/admin/tenants/${tenantId}/modules/${moduleId}/lessons`;

            const lessonRes = await fetch(lessonUrl, {
              method: lesson.id ? "PUT" : "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(lessonPayload),
            });

            if (!lessonRes.ok) {
              const data = await lessonRes.json().catch(() => null);
              throw new Error(
                data?.error ?? `レッスン「${lesson.title}」の保存に失敗しました`
              );
            }
          }
        }

        onSuccess(courseId);
      } catch (err) {
        setGlobalError(
          err instanceof Error ? err.message : "予期しないエラーが発生しました"
        );
      } finally {
        setIsSubmitting(false);
      }
    },
    [form, validate, isSubmitting, isEdit, tenantId, existingCourse, onSuccess]
  );

  // ─── Render ───

  const inputClass =
    "w-full px-4 py-2.5 border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-shadow";
  const selectClass = `${inputClass} bg-white`;
  const labelClass = "block text-sm font-medium text-gray-700 mb-1.5";
  const errorClass = "mt-1 text-xs text-red-600";

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-8">
      {/* Helper text */}
      <p className="text-sm text-gray-500">
        コースの基本情報を入力し、モジュールとレッスンを追加してください。
      </p>

      {/* Global error */}
      {globalError && (
        <div
          role="alert"
          className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700"
        >
          {globalError}
        </div>
      )}

      {/* ── Course basics ── */}
      <fieldset className="space-y-5">
        <legend className="text-lg font-bold text-gray-900 mb-2">
          基本情報
        </legend>

        {/* Title */}
        <div>
          <label htmlFor="course-title" className={labelClass}>
            コースタイトル <span className="text-red-500">*</span>
          </label>
          <input
            id="course-title"
            type="text"
            value={form.title}
            onChange={(e) => updateField("title", e.target.value)}
            placeholder="コースタイトルを入力"
            required
            maxLength={200}
            className={inputClass}
            aria-invalid={!!errors.title}
            aria-describedby={errors.title ? "course-title-error" : undefined}
          />
          {errors.title && (
            <p id="course-title-error" className={errorClass}>
              {errors.title}
            </p>
          )}
        </div>

        {/* Slug */}
        <div>
          <label htmlFor="course-slug" className={labelClass}>
            スラッグ（URL用）
            <span className="text-red-500">*</span>
          </label>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-400 flex-shrink-0">/courses/</span>
            <input
              id="course-slug"
              type="text"
              value={form.slug}
              onChange={(e) => updateField("slug", e.target.value)}
              placeholder="course-slug"
              required
              maxLength={80}
              className={inputClass}
              aria-invalid={!!errors.slug}
              aria-describedby={errors.slug ? "course-slug-error" : undefined}
            />
          </div>
          {errors.slug && (
            <p id="course-slug-error" className={errorClass}>
              {errors.slug}
            </p>
          )}
          <p className="mt-1 text-xs text-gray-400">
            タイトルから自動生成されます。英小文字・数字・ハイフンのみ使用可能です。
          </p>
        </div>

        {/* Description */}
        <div>
          <label htmlFor="course-description" className={labelClass}>
            説明文
          </label>
          <textarea
            id="course-description"
            value={form.description}
            onChange={(e) => updateField("description", e.target.value)}
            placeholder="コースの説明を書いてください"
            rows={4}
            maxLength={2000}
            className={`${inputClass} resize-y`}
          />
        </div>

        {/* Status + Visibility */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label htmlFor="course-status" className={labelClass}>
              ステータス
            </label>
            <select
              id="course-status"
              value={form.status}
              onChange={(e) =>
                updateField("status", e.target.value as ContentStatus)
              }
              className={selectClass}
            >
              <option value="draft">下書き</option>
              <option value="published">公開</option>
              <option value="archived">アーカイブ</option>
            </select>
          </div>

          <div>
            <label htmlFor="course-visibility" className={labelClass}>
              公開範囲
            </label>
            <select
              id="course-visibility"
              value={form.visibility_mode}
              onChange={(e) =>
                updateField(
                  "visibility_mode",
                  e.target.value as VisibilityMode
                )
              }
              className={selectClass}
            >
              <option value="public">公開（誰でも）</option>
              <option value="members_only">メンバー限定</option>
              <option value="rules_based">条件付きアクセス</option>
            </select>
          </div>

          <div>
            <label htmlFor="course-sort" className={labelClass}>
              並び順
            </label>
            <input
              id="course-sort"
              type="number"
              value={form.sort_order}
              onChange={(e) =>
                updateField("sort_order", parseInt(e.target.value) || 0)
              }
              min={0}
              className={inputClass}
            />
            <p className="mt-1 text-xs text-gray-400">
              小さい数ほど前に表示されます
            </p>
          </div>
        </div>
      </fieldset>

      {/* ── Modules ── */}
      <fieldset className="space-y-4">
        <div className="flex items-center justify-between">
          <legend className="text-lg font-bold text-gray-900">
            モジュール構成
          </legend>
          <button
            type="button"
            onClick={addModule}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-600 text-sm font-medium hover:bg-blue-100 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
            </svg>
            モジュールを追加
          </button>
        </div>

        {form.modules.length === 0 && (
          <div className="py-12 text-center border-2 border-dashed border-gray-200 rounded-xl">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-10 h-10 mx-auto text-gray-300 mb-3">
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />
            </svg>
            <p className="text-sm text-gray-400">
              まだモジュールがありません。上のボタンから追加してください。
            </p>
          </div>
        )}

        {form.modules.map((mod, mi) => (
          <div
            key={mod._key}
            className="border border-gray-200 rounded-xl bg-gray-50/50 overflow-hidden"
          >
            {/* Module header */}
            <div className="flex items-center gap-2 px-4 py-3 bg-white border-b border-gray-100">
              <span className="text-xs font-bold text-gray-400 tabular-nums w-8">
                #{mi + 1}
              </span>
              <input
                type="text"
                value={mod.title}
                onChange={(e) =>
                  updateModule(mod._key, "title", e.target.value)
                }
                placeholder={`モジュール ${mi + 1} のタイトル`}
                className="flex-1 px-3 py-1.5 border border-gray-200 rounded-md text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                aria-label={`モジュール ${mi + 1} タイトル`}
              />
              {errors[`module_${mi}_title`] && (
                <span className="text-xs text-red-600">
                  {errors[`module_${mi}_title`]}
                </span>
              )}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => moveModule(mod._key, "up")}
                  disabled={mi === 0}
                  className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30 transition-colors"
                  aria-label="上に移動"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                    <path fillRule="evenodd" d="M9.47 6.47a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 1 1-1.06 1.06L10 8.06l-3.72 3.72a.75.75 0 0 1-1.06-1.06l4.25-4.25Z" clipRule="evenodd" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => moveModule(mod._key, "down")}
                  disabled={mi === form.modules.length - 1}
                  className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30 transition-colors"
                  aria-label="下に移動"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                    <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0l-4.25-4.25a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => removeModule(mod._key)}
                  className="p-1 text-red-400 hover:text-red-600 transition-colors"
                  aria-label={`モジュール ${mi + 1} を削除`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                    <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.519.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Module description */}
            <div className="px-4 pt-3">
              <input
                type="text"
                value={mod.description}
                onChange={(e) =>
                  updateModule(mod._key, "description", e.target.value)
                }
                placeholder="モジュールの説明（任意）"
                className="w-full px-3 py-1.5 border border-gray-200 rounded-md text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                aria-label={`モジュール ${mi + 1} 説明`}
              />
            </div>

            {/* Lessons */}
            <div className="px-4 py-3 space-y-3">
              {mod.lessons.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-4">
                  レッスンがまだありません
                </p>
              )}

              {mod.lessons.map((lesson, li) => (
                <div
                  key={lesson._key}
                  className="bg-white border border-gray-200 rounded-lg p-3 space-y-3"
                >
                  {/* Lesson header row */}
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-gray-400 tabular-nums w-6">
                      {mi + 1}.{li + 1}
                    </span>
                    <input
                      type="text"
                      value={lesson.title}
                      onChange={(e) =>
                        updateLesson(
                          mod._key,
                          lesson._key,
                          "title",
                          e.target.value
                        )
                      }
                      placeholder="レッスンタイトル"
                      className="flex-1 px-3 py-1.5 border border-gray-200 rounded-md text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      aria-label={`レッスン ${li + 1} タイトル`}
                    />
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() =>
                          moveLesson(mod._key, lesson._key, "up")
                        }
                        disabled={li === 0}
                        className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30 transition-colors"
                        aria-label="上に移動"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                          <path fillRule="evenodd" d="M9.47 6.47a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 1 1-1.06 1.06L10 8.06l-3.72 3.72a.75.75 0 0 1-1.06-1.06l4.25-4.25Z" clipRule="evenodd" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          moveLesson(mod._key, lesson._key, "down")
                        }
                        disabled={li === mod.lessons.length - 1}
                        className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30 transition-colors"
                        aria-label="下に移動"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                          <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0l-4.25-4.25a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          removeLesson(mod._key, lesson._key)
                        }
                        className="p-1 text-red-400 hover:text-red-600 transition-colors"
                        aria-label={`レッスン ${li + 1} を削除`}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                          <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  {errors[`module_${mi}_lesson_${li}_title`] && (
                    <p className={errorClass}>
                      {errors[`module_${mi}_lesson_${li}_title`]}
                    </p>
                  )}

                  {/* Lesson slug */}
                  <div className="flex items-center gap-2 pl-8">
                    <span className="text-xs text-gray-400 flex-shrink-0">slug:</span>
                    <input
                      type="text"
                      value={lesson.slug}
                      onChange={(e) =>
                        updateLesson(
                          mod._key,
                          lesson._key,
                          "slug",
                          e.target.value
                        )
                      }
                      placeholder="lesson-slug"
                      className="flex-1 px-2 py-1 border border-gray-200 rounded text-xs text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  {errors[`module_${mi}_lesson_${li}_slug`] && (
                    <p className={`${errorClass} pl-8`}>
                      {errors[`module_${mi}_lesson_${li}_slug`]}
                    </p>
                  )}

                  {/* Lesson body */}
                  <div className="pl-8">
                    <textarea
                      value={lesson.body}
                      onChange={(e) =>
                        updateLesson(
                          mod._key,
                          lesson._key,
                          "body",
                          e.target.value
                        )
                      }
                      placeholder="レッスンの本文を入力（リッチテキスト対応予定）"
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
                    />
                  </div>

                  {/* Lesson options row */}
                  <div className="flex flex-wrap items-center gap-3 pl-8">
                    <label className="inline-flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={lesson.is_preview}
                        onChange={(e) =>
                          updateLesson(
                            mod._key,
                            lesson._key,
                            "is_preview",
                            e.target.checked
                          )
                        }
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      プレビュー公開
                    </label>

                    <div className="inline-flex items-center gap-1.5">
                      <label className="text-xs text-gray-500" htmlFor={`drip-${lesson._key}`}>
                        ドリップ日数:
                      </label>
                      <input
                        id={`drip-${lesson._key}`}
                        type="number"
                        value={lesson.drip_days ?? ""}
                        onChange={(e) =>
                          updateLesson(
                            mod._key,
                            lesson._key,
                            "drip_days",
                            e.target.value ? parseInt(e.target.value) : null
                          )
                        }
                        placeholder="入会後○日で解放"
                        min={0}
                        className="w-28 px-2 py-1 border border-gray-200 rounded text-xs text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div className="inline-flex items-center gap-1.5">
                      <label className="text-xs text-gray-500" htmlFor={`level-${lesson._key}`}>
                        解放レベル:
                      </label>
                      <input
                        id={`level-${lesson._key}`}
                        type="number"
                        value={lesson.unlock_level ?? ""}
                        onChange={(e) =>
                          updateLesson(
                            mod._key,
                            lesson._key,
                            "unlock_level",
                            e.target.value ? parseInt(e.target.value) : null
                          )
                        }
                        placeholder="未設定で全員アクセス可"
                        min={1}
                        max={9}
                        className="w-36 px-2 py-1 border border-gray-200 rounded text-xs text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                </div>
              ))}

              {/* Add lesson button */}
              <button
                type="button"
                onClick={() => addLesson(mod._key)}
                className="w-full py-2 border-2 border-dashed border-gray-200 rounded-lg text-xs text-gray-400 hover:border-blue-300 hover:text-blue-500 transition-colors"
              >
                + レッスンを追加
              </button>
            </div>
          </div>
        ))}
      </fieldset>

      {/* ── Actions ── */}
      <div className="flex items-center gap-3 pt-4 border-t border-gray-200">
        <button
          type="submit"
          disabled={isSubmitting}
          className="
            inline-flex items-center justify-center px-6 py-2.5 rounded-lg
            bg-blue-600 text-white text-sm font-semibold
            hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
            disabled:opacity-50 disabled:cursor-not-allowed
            transition-colors duration-150
          "
          aria-label={isEdit ? "コースを更新" : "コースを作成"}
        >
          {isSubmitting ? (
            <>
              <Spinner />
              保存中...
            </>
          ) : isEdit ? (
            "コースを更新"
          ) : (
            "コースを作成"
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
