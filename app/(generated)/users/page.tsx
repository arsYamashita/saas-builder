export const dynamic = "force-dynamic";

import { createAdminClient } from "@/lib/db/supabase/admin";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Users as UsersIcon } from "lucide-react";

export default async function UsersPage() {
  const supabase = createAdminClient();

  const { data: tenantUsers, error } = await supabase
    .from("tenant_users")
    .select(`
      id,
      role,
      status,
      joined_at,
      users ( id, email, display_name )
    `)
    .order("joined_at", { ascending: false });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Users</h1>
        <p className="text-sm text-muted-foreground">
          Manage team members and their roles.
        </p>
      </div>

      {error ? (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-sm text-destructive">
              Failed to load users. Please try again later.
            </p>
          </CardContent>
        </Card>
      ) : !tenantUsers || tenantUsers.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <UsersIcon className="mb-4 h-12 w-12 text-muted-foreground/50" />
            <h2 className="text-lg font-semibold">No team members</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Team members will appear here after they join.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Team Members ({tenantUsers.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-3 pr-4 font-medium">Name</th>
                    <th className="pb-3 pr-4 font-medium">Email</th>
                    <th className="pb-3 pr-4 font-medium">Role</th>
                    <th className="pb-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {tenantUsers.map((tu: any) => {
                    const user = tu.users;
                    return (
                      <tr
                        key={tu.id}
                        className="border-b last:border-0 hover:bg-muted/50"
                      >
                        <td className="py-3 pr-4 font-medium">
                          {user?.display_name || "—"}
                        </td>
                        <td className="py-3 pr-4 text-muted-foreground">
                          {user?.email || "—"}
                        </td>
                        <td className="py-3 pr-4">
                          <Badge
                            variant={
                              tu.role === "owner"
                                ? "default"
                                : tu.role === "admin"
                                ? "secondary"
                                : "outline"
                            }
                          >
                            {tu.role}
                          </Badge>
                        </td>
                        <td className="py-3">
                          <Badge
                            variant={
                              tu.status === "active" ? "success" : "warning"
                            }
                          >
                            {tu.status || "active"}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
