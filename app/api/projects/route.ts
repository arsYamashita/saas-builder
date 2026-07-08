import { NextRequest, NextResponse } from "next/server";
import { projectFormSchema } from "@/lib/validation/project-form";
import { createAdminClient } from "@/lib/db/supabase/admin";
import { slugify } from "@/lib/utils/slugify";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { parseJsonBody } from "@/lib/api/errors";

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
    const parsedBody = await parseJsonBody(req);
    if (!parsedBody.ok) return parsedBody.response;
    const parsed = projectFormSchema.safeParse(parsedBody.data);

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

    // Single atomic RPC call — see
    // supabase/migrations/0016_create_tenant_with_owner_atomic.sql.
    // tenants/tenant_users/projects are created inside one Postgres
    // function invocation, so a mid-way failure (e.g. the tenant_users
    // INSERT) rolls back every row this call would otherwise have
    // created, instead of leaving an orphan tenant with no owner
    // membership ([[tenant_creation_non_transactional_orphan]]).
    const { data: rows, error: rpcError } = await supabase.rpc(
      "create_tenant_with_owner",
      {
        p_name: input.name,
        p_slug: tenantSlug,
        p_user_id: user.id,
        p_template_key: input.templateKey,
        p_industry: input.templateKey,
        p_description: input.summary,
        p_metadata: {
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
      }
    );

    // Never treat a missing/errored RPC result as success — this is
    // exactly the failure mode the old code silently swallowed for the
    // tenant_users INSERT (no error check at all). Any RPC error, or an
    // empty result set, must surface as a 500.
    const project = Array.isArray(rows) ? rows[0] : rows;
    if (rpcError || !project) {
      console.error(
        "Create tenant (atomic RPC) error:",
        rpcError?.message ?? "no row returned"
      );
      return NextResponse.json(
        { error: "Failed to create tenant" },
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
