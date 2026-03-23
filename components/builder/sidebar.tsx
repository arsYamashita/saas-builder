"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  FolderKanban,
  LayoutTemplate,
  BarChart3,
  Settings,
  Zap,
  LogOut,
  ChevronLeft,
  Blocks,
  CircleHelp,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { createClient } from "@/lib/db/supabase/client";

const mainNav = [
  { href: "/projects", label: "プロジェクト", icon: FolderKanban },
  { href: "/templates", label: "テンプレート", icon: LayoutTemplate },
];

const analyticsNav = [
  { href: "/scoreboard", label: "スコアボード", icon: BarChart3 },
  { href: "/provider-scoreboard", label: "プロバイダー", icon: Zap },
];

const systemNav = [
  { href: "/settings", label: "設定", icon: Settings },
  { href: "#", label: "ヘルプ", icon: CircleHelp },
];

export function BuilderSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [user, setUser] = useState<{ email: string; displayName: string } | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        const meta = data.user.user_metadata;
        setUser({
          email: data.user.email ?? "",
          displayName:
            meta?.display_name ?? meta?.full_name ?? data.user.email ?? "",
        });
      }
    });
  }, []);

  const handleLogout = async () => {
    const res = await fetch("/api/auth/logout", { method: "POST" });
    const json = await res.json();
    router.push(json.redirectTo || "/auth/login");
    router.refresh();
  };

  const renderNavGroup = (
    items: typeof mainNav,
    label: string
  ) => (
    <div className="space-y-1">
      {!collapsed && (
        <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
          {label}
        </p>
      )}
      {items.map((item) => {
        const isActive =
          pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            title={collapsed ? item.label : undefined}
            className={cn(
              "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150",
              collapsed && "justify-center px-2",
              isActive
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            {isActive && (
              <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-primary" />
            )}
            <item.icon
              className={cn(
                "h-[18px] w-[18px] shrink-0 transition-colors",
                isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
              )}
            />
            {!collapsed && (
              <span className="truncate">{item.label}</span>
            )}
          </Link>
        );
      })}
    </div>
  );

  return (
    <aside
      className={cn(
        "flex h-screen flex-col border-r bg-sidebar-bg transition-all duration-200 ease-in-out",
        collapsed ? "w-[60px]" : "w-[240px]"
      )}
    >
      {/* Logo */}
      <div className="flex h-14 items-center justify-between border-b px-3">
        <Link
          href="/projects"
          className={cn(
            "flex items-center gap-2.5 font-semibold transition-all",
            collapsed && "justify-center"
          )}
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Blocks className="h-4 w-4" />
          </div>
          {!collapsed && (
            <span className="text-sm font-semibold tracking-tight">
              SaaS Builder
            </span>
          )}
        </Link>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className={cn(
            "flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-all hover:bg-muted hover:text-foreground",
            collapsed && "absolute -right-3 top-4 z-10 h-6 w-6 rounded-full border bg-card shadow-sm"
          )}
        >
          <ChevronLeft
            className={cn(
              "h-3.5 w-3.5 transition-transform duration-200",
              collapsed && "rotate-180"
            )}
          />
        </button>
      </div>

      {/* Quick Action */}
      <div className="px-3 pt-4">
        <Button asChild className={cn("w-full", collapsed && "px-0")}>
          <Link href="/projects/new">
            <Plus className="h-4 w-4" />
            {!collapsed && <span>新規プロジェクト</span>}
          </Link>
        </Button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-6 overflow-y-auto p-3 pt-4">
        {renderNavGroup(mainNav, "ビルド")}
        <Separator />
        {renderNavGroup(analyticsNav, "アナリティクス")}
        <Separator />
        {renderNavGroup(systemNav, "システム")}
      </nav>

      {/* Footer */}
      <div className="border-t p-3">
        <div
          className={cn(
            "flex items-center gap-3 rounded-lg p-2 transition-colors",
            collapsed && "justify-center p-1"
          )}
        >
          <Avatar name={user?.displayName || "U"} size="sm" />
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="truncate text-sm font-medium leading-tight">
                {user?.displayName || "読み込み中..."}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {user?.email || ""}
              </p>
            </div>
          )}
          {!collapsed && (
            <button
              onClick={handleLogout}
              title="ログアウト"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
