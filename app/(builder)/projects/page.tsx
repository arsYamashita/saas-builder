export const dynamic = "force-dynamic";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { createAdminClient } from "@/lib/db/supabase/admin";
import {
  Plus,
  FolderKanban,
  ArrowRight,
  Clock,
  LayoutTemplate,
} from "lucide-react";

type ProjectStatus = "draft" | "approved" | "generating" | "deployed";

const statusConfig: Record<
  ProjectStatus,
  { variant: "secondary" | "success" | "warning" | "info"; label: string }
> = {
  draft: { variant: "secondary", label: "Draft" },
  approved: { variant: "success", label: "Approved" },
  generating: { variant: "warning", label: "Generating" },
  deployed: { variant: "info", label: "Deployed" },
};

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default async function ProjectsPage() {
  const supabase = createAdminClient();

  const { data: projects, error } = await supabase
    .from("projects")
    .select("id, name, template_key, status, description, created_at")
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-8 animate-fade-in">
      <PageHeader
        title="Projects"
        description="Manage your SaaS projects and track their progress."
        action={
          <Button asChild>
            <Link href="/projects/new">
              <Plus className="h-4 w-4" />
              New Project
            </Link>
          </Button>
        }
      />

      {error ? (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-sm text-destructive">
              Failed to load projects. Please try again later.
            </p>
          </CardContent>
        </Card>
      ) : !projects || projects.length === 0 ? (
        <Card>
          <EmptyState
            icon={FolderKanban}
            title="No projects yet"
            description="Create your first SaaS project to get started building with AI-powered code generation."
            action={
              <Button asChild>
                <Link href="/projects/new">
                  <Plus className="h-4 w-4" />
                  New Project
                </Link>
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project, index) => {
            const status = (project.status ?? "draft") as ProjectStatus;
            const config = statusConfig[status] ?? statusConfig.draft;

            return (
              <Link
                key={project.id}
                href={`/projects/${project.id}`}
                className="group block"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <Card className="h-full transition-all duration-200 hover:shadow-card-hover hover:-translate-y-0.5">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                        <FolderKanban className="h-5 w-5 text-primary" />
                      </div>
                      <Badge variant={config.variant}>{config.label}</Badge>
                    </div>

                    <div className="mt-4">
                      <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">
                        {project.name}
                      </h3>
                      {project.description && (
                        <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                          {project.description}
                        </p>
                      )}
                    </div>

                    <div className="mt-4 flex items-center gap-4 text-xs text-muted-foreground">
                      {project.template_key && (
                        <span className="flex items-center gap-1">
                          <LayoutTemplate className="h-3 w-3" />
                          {project.template_key}
                        </span>
                      )}
                      {project.created_at && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDate(project.created_at)}
                        </span>
                      )}
                    </div>

                    <div className="mt-4 flex items-center text-xs font-medium text-primary opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                      Open project
                      <ArrowRight className="ml-1 h-3 w-3" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
