"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { PostForm } from "@/components/domain/post-form";
import type { Category } from "@/types/database";

export default function NewPostPage() {
  const router = useRouter();

  const tenantId =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("tenantId") ?? ""
      : "";

  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!tenantId) {
      setIsLoading(false);
      return;
    }

    (async () => {
      try {
        const res = await fetch(
          `/api/admin/tenants/${tenantId}/categories`
        );
        if (res.ok) {
          const data = await res.json();
          setCategories(data.categories ?? []);
        }
      } catch {
        // Non-critical
      } finally {
        setIsLoading(false);
      }
    })();
  }, [tenantId]);

  const communityUrl = tenantId
    ? `/community?tenantId=${tenantId}`
    : "/community";

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
          <h1 className="text-2xl font-bold text-gray-900">新規投稿</h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        {/* Breadcrumb */}
        <nav aria-label="パンくずリスト" className="mb-6">
          <ol className="flex items-center gap-1.5 text-sm text-gray-400">
            <li>
              <a
                href={communityUrl}
                className="hover:text-gray-600 transition-colors"
              >
                コミュニティ
              </a>
            </li>
            <li aria-hidden="true">&gt;</li>
            <li>
              <span className="text-gray-600 font-medium">新規投稿</span>
            </li>
          </ol>
        </nav>

        {/* Tip */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
          <p className="text-sm text-amber-800">
            💡 良い投稿のコツ：具体的なタイトルをつけると、返信がもらいやすくなります。
          </p>
        </div>

        {/* Form container */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 sm:p-8">
          {isLoading ? (
            <div className="space-y-4 animate-pulse">
              <div className="h-10 bg-gray-100 rounded-lg" />
              <div className="h-10 bg-gray-100 rounded-lg" />
              <div className="h-48 bg-gray-100 rounded-lg" />
              <div className="h-10 bg-gray-100 rounded-lg w-32" />
            </div>
          ) : (
            <PostForm
              tenantId={tenantId}
              categories={categories}
              onSuccess={(postId) => {
                const qp = tenantId ? `?tenantId=${tenantId}` : "";
                router.push(`/community/${postId}${qp}`);
              }}
              onCancel={() => router.push(communityUrl)}
            />
          )}
        </div>
      </main>
    </div>
  );
}
