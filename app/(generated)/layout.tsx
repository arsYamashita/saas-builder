import { AdminNav } from "@/components/admin/admin-nav";

export default function GeneratedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <AdminNav />
      <div className="mx-auto max-w-7xl px-6 py-6 lg:px-8">{children}</div>
    </div>
  );
}
