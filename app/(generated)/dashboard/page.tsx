import { requireCurrentUser } from "@/lib/auth/current-user";
import { getCurrentTenantForUser } from "@/lib/tenant/current-tenant";

export default async function DashboardPage() {
  const user = await requireCurrentUser();
  const membership = await getCurrentTenantForUser();

  return (
    <main className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      <div className="border rounded-xl p-4">
        <p className="text-sm text-gray-500">Current User</p>
        <pre className="text-xs bg-gray-50 p-3 rounded mt-2 overflow-auto">
          {JSON.stringify(user, null, 2)}
        </pre>
      </div>

      <div className="border rounded-xl p-4">
        <p className="text-sm text-gray-500">Current Tenant Membership</p>
        <pre className="text-xs bg-gray-50 p-3 rounded mt-2 overflow-auto">
          {JSON.stringify(membership, null, 2)}
        </pre>
      </div>
    </main>
  );
}
