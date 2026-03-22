import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockSupabaseClient } from "@/tests/helpers/mock-supabase";

// Must mock before import
vi.mock("@/lib/db/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

import { getLatestBlueprintByProjectId } from "../blueprints";
import { createAdminClient } from "@/lib/db/supabase/admin";

const mockCreateAdminClient = vi.mocked(createAdminClient);

describe("getLatestBlueprintByProjectId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns blueprint data on success", async () => {
    const mockData = { id: "bp-1", project_id: "proj-1", version: 2 };
    mockCreateAdminClient.mockReturnValue(
      createMockSupabaseClient({ selectData: [mockData] }) as any
    );

    const result = await getLatestBlueprintByProjectId("proj-1");
    expect(result).toEqual(mockData);
  });

  it("throws on error", async () => {
    mockCreateAdminClient.mockReturnValue(
      createMockSupabaseClient({ error: "Database error" }) as any
    );

    await expect(getLatestBlueprintByProjectId("proj-1"))
      .rejects.toThrow("Failed to fetch blueprint");
  });
});
