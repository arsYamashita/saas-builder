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
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { useRouter } from "next/navigation";

const navItems = [
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/templates", label: "Templates", icon: LayoutTemplate },
  { href: "/scoreboard", label: "Scoreboard", icon: BarChart3 },
  { href: "/provider-scoreboard", label: "Providers", icon: Zap },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function BuilderSidebar() {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    const res = await fetch("/api/auth/logout", { method: "POST" });
    const json = await res.json();
    router.push(json.redirectTo || "/auth/login");
    router.refresh();
  };

  return (
    <aside className="flex h-screen w-56 flex-col border-r bg-card">
      <div className="flex h-14 items-center border-b px-4">
        <Link href="/projects" className="flex items-center gap-2 font-semibold">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground text-xs font-bold">
            SB
          </div>
          <span>SaaS Builder</span>
        </Link>
      </div>

      <nav className="flex-1 space-y-1 p-3">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t p-3">
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          <LogOut className="h-4 w-4" />
          Logout
        </button>
      </div>
    </aside>
  );
}
