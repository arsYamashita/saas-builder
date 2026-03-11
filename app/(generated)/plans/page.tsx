import Link from "next/link";
import { createAdminClient } from "@/lib/db/supabase/admin";
import { requireTenantRole } from "@/lib/rbac/guards";
import { DeleteButton } from "@/components/domain/delete-button";

export default async function PlansListPage() {
  const membership = await requireTenantRole("admin");
  const supabase = createAdminClient();

  const { data: plans, error } = await supabase
    .from("membership_plans")
    .select("*")
    .eq("tenant_id", membership.tenant_id)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (
    <main className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Plans</h1>
        <Link
          href="/plans/new"
          className="rounded bg-black text-white px-4 py-2"
        >
          New Plan
        </Link>
      </div>

      <div className="border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-4 py-3">Name</th>
              <th className="text-left px-4 py-3">Price ID</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-left px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {plans?.map((plan) => (
              <tr key={plan.id} className="border-t">
                <td className="px-4 py-3">{plan.name}</td>
                <td className="px-4 py-3">{plan.price_id || "-"}</td>
                <td className="px-4 py-3">{plan.status}</td>
                <td className="px-4 py-3 flex gap-3">
                  <Link
                    href={`/plans/${plan.id}/edit`}
                    className="underline"
                  >
                    Edit
                  </Link>
                  <DeleteButton
                    endpoint={`/api/domain/membership-plans/${plan.id}`}
                    confirmMessage={`「${plan.name}」を削除しますか？`}
                  />
                </td>
              </tr>
            ))}

            {plans?.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-gray-500">
                  プランがまだありません
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
