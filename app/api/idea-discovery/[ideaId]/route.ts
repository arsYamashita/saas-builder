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
          error:
            "projectName and templateKey are required",
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

    // Create project metadata from idea
    const projectMetadata = {
      projectId: `project-${ideaId}-${Date.now()}`,
      projectName,
      templateKey,
      sourceIdeaId: ideaId,
      sourceIdea: {
        problemStatement: idea.needsAnalysis.problemStatement,
        targetUsers: idea.needsAnalysis.targetUsers,
        requiredFeatures: idea.needsAnalysis.requiredFeatures,
      },
      createdAt: new Date().toISOString(),
    };

    // In a real implementation, this would create the project in the database
    // For now, we just return the metadata
    return NextResponse.json({
      success: true,
      project: projectMetadata,
      message: "Project creation initiated. Complete setup in dashboard.",
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
