import { AdminNav } from "@/components/admin/admin-nav";

export default function GeneratedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="max-w-7xl mx-auto p-6">
      <AdminNav />
      {children}
    </div>
  );
}
