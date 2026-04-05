// GET /api/public/tenants/[tenantSlug]/posts
// Guard: none (public)
// Public post feed. Only published posts. Supports ?category_slug and pagination.

import { createAdminClient } from "@/lib/db/supabase/admin";
import { handleGuardError, GuardError } from "@/lib/guards";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ tenantSlug: string }> }
) {
  try {
    const { tenantSlug } = await params;
    const supabase = createAdminClient();

    // Resolve tenantSlug to tenantId
    const { data: tenant, error: tenantError } = await supabase
      .from("tenants")
      .select("id")
      .eq("slug", tenantSlug)
      .eq("status", "active")
      .single();

    if (tenantError || !tenant) {
      throw new GuardError(404, "Tenant not found");
    }

    const url = new URL(req.url);
    const categorySlug = url.searchParams.get("category_slug");
    const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") ?? "20", 10)));
    const offset = (page - 1) * limit;

    // If category_slug is provided, resolve it to category_id
    let categoryId: string | null = null;
    if (categorySlug) {
      const { data: category, error: catError } = await supabase
        .from("categories")
        .select("id")
        .eq("tenant_id", tenant.id)
        .eq("slug", categorySlug)
        .single();

      if (catError || !category) {
        throw new GuardError(404, "Category not found");
      }

      categoryId = category.id;
    }

    let query = supabase
      .from("posts")
      .select(
        "id, title, body, is_pinned, like_count, comment_count, published_at, created_at, author:users!posts_author_id_fkey(display_name, avatar_url), category:categories!posts_category_id_fkey(name, slug, emoji)",
        { count: "exact" }
      )
      .eq("tenant_id", tenant.id)
      .not("published_at", "is", null)
      .order("is_pinned", { ascending: false })
      .order("published_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (categoryId) {
      query = query.eq("category_id", categoryId);
    }

    const { data: posts, error, count } = await query;

    if (error) {
      throw new GuardError(500, `Failed to fetch posts: ${error.message}`);
    }

    return Response.json({
      posts: posts ?? [],
      pagination: {
        page,
        limit,
        total: count ?? 0,
        total_pages: Math.ceil((count ?? 0) / limit),
      },
    });
  } catch (error) {
    return handleGuardError(error);
  }
}
