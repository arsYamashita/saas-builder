export const dynamic = "force-dynamic";

import { createAdminClient } from "@/lib/db/supabase/admin";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Avatar } from "@/components/ui/avatar";
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
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Users"
        description="Manage team members and their roles."
      />

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
          <EmptyState
            icon={UsersIcon}
            title="No team members"
            description="Team members will appear here after they join your organization."
          />
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>
              Team Members ({tenantUsers.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {tenantUsers.map((tu: any) => {
                const user = tu.users;
                const name = user?.display_name || user?.email || "Unknown";

                return (
                  <div
                    key={tu.id}
                    className="flex items-center gap-4 rounded-lg px-3 py-3 transition-colors hover:bg-muted/50"
                  >
                    <Avatar name={name} size="md" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {user?.display_name || "No name"}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {user?.email || "No email"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge
                        variant={
                          tu.role === "owner"
                            ? "default"
                            : tu.role === "admin"
                              ? "info"
                              : "outline"
                        }
                        className="capitalize"
                      >
                        {tu.role}
                      </Badge>
                      <Badge
                        variant={
                          tu.status === "active" ? "success" : "warning"
                        }
                        className="capitalize"
                      >
                        {tu.status || "active"}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
