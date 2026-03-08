import Link from "next/link";
import { createAdminClient } from "@/lib/db/supabase/admin";
import { requireTenantRole } from "@/lib/rbac/guards";

export default async function ContentListPage() {
  const membership = await requireTenantRole("admin");
  const supabase = createAdminClient();

  const { data: contents, error } = await supabase
    .from("contents")
    .select("*")
    .eq("tenant_id", membership.tenant_id)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (
    <main className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Contents</h1>
        <Link
          href="/content/new"
          className="rounded bg-black text-white px-4 py-2"
        >
          New Content
        </Link>
      </div>

      <div className="border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-4 py-3">Title</th>
              <th className="text-left px-4 py-3">Type</th>
              <th className="text-left px-4 py-3">Visibility</th>
              <th className="text-left px-4 py-3">Published</th>
              <th className="text-left px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {contents?.map((content) => (
              <tr key={content.id} className="border-t">
                <td className="px-4 py-3">{content.title}</td>
                <td className="px-4 py-3">{content.content_type}</td>
                <td className="px-4 py-3">{content.visibility}</td>
                <td className="px-4 py-3">
                  {content.published ? "true" : "false"}
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={`/content/${content.id}/edit`}
                    className="underline"
                  >
                    Edit
                  </Link>
                </td>
              </tr>
            ))}

            {contents?.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-gray-500">
                  コンテンツがまだありません
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
