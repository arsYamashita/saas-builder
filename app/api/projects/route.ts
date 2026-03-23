import { NextRequest, NextResponse } from "next/server";
import { projectFormSchema } from "@/lib/validation/project-form";
import { createAdminClient } from "@/lib/db/supabase/admin";
import { slugify } from "@/lib/utils/slugify";
import { requireCurrentUser } from "@/lib/auth/current-user";

export async function GET() {
  try {
    const user = await requireCurrentUser();
    const supabase = createAdminClient();

    const { data: tenantUser } = await supabase
      .from("tenant_users")
      .select("tenant_id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .limit(1)
      .single();

    if (!tenantUser) {
      return NextResponse.json({ projects: [] });
    }

    const { data: projects, error } = await supabase
      .from("projects")
      .select("id, name, template_key, status, description, created_at, updated_at")
      .eq("tenant_id", tenantUser.tenant_id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Fetch projects error:", error.message);
      return NextResponse.json(
        { error: "Failed to fetch projects" },
        { status: 500 }
      );
    }

    return NextResponse.json({ projects: projects ?? [] });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown server error";
    if (message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Fetch projects unexpected error:", message);
    return NextResponse.json(
      { error: "Failed to fetch projects" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireCurrentUser();
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
      console.error("Create tenant error:", tenantError.message);
      return NextResponse.json(
        { error: "Failed to create tenant" },
        { status: 500 }
      );
    }

    // Link the creating user to the new tenant
    await supabase.from("tenant_users").insert({
      tenant_id: tenant.id,
      user_id: user.id,
      role: "owner",
      status: "active",
    });

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
      console.error("Create project error:", projectError.message);
      return NextResponse.json(
        { error: "Failed to create project" },
        { status: 500 }
      );
    }

    return NextResponse.json({ project }, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown server error";
    if (message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Create project unexpected error:", message);
    return NextResponse.json(
      { error: "Failed to create project" },
      { status: 500 }
    );
  }
}
