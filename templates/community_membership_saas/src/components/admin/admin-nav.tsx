"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { AppRole } from "@/types/database";
import { hasRequiredRole } from "@/types/database";
import {
  Home,
  MessageSquare,
  BookOpen,
  FileText,
  Users,
  Trophy,
  CreditCard,
  Tag,
  Settings,
  Folder,
  BarChart,
  Link as LinkIcon,
  Shield,
  HelpCircle,
  User,
  ClipboardCheck,
  PlusCircle,
  ChevronDown,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Badge count (e.g. pending applications) */
  badge?: number;
  /** Tooltip text shown on hover */
  tooltip?: string;
}

interface NavSection {
  label: string;
  items: NavItem[];
  /** If true, section is collapsible */
  collapsible?: boolean;
  /** Minimum role required to see this section */
  requiredRole?: AppRole;
  /** Default collapsed state */
  defaultCollapsed?: boolean;
}

interface CommunityInfo {
  name: string;
  logoUrl?: string | null;
}

interface UserInfo {
  displayName: string;
  avatarUrl?: string | null;
  level: number;
  role: AppRole;
}

interface AdminNavProps {
  community: CommunityInfo;
  user: UserInfo;
  /** Number of pending membership applications */
  pendingApplicationCount?: number;
  /** Sign-out handler */
  onSignOut: () => void;
}

// ---------------------------------------------------------------------------
// Navigation definition
// ---------------------------------------------------------------------------

function buildNavSections(pendingCount: number): NavSection[] {
  return [
    {
      label: "メイン",
      items: [
        {
          label: "ダッシュボード",
          href: "/dashboard",
          icon: Home,
          tooltip: "全体の概要を確認",
        },
        {
          label: "コミュニティ",
          href: "/community",
          icon: MessageSquare,
          tooltip: "フォーラム・投稿管理",
        },
        {
          label: "コース",
          href: "/courses",
          icon: BookOpen,
          tooltip: "学習コースの管理",
        },
        {
          label: "コンテンツ",
          href: "/contents",
          icon: FileText,
          tooltip: "コンテンツ管理",
        },
        {
          label: "メンバー",
          href: "/members",
          icon: Users,
          tooltip: "メンバー一覧と管理",
        },
        {
          label: "リーダーボード",
          href: "/leaderboard",
          icon: Trophy,
          tooltip: "ランキング・ゲーミフィケーション",
        },
        {
          label: "プラン",
          href: "/plans",
          icon: CreditCard,
          tooltip: "料金プラン管理",
        },
        {
          label: "タグ",
          href: "/tags",
          icon: Tag,
          tooltip: "タグの作成と管理",
        },
      ],
    },
    {
      label: "設定",
      collapsible: true,
      defaultCollapsed: true,
      items: [
        {
          label: "一般設定",
          href: "/settings",
          icon: Settings,
          tooltip: "コミュニティの基本設定",
        },
        {
          label: "カテゴリ管理",
          href: "/settings/categories",
          icon: Folder,
          tooltip: "投稿カテゴリの管理",
        },
        {
          label: "レベル設定",
          href: "/settings/levels",
          icon: BarChart,
          tooltip: "レベルとポイント閾値の設定",
        },
        {
          label: "招待リンク",
          href: "/settings/invites",
          icon: LinkIcon,
          tooltip: "招待リンクの作成と管理",
        },
        {
          label: "参加モード",
          href: "/settings/join-mode",
          icon: Shield,
          tooltip: "オープン / 招待制 / 申請制の切替",
        },
        {
          label: "スクリーニング質問",
          href: "/settings/questions",
          icon: HelpCircle,
          tooltip: "参加申請時の質問設定",
        },
        {
          label: "プロフィール",
          href: "/settings/profile",
          icon: User,
          tooltip: "あなたのプロフィール編集",
        },
      ],
    },
    {
      label: "管理",
      collapsible: true,
      defaultCollapsed: false,
      requiredRole: "admin",
      items: [
        {
          label: "参加申請",
          href: "/admin/applications",
          icon: ClipboardCheck,
          badge: pendingCount > 0 ? pendingCount : undefined,
          tooltip: "メンバーシップ申請の承認・却下",
        },
        {
          label: "コース管理",
          href: "/admin/courses/new",
          icon: PlusCircle,
          tooltip: "新規コースの作成",
        },
      ],
    },
  ];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Check if `pathname` matches a nav item's href */
function isActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  if (href === "/settings") return pathname === "/settings";
  return pathname.startsWith(href);
}

