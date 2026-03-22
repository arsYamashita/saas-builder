import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockSupabaseClient } from "@/tests/helpers/mock-supabase";

vi.mock("@/lib/db/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

import { getGeneratedFilesByProject } from "../generated-files";
import { createAdminClient } from "@/lib/db/supabase/admin";

const mockCreateAdminClient = vi.mocked(createAdminClient);

describe("getGeneratedFilesByProject", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns file list on success", async () => {
    const files = [
      { id: "f-1", file_path: "src/page.tsx", file_category: "page" },
      { id: "f-2", file_path: "src/lib/utils.ts", file_category: "lib" },
    ];
    mockCreateAdminClient.mockReturnValue(
      createMockSupabaseClient({ selectData: files }) as any
    );

    const result = await getGeneratedFilesByProject("proj-1");
    expect(result).toEqual(files);
  });

  it("throws on error", async () => {
    mockCreateAdminClient.mockReturnValue(
      createMockSupabaseClient({ error: "Connection failed" }) as any
    );

    await expect(getGeneratedFilesByProject("proj-1"))
      .rejects.toThrow("Failed to fetch generated files");
  });
});
