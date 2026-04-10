"use client";

import { useMemo } from "react";
import { LevelBadge } from "@/components/domain/level-badge";
import type { AppRole, Tag } from "@/types/database";

// ─── Types ───

interface MemberProfile {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  headline: string | null;
  bio: string | null;
  social_links: Record<string, string> | null;
  role: AppRole;
  joined_at: string;
  // Gamification
  level: number;
  level_name: string;
  total_points: number;
  next_level_name: string | null;
  points_to_next_level: number | null;
  next_level_min_points: number | null;
  // Activity
  posts_count: number;
  comments_count: number;
  likes_received: number;
  // Tags & plan
  tags: Pick<Tag, "id" | "name" | "color">[];
  plan_name: string | null;
}

interface MemberProfileCardProps {
  member: MemberProfile;
  /** Is this the currently authenticated user's own profile? */
  isOwnProfile?: boolean;
  /** Called when "edit profile" button is clicked */
  onEditProfile?: () => void;
}

// ─── Helpers ───

function getInitials(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

function formatJoinDate(dateStr: string): string {
  const d = new Date(dateStr);
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const year = d.getFullYear();
  return `${year}年${month}月${day}日に参加`;
}

const ROLE_LABELS: Record<AppRole, { label: string; color: string }> = {
  owner: { label: "オーナー", color: "bg-amber-100 text-amber-800 ring-amber-300" },
  admin: { label: "管理者", color: "bg-red-50 text-red-700 ring-red-200" },
  editor: { label: "エディター", color: "bg-purple-50 text-purple-700 ring-purple-200" },
  member: { label: "メンバー", color: "bg-gray-100 text-gray-600 ring-gray-200" },
};

const SOCIAL_ICONS: Record<string, { label: string; icon: JSX.Element }> = {
  twitter: {
    label: "X (Twitter)",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    ),
  },
  instagram: {
    label: "Instagram",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
      </svg>
    ),
  },
  website: {
    label: "Webサイト",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
        <path fillRule="evenodd" d="M4.25 5.5a.75.75 0 00-.75.75v8.5c0 .414.336.75.75.75h8.5a.75.75 0 00.75-.75v-4a.75.75 0 011.5 0v4A2.25 2.25 0 0112.75 17h-8.5A2.25 2.25 0 012 14.75v-8.5A2.25 2.25 0 014.25 4h5a.75.75 0 010 1.5h-5zm4.943.25a.75.75 0 01.75-.75h6a.75.75 0 01.75.75v6a.75.75 0 01-1.5 0V6.81l-6.22 6.22a.75.75 0 11-1.06-1.06l6.22-6.22H11.94a.75.75 0 01-.75-.75z" clipRule="evenodd" />
      </svg>
    ),
  },
  youtube: {
    label: "YouTube",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
        <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
      </svg>
    ),
  },
  linkedin: {
    label: "LinkedIn",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
      </svg>
    ),
  },
};

// ─── Component ───

