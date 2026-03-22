"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoutButton } from "@/components/admin/logout-button";
import { cn } from "@/lib/utils/cn";
import {
  LayoutDashboard,
  FileText,
  CreditCard,
  Users,
  Tag,
  Blocks,
} from "lucide-react";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/content", label: "Contents", icon: FileText },
  { href: "/plans", label: "Plans", icon: Tag },
  { href: "/billing", label: "Billing", icon: CreditCard },
  { href: "/affiliate", label: "Affiliate", icon: Users },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 border-b bg-card/80 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-6 lg:px-8">
        {/* Logo */}
        <Link href="/dashboard" className="flex items-center gap-2 shrink-0">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Blocks className="h-3.5 w-3.5" />
          </div>
          <span className="text-sm font-semibold tracking-tight hidden sm:block">
            Admin
          </span>
        </Link>

        {/* Navigation */}
        <nav className="flex items-center gap-1 overflow-x-auto">
          {navItems.map((item) => {
            const isActive =
              pathname === item.href ||
              pathname.startsWith(item.href + "/");
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors whitespace-nowrap",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Right side */}
        <div className="ml-auto">
          <LogoutButton />
        </div>
      </div>
    </header>
  );
}
