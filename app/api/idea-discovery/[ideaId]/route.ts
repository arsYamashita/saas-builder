/**
 * Single Idea Detail API
 *
 * Endpoints:
 * - GET: get single idea detail
 * - POST: create project from idea
 */

import { NextRequest, NextResponse } from "next/server";
import { SaaSBuilderStorageAdapter } from "@/lib/idea-discovery/integrations/saas-builder-storage-adapter";

/**
 * GET /api/idea-discovery/[ideaId]
 * Get a single idea's full details
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { ideaId: string } },
) {
  try {
    const { ideaId } = params;

    const storage = new SaaSBuilderStorageAdapter();
    const ideas = await storage.loadAnalyzedIdeas();

    const idea = ideas.find((i) => i.id === ideaId);
    if (!idea) {
      return NextResponse.json(
        { success: false, error: "Idea not found" },
        { status: 404 },
      );
    }

    // Also get the feed item if it exists
    const feedItems = await storage.loadFeedItems();
    const feedItem = feedItems.find((f) => f.ideaId === ideaId);

    return NextResponse.json({
      success: true,
      idea,
      feedItem: feedItem || null,
    });
  } catch (error) {
    console.error("[idea-discovery] GET detail error:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to get idea",
      },
      { status: 500 },
    );
  }
}

/**
 * POST /api/idea-discovery/[ideaId]
 * Create a project from an idea
 *
 * This API creates a real project via /api/projects, pre-filling
 * form data from the idea's analysis results.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { ideaId: string } },
) {
  try {
    const { ideaId } = params;
    const body = await request.json();
    const { projectName, templateKey } = body;

    if (!projectName || !templateKey) {
      return NextResponse.json(
        {
          success: false,
          error: "projectName and templateKey are required",
        },
        { status: 400 },
      );
    }

    const storage = new SaaSBuilderStorageAdapter();
    const ideas = await storage.loadAnalyzedIdeas();

    const idea = ideas.find((i) => i.id === ideaId);
    if (!idea) {
      return NextResponse.json(
        { success: false, error: "Idea not found" },
        { status: 404 },
      );
    }

    const needs = idea.needsAnalysis;

    // Build project form data from idea analysis
    const projectFormData = {
      name: projectName,
      summary: needs.problemStatement || "",
      targetUsers: needs.targetUsers || "",
      problemToSolve: needs.mainUseCases?.length
        ? `${needs.problemStatement}\n\nユースケース: ${needs.mainUseCases.join("、")}`
        : needs.problemStatement || "",
      referenceServices: "",
      brandTone: "modern" as const,
      templateKey,
      requiredFeatures: needs.requiredFeatures || [],
      managedData: needs.coreEntities || [],
      endUserCreatedData: ["profile"],
      roles: needs.suggestedRoles || ["user"],
      billingModel: needs.billingModel || "subscription",
      affiliateEnabled: needs.affiliateEnabled ?? false,
      visibilityRule: "members_only" as const,
      mvpScope: ["auth", "tenant", "roles"],
      excludedInitialScope: ["advanced_analytics", "mobile_app"],
      stackPreference: "Next.js + Supabase + Stripe",
      notes: `[Idea Discovery] アイデアID: ${ideaId}\nソース: ${idea.source}\n${idea.sourceUrl ? `URL: ${idea.sourceUrl}` : ""}`,
      priority: "high" as const,
    };

    // Create the project via internal API call
    const origin = request.nextUrl.origin;
    const projectRes = await fetch(`${origin}/api/projects`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: request.headers.get("cookie") || "",
      },
      body: JSON.stringify(projectFormData),
    });

    if (!projectRes.ok) {
      const errorData = await projectRes.json().catch(() => ({}));
      return NextResponse.json(
        {
          success: false,
          error: errorData.error || `Project creation failed (${projectRes.status})`,
          sourceIdeaId: ideaId,
        },
        { status: projectRes.status },
      );
    }

    const projectData = await projectRes.json();

    return NextResponse.json({
      success: true,
      project: {
        ...projectData.project,
        sourceIdeaId: ideaId,
        sourceIdea: {
          problemStatement: needs.problemStatement,
          targetUsers: needs.targetUsers,
          requiredFeatures: needs.requiredFeatures,
        },
      },
      message: "プロジェクトが作成されました。ダッシュボードで確認してください。",
    });
  } catch (error) {
    console.error("[idea-discovery] POST project error:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to create project",
      },
      { status: 500 },
    );
  }
}
