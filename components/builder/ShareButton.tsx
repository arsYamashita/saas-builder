"use client";

import { useState } from "react";

interface ShareButtonProps {
  projectName: string;
  templateKey: string;
  fileCount: number;
  durationSeconds: number;
  qualityPassed: boolean;
}

export default function ShareButton({
  projectName,
  templateKey,
  fileCount,
  durationSeconds,
  qualityPassed,
}: ShareButtonProps) {
  const [copied, setCopied] = useState(false);

  const min = Math.floor(durationSeconds / 60);
  const sec = durationSeconds % 60;
  const durationText = min > 0 ? `${min}分${sec}秒` : `${sec}秒`;
  const qualityText = qualityPassed ? "品質ゲート全パス" : "";

  const tweetText = `${projectName}をAI SaaS Builderで生成しました。${fileCount}ファイル、${durationText}で完成。${qualityText} #個人開発 #AIコーディング #SaaS開発`;

  const ogUrl = `/api/og?name=${encodeURIComponent(projectName)}&template=${encodeURIComponent(templateKey)}&files=${fileCount}&duration=${durationSeconds}&quality=${qualityPassed ? "passed" : "failed"}`;

  const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}${ogUrl}`,
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard not available
    }
  }

  return (
    <div className="flex items-center gap-2">
      <a
        href={twitterUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 px-4 py-2 bg-black text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors"
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
        X でシェア
      </a>
      <button
        onClick={handleCopy}
        className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 transition-colors"
      >
        {copied ? "コピーしました" : "リンクをコピー"}
      </button>
    </div>
  );
}
