import Link from "next/link";
import { createAdminClient } from "@/lib/db/supabase/admin";
import { requireTenantRole } from "@/lib/rbac/guards";
import { DeleteButton } from "@/components/domain/delete-button";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Plus, Tag, Pencil } from "lucide-react";

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
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Plans"
        description="Manage subscription plans for your application."
        action={
          <Button asChild>
            <Link href="/plans/new">
              <Plus className="h-4 w-4" />
              New Plan
            </Link>
          </Button>
        }
      />

      {!plans || plans.length === 0 ? (
        <Card>
          <EmptyState
            icon={Tag}
            title="No plans yet"
            description="Create your first subscription plan to start monetizing."
            action={
              <Button asChild>
                <Link href="/plans/new">
                  <Plus className="h-4 w-4" />
                  New Plan
                </Link>
              </Button>
            }
          />
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>All Plans ({plans.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-3 pr-4 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Name
                    </th>
                    <th className="pb-3 pr-4 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Price ID
                    </th>
                    <th className="pb-3 pr-4 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Status
                    </th>
                    <th className="pb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {plans.map((plan) => (
                    <tr
                      key={plan.id}
                      className="border-b last:border-0 transition-colors hover:bg-muted/30"
                    >
                      <td className="py-3.5 pr-4">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                            <Tag className="h-4 w-4 text-primary" />
                          </div>
                          <span className="font-medium">{plan.name}</span>
                        </div>
                      </td>
                      <td className="py-3.5 pr-4">
                        <span className="text-xs font-mono text-muted-foreground">
                          {plan.price_id || "-"}
                        </span>
                      </td>
                      <td className="py-3.5 pr-4">
                        <Badge
                          variant={
                            plan.status === "active"
                              ? "success"
                              : plan.status === "draft"
                                ? "secondary"
                                : "warning"
                          }
                          className="capitalize"
                        >
                          {plan.status}
                        </Badge>
                      </td>
                      <td className="py-3.5">
                        <div className="flex items-center gap-2">
                          <Button variant="ghost" size="sm" asChild>
                            <Link href={`/plans/${plan.id}/edit`}>
                              <Pencil className="h-3.5 w-3.5" />
                              Edit
                            </Link>
                          </Button>
                          <DeleteButton
                            endpoint={`/api/domain/membership-plans/${plan.id}`}
                            confirmMessage={`Delete "${plan.name}"?`}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
