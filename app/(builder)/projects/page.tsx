export const dynamic = "force-dynamic";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createAdminClient } from "@/lib/db/supabase/admin";
import { Plus, FolderKanban } from "lucide-react";

type ProjectStatus = "draft" | "approved" | "generating" | "deployed";

const statusVariantMap: Record<
  ProjectStatus,
  "secondary" | "success" | "warning" | "default"
> = {
  draft: "secondary",
  approved: "success",
  generating: "warning",
  deployed: "default",
};

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default async function ProjectsPage() {
  const supabase = createAdminClient();

  const { data: projects, error } = await supabase
    .from("projects")
    .select("id, name, template_key, status, description, created_at")
    .order("created_at", { ascending: false });

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Projects</h1>
          <p className="text-sm text-muted-foreground">
            Manage your SaaS projects and track their progress.
          </p>
        </div>
        <Button asChild>
          <Link href="/projects/new">
            <Plus className="mr-2 h-4 w-4" />
            New Project
          </Link>
        </Button>
      </div>

      {/* Error State */}
      {error ? (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-sm text-destructive">
              Failed to load projects. Please try again later.
            </p>
          </CardContent>
        </Card>
      ) : !projects || projects.length === 0 ? (
        /* Empty State */
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <FolderKanban className="mb-4 h-12 w-12 text-muted-foreground/50" />
            <h2 className="text-lg font-semibold">No projects yet</h2>
            <p className="mb-6 mt-1 text-sm text-muted-foreground">
              Create your first SaaS project to get started.
            </p>
            <Button asChild>
              <Link href="/projects/new">
                <Plus className="mr-2 h-4 w-4" />
                New Project
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        /* Projects Table */
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              All Projects ({projects.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm" role="table">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-3 pr-4 font-medium">Name</th>
                    <th className="pb-3 pr-4 font-medium">Template</th>
                    <th className="pb-3 pr-4 font-medium">Status</th>
                    <th className="pb-3 font-medium">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {projects.map((project) => {
                    const status = (project.status ?? "draft") as ProjectStatus;
                    const variant =
                      statusVariantMap[status] ?? "secondary";

                    return (
                      <tr
                        key={project.id}
                        className="border-b last:border-0 hover:bg-muted/50"
                      >
                        <td className="py-3 pr-4">
                          <Link
                            href={`/projects/${project.id}`}
                            className="font-medium text-foreground underline-offset-4 hover:underline"
                          >
                            {project.name}
                          </Link>
                        </td>
                        <td className="py-3 pr-4 text-muted-foreground">
                          {project.template_key ?? "-"}
                        </td>
                        <td className="py-3 pr-4">
                          <Badge variant={variant}>
                            {status.charAt(0).toUpperCase() + status.slice(1)}
                          </Badge>
                        </td>
                        <td className="py-3 text-muted-foreground">
                          {project.created_at
                            ? formatDate(project.created_at)
                            : "-"}
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
    </main>
  );
}