export function MemberProfileCard({
  member,
  isOwnProfile = false,
  onEditProfile,
}: MemberProfileCardProps) {
  const roleInfo = ROLE_LABELS[member.role];
  const joinDateText = useMemo(
    () => formatJoinDate(member.joined_at),
    [member.joined_at]
  );
  const initials = getInitials(member.display_name);

  const socialEntries = useMemo(() => {
    if (!member.social_links) return [];
    return Object.entries(member.social_links).filter(
      ([, url]) => url && url.trim().length > 0
    );
  }, [member.social_links]);

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Header gradient */}
      <div className="h-24 sm:h-32 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-600" />

      {/* Profile content */}
      <div className="px-5 sm:px-6 pb-6">
        {/* Avatar — overlapping the header */}
        <div className="-mt-12 sm:-mt-14 mb-4 flex items-end justify-between">
          <div className="relative">
            {member.avatar_url ? (
              <img
                src={member.avatar_url}
                alt={`${member.display_name ?? "メンバー"}のアバター`}
                className="w-20 h-20 sm:w-24 sm:h-24 rounded-full object-cover border-4 border-white shadow-md"
              />
            ) : (
              <div
                className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-2xl sm:text-3xl font-bold border-4 border-white shadow-md"
                aria-hidden="true"
              >
                {initials}
              </div>
            )}
          </div>

          {/* Edit button (own profile only) */}
          {isOwnProfile && onEditProfile && (
            <button
              type="button"
              onClick={onEditProfile}
              className="
                inline-flex items-center gap-1.5 px-4 py-2 rounded-lg
                border border-gray-300 bg-white text-sm font-medium text-gray-700
                hover:bg-gray-50 hover:border-gray-400
                focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
                transition-all duration-150
              "
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="w-4 h-4"
                aria-hidden="true"
              >
                <path d="M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z" />
              </svg>
              プロフィールを編集
            </button>
          )}
        </div>

        {/* Name + role */}
        <div className="mb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-xl font-bold text-gray-900">
              {member.display_name ?? "名前未設定"}
            </h2>
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ring-1 ${roleInfo.color}`}
            >
              {roleInfo.label}
            </span>
          </div>
          {member.headline && (
            <p className="text-sm text-gray-500 mt-0.5">{member.headline}</p>
          )}
        </div>

        {/* Level + Points */}
        <div className="flex items-center gap-4 mb-4 p-3 rounded-lg bg-gray-50">
          <LevelBadge
            level={member.level}
            name={member.level_name}
            size="md"
            currentPoints={member.total_points}
            nextLevelPoints={member.next_level_min_points}
            nextLevelName={member.next_level_name}
          />
          <div className="border-l border-gray-200 pl-4">
            <div className="text-lg font-bold text-gray-900 tabular-nums">
              {member.total_points.toLocaleString()}
              <span className="text-xs font-normal text-gray-400 ml-0.5">pt</span>
            </div>
            {member.points_to_next_level !== null && member.next_level_name && (
              <p className="text-[11px] text-gray-400">
                次のレベル「{member.next_level_name}」まであと{member.points_to_next_level.toLocaleString()}pt
              </p>
            )}
          </div>
        </div>

        {/* Plan badge */}
        {member.plan_name && (
          <div className="mb-4">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 text-xs font-semibold ring-1 ring-indigo-200">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="w-3.5 h-3.5"
                aria-hidden="true"
              >
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
              </svg>
              {member.plan_name}
            </span>
          </div>
        )}

        {/* Bio */}
        {member.bio && (
          <p className="text-sm text-gray-700 leading-relaxed mb-4 whitespace-pre-wrap">
            {member.bio}
          </p>
        )}

        {/* Activity stats */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="text-center p-3 rounded-lg bg-gray-50">
            <div className="text-lg font-bold text-gray-900 tabular-nums">
              {member.posts_count.toLocaleString()}
            </div>
            <div className="text-[11px] text-gray-500 mt-0.5">投稿</div>
          </div>
          <div className="text-center p-3 rounded-lg bg-gray-50">
            <div className="text-lg font-bold text-gray-900 tabular-nums">
              {member.comments_count.toLocaleString()}
            </div>
            <div className="text-[11px] text-gray-500 mt-0.5">コメント</div>
          </div>
          <div className="text-center p-3 rounded-lg bg-gray-50">
            <div className="text-lg font-bold text-gray-900 tabular-nums">
              {member.likes_received.toLocaleString()}
            </div>
            <div className="text-[11px] text-gray-500 mt-0.5">もらったいいね</div>
          </div>
        </div>

        {/* Tags */}
        {member.tags.length > 0 && (
          <div className="mb-4">
            <div className="flex flex-wrap gap-1.5">
              {member.tags.map((tag) => (
                <span
                  key={tag.id}
                  className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium"
                  style={{
                    backgroundColor: tag.color
                      ? `${tag.color}20`
                      : "#f3f4f6",
                    color: tag.color ?? "#4b5563",
                  }}
                >
                  {tag.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Social links */}
        {socialEntries.length > 0 && (
          <div className="flex items-center gap-2 mb-4">
            {socialEntries.map(([platform, url]) => {
              const social = SOCIAL_ICONS[platform];
              return (
                <a
                  key={platform}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="
                    inline-flex items-center justify-center w-9 h-9 rounded-lg
                    bg-gray-100 text-gray-500
                    hover:bg-gray-200 hover:text-gray-700
                    transition-colors duration-150
                  "
                  aria-label={social?.label ?? platform}
                  title={social?.label ?? platform}
                >
                  {social?.icon ?? (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      className="w-4 h-4"
                    >
                      <path fillRule="evenodd" d="M4.25 5.5a.75.75 0 00-.75.75v8.5c0 .414.336.75.75.75h8.5a.75.75 0 00.75-.75v-4a.75.75 0 011.5 0v4A2.25 2.25 0 0112.75 17h-8.5A2.25 2.25 0 012 14.75v-8.5A2.25 2.25 0 014.25 4h5a.75.75 0 010 1.5h-5zm4.943.25a.75.75 0 01.75-.75h6a.75.75 0 01.75.75v6a.75.75 0 01-1.5 0V6.81l-6.22 6.22a.75.75 0 11-1.06-1.06l6.22-6.22H11.94a.75.75 0 01-.75-.75z" clipRule="evenodd" />
                    </svg>
                  )}
                </a>
              );
            })}
          </div>
        )}

        {/* Join date */}
        <div className="flex items-center gap-1.5 text-xs text-gray-400">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="w-3.5 h-3.5"
            aria-hidden="true"
          >
            <path fillRule="evenodd" d="M5.75 2a.75.75 0 01.75.75V4h7V2.75a.75.75 0 011.5 0V4h.25A2.75 2.75 0 0118 6.75v8.5A2.75 2.75 0 0115.25 18H4.75A2.75 2.75 0 012 15.25v-8.5A2.75 2.75 0 014.75 4H5V2.75A.75.75 0 015.75 2zm-1 5.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h10.5c.69 0 1.25-.56 1.25-1.25v-6.5c0-.69-.56-1.25-1.25-1.25H4.75z" clipRule="evenodd" />
          </svg>
          <time dateTime={member.joined_at}>{joinDateText}</time>
        </div>
      </div>
    </div>
  );
}

// ─── Skeleton loader ───

export function MemberProfileCardSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden animate-pulse">
      <div className="h-24 sm:h-32 bg-gray-200" />
      <div className="px-5 sm:px-6 pb-6">
        <div className="-mt-12 sm:-mt-14 mb-4">
          <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-gray-300 border-4 border-white" />
        </div>
        <div className="space-y-3">
          <div className="h-6 bg-gray-200 rounded w-40" />
          <div className="h-4 bg-gray-100 rounded w-56" />
          <div className="flex gap-4 p-3 rounded-lg bg-gray-50">
            <div className="h-8 bg-gray-200 rounded w-20" />
            <div className="h-8 bg-gray-200 rounded w-24" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="h-16 bg-gray-100 rounded-lg" />
            <div className="h-16 bg-gray-100 rounded-lg" />
            <div className="h-16 bg-gray-100 rounded-lg" />
          </div>
        </div>
      </div>
    </div>
  );
}
