"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import type { User } from "@/types/database";

const BIO_MAX_LENGTH = 2000;

interface SocialLinks {
  twitter: string;
  instagram: string;
  website: string;
  [key: string]: string;
}

const SOCIAL_FIELDS: { key: keyof SocialLinks; label: string; placeholder: string }[] = [
  { key: "twitter", label: "Twitter / X", placeholder: "https://x.com/username" },
  { key: "instagram", label: "Instagram", placeholder: "https://instagram.com/username" },
  { key: "website", label: "ウェブサイト", placeholder: "https://example.com" },
];

function getInitials(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

export default function ProfileSettingsPage() {
  const tenantId =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("tenantId") ?? ""
      : "";

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Form state
  const [displayName, setDisplayName] = useState("");
  const [headline, setHeadline] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [socialLinks, setSocialLinks] = useState<SocialLinks>({
    twitter: "",
    instagram: "",
    website: "",
  });

  const [showPreview, setShowPreview] = useState(false);

  // Fetch profile
  useEffect(() => {
    (async () => {
      setIsLoading(true);
      try {
        // Fetch current user profile
        const res = await fetch("/api/me/profile");
        if (res.ok) {
          const data = await res.json();
          const user = data.user as User | null;
          if (user) {
            setDisplayName(user.display_name ?? "");
            setHeadline(user.headline ?? "");
            setBio(user.bio ?? "");
            setAvatarUrl(user.avatar_url);
            setSocialLinks({
              twitter: user.social_links?.twitter ?? "",
              instagram: user.social_links?.instagram ?? "",
              website: user.social_links?.website ?? "",
              ...(user.social_links ?? {}),
            });
          }
        }
      } catch {
        setError("プロフィールの読み込みに失敗しました");
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const bioLength = useMemo(() => bio.length, [bio]);

  const handleSocialChange = useCallback(
    (key: string, value: string) => {
      setSocialLinks((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  const handleSave = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      setIsSaving(true);
      setError(null);
      setSuccessMessage(null);

      try {
        // Filter out empty social links
        const filteredSocials: Record<string, string> = {};
        for (const [key, value] of Object.entries(socialLinks)) {
          if (value.trim()) {
            filteredSocials[key] = value.trim();
          }
        }

        const payload = {
          display_name: displayName.trim() || null,
          headline: headline.trim() || null,
          bio: bio.trim() || null,
          social_links:
            Object.keys(filteredSocials).length > 0
              ? filteredSocials
              : null,
        };

        const res = await fetch("/api/me/profile", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(data?.error ?? "プロフィールの保存に失敗しました");
        }

        setSuccessMessage("プロフィールを更新しました");
        setTimeout(() => setSuccessMessage(null), 3000);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "予期しないエラーが発生しました"
        );
      } finally {
        setIsSaving(false);
      }
    },
    [displayName, headline, bio, socialLinks]
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white border-b border-gray-200">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
            <div className="h-7 bg-gray-200 rounded w-40 animate-pulse" />
            <div className="h-4 bg-gray-100 rounded w-64 mt-2 animate-pulse" />
          </div>
        </header>
        <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
          <div className="bg-white rounded-xl border border-gray-200 p-6 animate-pulse space-y-6">
            <div className="flex items-center gap-4">
              <div className="w-20 h-20 bg-gray-200 rounded-full" />
              <div className="space-y-2">
                <div className="h-4 bg-gray-200 rounded w-32" />
                <div className="h-3 bg-gray-100 rounded w-48" />
              </div>
            </div>
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="space-y-2">
                <div className="h-4 bg-gray-200 rounded w-24" />
                <div className="h-10 bg-gray-100 rounded" />
              </div>
            ))}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
          <h1 className="text-2xl font-bold text-gray-900">
            プロフィール設定
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            あなたのプロフィールを充実させましょう
          </p>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        {error && (
          <div
            role="alert"
            className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 mb-6"
          >
            {error}
          </div>
        )}

        {successMessage && (
          <div
            role="status"
            className="p-3 rounded-lg bg-green-50 border border-green-200 text-sm text-green-700 mb-6"
          >
            {successMessage}
          </div>
        )}

        <div className="flex flex-col lg:flex-row gap-8">
          {/* Form */}
          <div className="flex-1">
            <form
              onSubmit={handleSave}
              className="bg-white rounded-xl border border-gray-200 p-6 space-y-6"
            >
              {/* Avatar */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  アバター画像
                </label>
                <div className="flex items-center gap-4">
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt="現在のアバター"
                      className="w-20 h-20 rounded-full object-cover"
                    />
                  ) : (
                    <div
                      className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-xl font-bold"
                      aria-hidden="true"
                    >
                      {getInitials(displayName)}
                    </div>
                  )}
                  <div>
                    <button
                      type="button"
                      className="
                        inline-flex items-center px-4 py-2 rounded-lg
                        border border-gray-200 text-sm font-medium text-gray-700
                        hover:bg-gray-50 transition-colors
                      "
                      onClick={() => {
                        // Placeholder for file upload
                        alert("アバター画像のアップロード機能は準備中です");
                      }}
                    >
                      アバター画像をアップロード
                    </button>
                    <p className="text-xs text-gray-400 mt-1">
                      JPG, PNG, GIF / 最大 2MB
                    </p>
                  </div>
                </div>
              </div>

              {/* Display name */}
              <div>
                <label
                  htmlFor="profile-name"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  表示名
                </label>
                <input
                  id="profile-name"
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="山田 太郎"
                  maxLength={50}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 placeholder-gray-400"
                  aria-label="表示名"
                />
              </div>

              {/* Headline */}
              <div>
                <label
                  htmlFor="profile-headline"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  ひとことプロフィール
                </label>
                <input
                  id="profile-headline"
                  type="text"
                  value={headline}
                  onChange={(e) => setHeadline(e.target.value)}
                  placeholder="例: フリーランスデザイナー / UIが好き"
                  maxLength={100}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 placeholder-gray-400"
                  aria-label="ひとことプロフィール"
                />
                <p className="text-xs text-gray-400 mt-1">
                  プロフィールカードに表示される短い自己紹介
                </p>
              </div>

              {/* Bio */}
              <div>
                <label
                  htmlFor="profile-bio"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  自己紹介
                </label>
                <textarea
                  id="profile-bio"
                  value={bio}
                  onChange={(e) => {
                    if (e.target.value.length <= BIO_MAX_LENGTH) {
                      setBio(e.target.value);
                    }
                  }}
                  placeholder="自己紹介を書いてください（Markdown対応）"
                  rows={6}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 placeholder-gray-400"
                  aria-label="自己紹介"
                  aria-describedby="bio-counter"
                />
                <div
                  id="bio-counter"
                  className="flex justify-end mt-1"
                >
                  <span
                    className={`text-xs tabular-nums ${
                      bioLength > BIO_MAX_LENGTH * 0.9
                        ? "text-amber-500"
                        : "text-gray-400"
                    }`}
                  >
                    {bioLength} / {BIO_MAX_LENGTH}
                  </span>
                </div>
              </div>

              {/* Social links */}
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-3">
                  ソーシャルリンク
                </h3>
                <div className="space-y-3">
                  {SOCIAL_FIELDS.map((field) => (
                    <div key={field.key}>
                      <label
                        htmlFor={`social-${field.key}`}
                        className="block text-xs font-medium text-gray-500 mb-1"
                      >
                        {field.label}
                      </label>
                      <input
                        id={`social-${field.key}`}
                        type="url"
                        value={socialLinks[field.key] ?? ""}
                        onChange={(e) =>
                          handleSocialChange(field.key, e.target.value)
                        }
                        placeholder={field.placeholder}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 placeholder-gray-400"
                        aria-label={field.label}
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Submit */}
              <div className="pt-2 flex items-center gap-3">
                <button
                  type="submit"
                  disabled={isSaving}
                  className="
                    inline-flex items-center gap-2 px-6 py-2.5 rounded-lg
                    bg-blue-600 text-white text-sm font-semibold
                    hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed
                    focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
                    transition-colors
                  "
                >
                  {isSaving ? (
                    <>
                      <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      保存中...
                    </>
                  ) : (
                    "プロフィールを保存"
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setShowPreview((p) => !p)}
                  className="px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors lg:hidden"
                >
                  {showPreview ? "プレビューを閉じる" : "プレビュー"}
                </button>
              </div>
            </form>
          </div>

          {/* Preview - always visible on desktop, toggleable on mobile */}
          <div
            className={`lg:w-80 flex-shrink-0 ${
              showPreview ? "block" : "hidden lg:block"
            }`}
          >
            <div className="lg:sticky lg:top-6">
              <h3 className="text-sm font-medium text-gray-500 mb-3">
                プレビュー
              </h3>
              <div className="bg-white rounded-xl border border-gray-200 p-6 text-center">
                {/* Avatar */}
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt="アバタープレビュー"
                    className="w-20 h-20 rounded-full object-cover mx-auto mb-4"
                  />
                ) : (
                  <div
                    className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-xl font-bold mx-auto mb-4"
                    aria-hidden="true"
                  >
                    {getInitials(displayName)}
                  </div>
                )}

                {/* Name */}
                <p className="text-lg font-bold text-gray-900">
                  {displayName || "名前未設定"}
                </p>

                {/* Headline */}
                {headline && (
                  <p className="text-sm text-gray-500 mt-0.5">
                    {headline}
                  </p>
                )}

                {/* Bio */}
                {bio && (
                  <p className="text-sm text-gray-600 mt-4 text-left leading-relaxed whitespace-pre-wrap">
                    {bio}
                  </p>
                )}

                {/* Social links */}
                {Object.entries(socialLinks).some(
                  ([, v]) => v.trim()
                ) && (
                  <div className="flex items-center justify-center gap-3 mt-4 pt-4 border-t border-gray-100">
                    {socialLinks.twitter && (
                      <a
                        href={socialLinks.twitter}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-gray-400 hover:text-gray-600 transition-colors"
                        aria-label="Twitter"
                      >
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                        </svg>
                      </a>
                    )}
                    {socialLinks.instagram && (
                      <a
                        href={socialLinks.instagram}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-gray-400 hover:text-gray-600 transition-colors"
                        aria-label="Instagram"
                      >
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
                        </svg>
                      </a>
                    )}
                    {socialLinks.website && (
                      <a
                        href={socialLinks.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-gray-400 hover:text-gray-600 transition-colors"
                        aria-label="ウェブサイト"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                          <path d="M12.232 4.232a2.5 2.5 0 013.536 3.536l-1.225 1.224a.75.75 0 001.061 1.06l1.224-1.224a4 4 0 00-5.656-5.656l-3 3a4 4 0 00.225 5.865.75.75 0 00.977-1.138 2.5 2.5 0 01-.142-3.667l3-3z" />
                          <path d="M11.603 7.963a.75.75 0 00-.977 1.138 2.5 2.5 0 01.142 3.667l-3 3a2.5 2.5 0 01-3.536-3.536l1.225-1.224a.75.75 0 00-1.061-1.06l-1.224 1.224a4 4 0 105.656 5.656l3-3a4 4 0 00-.225-5.865z" />
                        </svg>
                      </a>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
