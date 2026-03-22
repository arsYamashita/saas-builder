import { NextRequest, NextResponse } from "next/server";
import { projectFormSchema } from "@/lib/validation/project-form";
import { createAdminClient } from "@/lib/db/supabase/admin";
import { slugify } from "@/lib/utils/slugify";

export async function GET() {
  try {
    const supabase = createAdminClient();

    const { data: projects, error } = await supabase
      .from("projects")
      .select("id, name, template_key, status, description, created_at, updated_at")
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json(
        { error: "Failed to fetch projects", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ projects: projects ?? [] });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown server error";
    return NextResponse.json(
      { error: "Failed to fetch projects", details: message },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = projectFormSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid input",
          issues: parsed.error.issues,
        },
        { status: 400 }
      );
    }

    const input = parsed.data;
    const supabase = createAdminClient();

    const tenantSlugBase = slugify(input.name || "project");
    const tenantSlug = `${tenantSlugBase}-${crypto.randomUUID().slice(0, 8)}`;

    const { data: tenant, error: tenantError } = await supabase
      .from("tenants")
      .insert({
        name: input.name,
        slug: tenantSlug,
        plan_type: "starter",
        status: "active",
      })
      .select()
      .single();

    if (tenantError) {
      return NextResponse.json(
        { error: "Failed to create tenant", details: tenantError.message },
        { status: 500 }
      );
    }

    const { data: project, error: projectError } = await supabase
      .from("projects")
      .insert({
        tenant_id: tenant.id,
        name: input.name,
        industry: input.templateKey,
        template_key: input.templateKey,
        status: "draft",
        description: input.summary,
        metadata_json: {
          targetUsers: input.targetUsers,
          problemToSolve: input.problemToSolve,
          referenceServices: input.referenceServices,
          brandTone: input.brandTone,
          requiredFeatures: input.requiredFeatures,
          managedData: input.managedData,
          endUserCreatedData: input.endUserCreatedData,
          roles: input.roles,
          billingModel: input.billingModel,
          affiliateEnabled: input.affiliateEnabled,
          visibilityRule: input.visibilityRule,
          mvpScope: input.mvpScope,
          excludedInitialScope: input.excludedInitialScope,
          stackPreference: input.stackPreference,
          notes: input.notes,
          priority: input.priority,
        },
      })
      .select()
      .single();

    if (projectError) {
      return NextResponse.json(
        { error: "Failed to create project", details: projectError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ project }, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown server error";

    return NextResponse.json(
      { error: "Failed to create project", details: message },
      { status: 500 }
    );
  }
}
