"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { CourseForm } from "@/components/domain/course-form";

/**
 * Admin page: Create a new course.
 *
 * Guard: admin+ role required (enforced by API routes).
 * tenantId is read from query params for now.
 */
export default function AdminCourseNewPage() {
  const router = useRouter();

  const tenantId =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("tenantId") ?? ""
      : "";

  const handleSuccess = useCallback(
    (courseId: string) => {
      const params = tenantId ? `?tenantId=${tenantId}` : "";
      router.push(`/admin/courses/${courseId}/edit${params}`);
    },
    [router, tenantId]
  );

  const handleCancel = useCallback(() => {
    router.back();
  }, [router]);

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
            <span className="text-gray-600 font-medium">新規作成</span>
          </nav>

          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            新しいコースを作成
          </h1>
          <p className="text-sm text-gray-500 leading-relaxed">
            モジュールとレッスンを追加して、体系的な学習コンテンツを構築しましょう
          </p>
        </div>
      </header>

      {/* Form */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <div className="bg-white rounded-xl border border-gray-200 p-6 sm:p-8">
          <CourseForm
            tenantId={tenantId}
            onSuccess={handleSuccess}
            onCancel={handleCancel}
          />
        </div>
      </div>
    </div>
  );
}