/** Level badge colour ramp */
function levelColor(level: number): string {
  const colors: Record<number, string> = {
    1: "bg-gray-100 text-gray-600",
    2: "bg-green-100 text-green-700",
    3: "bg-blue-100 text-blue-700",
    4: "bg-purple-100 text-purple-700",
    5: "bg-yellow-100 text-yellow-700",
    6: "bg-orange-100 text-orange-700",
    7: "bg-red-100 text-red-700",
    8: "bg-pink-100 text-pink-700",
    9: "bg-indigo-100 text-indigo-700",
  };
  return colors[level] ?? "bg-gray-100 text-gray-600";
}

// ---------------------------------------------------------------------------
// Collapsible section sub-component
// ---------------------------------------------------------------------------

function CollapsibleSection({
  section,
  pathname,
}: {
  section: NavSection;
  pathname: string;
}) {
  // Auto-expand if any child is active
  const hasActiveChild = section.items.some((item) =>
    isActive(pathname, item.href),
  );

  const [open, setOpen] = useState(
    hasActiveChild || !section.defaultCollapsed,
  );
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState<number | undefined>(
    undefined,
  );

  useEffect(() => {
    if (hasActiveChild && !open) setOpen(true);
  }, [hasActiveChild, open]);

  useEffect(() => {
    if (contentRef.current) {
      setContentHeight(contentRef.current.scrollHeight);
    }
  }, [open, section.items]);

  const toggle = useCallback(() => setOpen((prev) => !prev), []);

  return (
    <div>
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-400 hover:text-gray-600 transition-colors duration-150"
        aria-expanded={open}
      >
        <span>{section.label}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform duration-200 ${
            open ? "rotate-0" : "-rotate-90"
          }`}
        />
      </button>
      <div
        className="overflow-hidden transition-[max-height] duration-200 ease-in-out"
        style={{ maxHeight: open ? `${contentHeight ?? 999}px` : "0px" }}
      >
        <div ref={contentRef} className="space-y-0.5 pb-1">
          {section.items.map((item) => (
            <NavLink key={item.href} item={item} pathname={pathname} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Single nav link sub-component
// ---------------------------------------------------------------------------

function NavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = isActive(pathname, item.href);
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      title={item.tooltip}
      className={`
        group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium
        transition-colors duration-150
        ${
          active
            ? "bg-blue-50 text-blue-700"
            : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
        }
      `}
      aria-current={active ? "page" : undefined}
    >
      <Icon
        className={`h-4.5 w-4.5 flex-shrink-0 ${
          active ? "text-blue-600" : "text-gray-400 group-hover:text-gray-500"
        }`}
        aria-hidden="true"
      />
      <span className="flex-1 truncate">{item.label}</span>
      {item.badge != null && item.badge > 0 && (
        <span
          className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-semibold tabular-nums text-white"
          aria-label={`${item.badge}件の未処理`}
        >
          {item.badge > 99 ? "99+" : item.badge}
        </span>
      )}
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Main AdminNav component
// ---------------------------------------------------------------------------

export function AdminNav({
  community,
  user,
  pendingApplicationCount = 0,
  onSignOut,
}: AdminNavProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const sections = buildNavSections(pendingApplicationCount);

  // Close mobile nav on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Lock body scroll when mobile nav is open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  // ---- Sidebar content (shared between desktop and mobile) ----
  const sidebarContent = (
    <div className="flex h-full flex-col">
      {/* Community header */}
      <div className="flex items-center gap-3 border-b border-gray-100 px-4 py-5">
        {community.logoUrl ? (
          <img
            src={community.logoUrl}
            alt=""
            className="h-9 w-9 rounded-lg object-cover"
          />
        ) : (
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 text-sm font-bold text-white">
            {community.name.charAt(0)}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold text-gray-900">
            {community.name}
          </h2>
          <p className="text-xs text-gray-400">管理パネル</p>
        </div>
      </div>

      {/* Navigation sections */}
      <nav
        aria-label="管理ナビゲーション"
        className="flex-1 overflow-y-auto px-2 py-3 space-y-4"
      >
        {sections.map((section) => {
          // Role check
          if (
            section.requiredRole &&
            !hasRequiredRole(user.role, section.requiredRole)
          ) {
            return null;
          }

          if (section.collapsible) {
            return (
              <CollapsibleSection
                key={section.label}
                section={section}
                pathname={pathname}
              />
            );
          }

          // Non-collapsible section (main nav)
          return (
            <div key={section.label} className="space-y-0.5">
              {section.items.map((item) => (
                <NavLink key={item.href} item={item} pathname={pathname} />
              ))}
            </div>
          );
        })}
      </nav>

      {/* User info + logout */}
      <div className="border-t border-gray-100 px-3 py-4 space-y-3">
        {/* User card */}
        <div className="flex items-center gap-3 rounded-lg px-2 py-1.5">
          {user.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt=""
              className="h-8 w-8 rounded-full object-cover ring-2 ring-white"
            />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-200 text-xs font-semibold text-gray-500">
              {user.displayName.charAt(0)}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-gray-900">
              {user.displayName}
            </p>
            <div className="flex items-center gap-1.5">
              <span
                className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold ${levelColor(user.level)}`}
              >
                Lv.{user.level}
              </span>
              <span className="text-[10px] text-gray-400 capitalize">
                {user.role}
              </span>
            </div>
          </div>
        </div>

        {/* Logout */}
        <button
          type="button"
          onClick={onSignOut}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-500 hover:bg-red-50 hover:text-red-600 transition-colors duration-150"
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
          <span>ログアウト</span>
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* ── Desktop sidebar ── */}
      <aside className="hidden lg:flex lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:w-64 lg:flex-col lg:border-r lg:border-gray-200 lg:bg-white">
        {sidebarContent}
      </aside>

      {/* ── Mobile header bar ── */}
      <header className="fixed inset-x-0 top-0 z-40 flex h-14 items-center justify-between border-b border-gray-200 bg-white px-4 lg:hidden">
        <div className="flex items-center gap-2">
          {community.logoUrl ? (
            <img
              src={community.logoUrl}
              alt=""
              className="h-7 w-7 rounded-md object-cover"
            />
          ) : (
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-blue-500 to-indigo-600 text-xs font-bold text-white">
              {community.name.charAt(0)}
            </div>
          )}
          <span className="text-sm font-semibold text-gray-900 truncate max-w-[180px]">
            {community.name}
          </span>
        </div>

        <button
          type="button"
          onClick={() => setMobileOpen((prev) => !prev)}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
          aria-label={mobileOpen ? "メニューを閉じる" : "メニューを開く"}
          aria-expanded={mobileOpen}
        >
          {mobileOpen ? (
            <X className="h-5 w-5" />
          ) : (
            <Menu className="h-5 w-5" />
          )}
        </button>
      </header>

      {/* ── Mobile drawer overlay ── */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/30 backdrop-blur-sm transition-opacity"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          {/* Drawer */}
          <aside className="absolute inset-y-0 left-0 w-72 bg-white shadow-xl animate-slide-in-left">
            {sidebarContent}
          </aside>
        </div>
      )}

      {/* Spacer for mobile header height */}
      <div className="h-14 lg:hidden" aria-hidden="true" />
    </>
  );
}
