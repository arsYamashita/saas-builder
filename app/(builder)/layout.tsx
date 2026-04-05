import { BuilderSidebar } from "@/components/builder/sidebar";
import { NotificationBell } from "@/components/dashboard/NotificationBell";

export default function BuilderLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <BuilderSidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-12 items-center justify-end border-b bg-white px-4">
          <NotificationBell />
        </header>
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-6xl px-6 py-8 lg:px-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
