"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import LivePreview from "@/components/builder/LivePreview";

export default function DeployPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [previewOpen, setPreviewOpen] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  async function handleDownload() {
    setDownloading(true);
    setDownloadError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/download`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Download failed (${res.status})`);
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename="(.+)"/);
      const filename = match?.[1] ?? "project.zip";

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setDownloadError(
        err instanceof Error ? err.message : "ダウンロードに失敗しました",
      );
    } finally {
      setDownloading(false);
    }
  }

  return (
    <main className="max-w-5xl mx-auto p-6 space-y-6">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Deploy &amp; Preview</h1>
          <p className="text-sm text-gray-500">
            生成されたSaaSアプリケーションのプレビューとデプロイ
          </p>
        </div>
        <button
          onClick={() => setPreviewOpen(!previewOpen)}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            previewOpen
              ? "bg-blue-600 text-white"
              : "bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200"
          }`}
        >
          <span>{previewOpen ? "Preview を閉じる" : "Live Preview"}</span>
        </button>
      </header>

      {/* Deploy Options */}
      <section className="border rounded-xl p-6 space-y-4">
        <h2 className="text-lg font-semibold">デプロイオプション</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Vercel Deploy */}
          <div className="border rounded-lg p-4 opacity-60">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-2xl">▲</span>
              <h3 className="font-medium">Vercel にデプロイ</h3>
            </div>
            <p className="text-sm text-gray-500">
              ワンクリックで Vercel にデプロイ。自動SSL、CDN、プレビューURL
              発行。
            </p>
            <span className="inline-block mt-3 text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded">
              Coming Soon
            </span>
          </div>

          {/* ZIP Download */}
          <div className="border rounded-lg p-4 hover:shadow-md transition-shadow">
            <div className="flex items-center gap-3 mb-2">
              <svg
                className="w-6 h-6 text-blue-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              <h3 className="font-medium">ZIP ダウンロード</h3>
            </div>
            <p className="text-sm text-gray-500 mb-3">
              生成されたプロジェクトを ZIP
              でダウンロード。セットアップガイド付き。
            </p>
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {downloading ? (
                <>
                  <svg
                    className="animate-spin h-4 w-4"
                    viewBox="0 0 24 24"
                    fill="none"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  ダウンロード中...
                </>
              ) : (
                "ZIP をダウンロード"
              )}
            </button>
            {downloadError && (
              <p className="mt-2 text-sm text-red-600">{downloadError}</p>
            )}
          </div>
        </div>
      </section>

      {/* Live Preview */}
      <LivePreview
        projectId={projectId}
        isOpen={previewOpen}
        onToggle={() => setPreviewOpen(!previewOpen)}
      />
    </main>
  );
}
