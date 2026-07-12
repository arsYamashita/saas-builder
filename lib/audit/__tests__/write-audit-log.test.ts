import { describe, it, expect, vi, beforeEach } from "vitest";

// Must mock before import
vi.mock("@/lib/db/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

import { writeAuditLog, AuditLogWriteError } from "../write-audit-log";
import { createAdminClient } from "@/lib/db/supabase/admin";

const mockCreateAdminClient = vi.mocked(createAdminClient);

/**
 * Builds a fake supabase client whose `.from("audit_logs").insert(...)`
 * resolves according to `insertImpl` (a function returning `{ error }`).
 */
function buildAuditClient(insertImpl: () => { error: { message: string } | null }) {
  const insert = vi.fn().mockImplementation(() => Promise.resolve(insertImpl()));
  return {
    client: { from: vi.fn().mockReturnValue({ insert }) },
    insert,
  };
}

const baseArgs = {
  tenantId: "tenant-1",
  actorUserId: "user-1",
  action: "membership_plan.create",
  resourceType: "membership_plan",
  resourceId: "plan-1",
};

describe("writeAuditLog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves without throwing when insert succeeds", async () => {
    const { client, insert } = buildAuditClient(() => ({ error: null }));
    mockCreateAdminClient.mockReturnValue(client as any);

    await expect(writeAuditLog(baseArgs)).resolves.toBeUndefined();
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it("throws AuditLogWriteError when audit_logs insert fails (fail-closed)", async () => {
    const { client, insert } = buildAuditClient(() => ({
      error: { message: "permission denied for table audit_logs" },
    }));
    mockCreateAdminClient.mockReturnValue(client as any);

    await expect(writeAuditLog(baseArgs)).rejects.toThrow(AuditLogWriteError);
    await expect(writeAuditLog(baseArgs)).rejects.toThrow(
      /permission denied for table audit_logs/
    );
    // Single attempt only: no blind retry, since audit_logs has no
    // idempotency key and retrying an ambiguous failure risks duplicate
    // audit rows (see write-audit-log.ts doc comment).
    expect(insert).toHaveBeenCalledTimes(2);
  });

  it("does not silently swallow the error with only a console.error (regression guard)", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { client } = buildAuditClient(() => ({
      error: { message: "insert failed" },
    }));
    mockCreateAdminClient.mockReturnValue(client as any);

    await expect(writeAuditLog(baseArgs)).rejects.toThrow(AuditLogWriteError);
    // console.error is still fine for observability, but must NOT be the only signal.
    expect(consoleSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });
});
