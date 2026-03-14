// ============================================================
// audit.ts — Unit Tests
// ============================================================

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock Supabase ───

const mockInsert = vi.fn();
const mockFrom = vi.fn(() => ({
  insert: mockInsert,
}));

vi.mock("@/lib/db/supabase/admin", () => ({
  createAdminClient: () => ({ from: mockFrom }),
}));

const { writeAuditLog } = await import("../audit");

describe("writeAuditLog", () => {
  beforeEach(() => vi.clearAllMocks());

  it("inserts audit log with all fields", async () => {
    mockInsert.mockResolvedValue({ error: null });

    await writeAuditLog({
      tenantId: "t1",
      actorUserId: "u1",
      action: "content.create",
      resourceType: "content",
      resourceId: "c1",
      before: null,
      after: { id: "c1", title: "test" },
    });

    expect(mockFrom).toHaveBeenCalledWith("audit_logs");
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: "t1",
        actor_user_id: "u1",
        action: "content.create",
        resource_type: "content",
        resource_id: "c1",
        after_json: { id: "c1", title: "test" },
      })
    );
  });

  it("does not throw on DB error (logs to console)", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockInsert.mockResolvedValue({ error: { message: "DB down" } });

    await expect(
      writeAuditLog({
        tenantId: "t1",
        actorUserId: "u1",
        action: "content.create",
        resourceType: "content",
        resourceId: "c1",
      })
    ).resolves.toBeUndefined();

    expect(consoleSpy).toHaveBeenCalled();
    const logMsg = consoleSpy.mock.calls[0].join(" ");
    expect(logMsg).toContain("[audit]");
    expect(logMsg).toContain("t1");
    expect(logMsg).toContain("content.create");
    consoleSpy.mockRestore();
  });

  it("does not throw on unexpected exception", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockInsert.mockRejectedValue(new Error("network fail"));

    await expect(
      writeAuditLog({
        tenantId: "t1",
        actorUserId: null,
        action: "subscription.created",
        resourceType: "subscription",
        resourceId: "s1",
      })
    ).resolves.toBeUndefined();

    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it("includes context in error log for observability", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockInsert.mockResolvedValue({ error: { message: "insert failed" } });

    await writeAuditLog({
      tenantId: "tenant-123",
      actorUserId: "user-456",
      action: "tag.create",
      resourceType: "tag",
      resourceId: "tag-789",
    });

    const logArgs = consoleSpy.mock.calls[0];
    const logStr = logArgs.map(String).join(" ");
    expect(logStr).toContain("tenant-123");
    expect(logStr).toContain("user-456");
    expect(logStr).toContain("tag.create");
    consoleSpy.mockRestore();
  });
});
