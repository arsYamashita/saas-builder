import { createAdminClient } from "@/lib/db/supabase/admin";
import { BlueprintViewer } from "@/components/builder/blueprint-viewer";

export default async function BlueprintPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const supabase = createAdminClient();

  const { data: project } = await supabase
    .from("projects")
    .select("id, name, status")
    .eq("id", projectId)
    .single();

  if (!project) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Project not found.</p>
      </div>
    );
  }

  const { data: blueprint } = await supabase
    .from("blueprints")
    .select("*")
    .eq("project_id", projectId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (
    <BlueprintViewer
      projectId={projectId}
      projectName={project.name}
      blueprint={blueprint}
    />
  );
}
