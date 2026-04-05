import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NotificationBell } from "./NotificationBell";

interface NavItem {
  href: string;
  label: string;
  icon?: React.ReactNode;
}

interface DashboardLayoutProps {
  children: React.ReactNode;
  nav?: NavItem[];
  tenantName?: string;
}

const DEFAULT_NAV: NavItem[] = [
  { href: "/dashboard", label: "ダッシュボード" },
  { href: "/dashboard/projects", label: "プロジェクト" },
  { href: "/dashboard/billing", label: "プラン・課金" },
  { href: "/dashboard/settings", label: "設定" },
];

/** Sidebar navigation item */
function SidebarItem({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      className={[
        "flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors",
        active
          ? "bg-indigo-50 text-indigo-700"
          : "text-gray-600 hover:bg-gray-100 hover:text-gray-900",
      ].join(" ")}
    >
      {item.icon && <span className="w-4 h-4">{item.icon}</span>}
      {item.label}
    </Link>
  );
}

/** Reusable dashboard layout with sidebar.
 *  Customise nav items and inject slot content via children.
 */
export function DashboardLayout({
  children,
  nav = DEFAULT_NAV,
  tenantName,
}: DashboardLayoutProps) {
  const pathname = usePathname() ?? "";

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Sidebar */}
      <aside className="hidden md:flex md:w-56 flex-col border-r border-gray-200 bg-white">
        <div className="flex h-14 items-center border-b border-gray-200 px-4">
          <span className="text-sm font-semibold text-gray-900 truncate">
            {tenantName ?? "SaaS Builder"}
          </span>
        </div>
        <nav className="flex-1 space-y-1 px-2 py-4">
          {nav.map((item) => (
            <SidebarItem
              key={item.href}
              item={item}
              active={pathname.startsWith(item.href)}
            />
          ))}
        </nav>
      </aside>

      {/* Main content area — accepts slot children */}
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}

/** Top navigation bar for pages without a sidebar (mobile or minimal layout) */
export function DashboardTopNav({
  tenantName,
  actions,
}: {
  tenantName?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="h-14 flex items-center justify-between border-b border-gray-200 bg-white px-4">
      <span className="text-sm font-semibold text-gray-900">
        {tenantName ?? "SaaS Builder"}
      </span>
      <div className="flex items-center gap-2">
        <NotificationBell />
        {actions}
      </div>
    </header>
  );
}

/** Usage summary card — drop inside DashboardLayout children */
export function UsageSummaryCard({
  label,
  value,
  max,
  unit,
}: {
  label: string;
  value: number;
  max?: number;
  unit?: string;
}) {
  const pct = max ? Math.min((value / max) * 100, 100) : null;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-gray-900">
        {value.toLocaleString()}
        {unit && <span className="ml-1 text-sm font-normal text-gray-500">{unit}</span>}
      </p>
      {pct !== null && (
        <div className="mt-2 h-1.5 w-full rounded-full bg-gray-100">
          <div
            className="h-1.5 rounded-full bg-indigo-500 transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  );
}
