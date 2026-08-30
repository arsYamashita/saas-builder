import { describe, it, expect, vi, beforeEach } from "vitest";

// Must mock before import
vi.mock("@/lib/db/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

import {
  writeAuditLog,
  AuditLogWriteError,
} from "../write-audit-log";
import {
  getAuditLogFailureMetrics,
  resetAuditLogFailureMetrics,
} from "../metrics";
import { createAdminClient } from "@/lib/db/supabase/admin";

const mockCreateAdminClient = vi.mocked(createAdminClient);

const baseArgs = {
  tenantId: "tenant-1",
  actorUserId: "user-1",
  action: "membership_plan.create",
  resourceType: "membership_plan",
  resourceId: "plan-1",
};

/**
 * Builds a fake admin client whose `audit_logs` insert resolves per
 * `auditLogsResult`, and whose `audit_log_failures` (dead-letter) insert
 * resolves per `deadLetterResult` (defaults to success).
 */
function buildClient(opts: {
  auditLogsResult?: { error: { message: string } | null };
  auditLogsThrows?: Error;
  deadLetterResult?: { error: { message: string } | null };
  deadLetterThrows?: Error;
}) {
  const auditLogsInsert = opts.auditLogsThrows
    ? vi.fn().mockRejectedValue(opts.auditLogsThrows)
    : vi.fn().mockResolvedValue({ error: opts.auditLogsResult?.error ?? null });
  const deadLetterInsert = opts.deadLetterThrows
    ? vi.fn().mockRejectedValue(opts.deadLetterThrows)
    : vi.fn().mockResolvedValue({ error: opts.deadLetterResult?.error ?? null });

  const from = vi.fn((table: string) => {
    if (table === "audit_logs") return { insert: auditLogsInsert };
    if (table === "audit_log_failures") return { insert: deadLetterInsert };
    throw new Error(`unexpected table in test: ${table}`);
  });

  return { client: { from }, auditLogsInsert, deadLetterInsert };
}

describe("writeAuditLog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetAuditLogFailureMetrics();
  });

  it("resolves without throwing when the audit_logs insert succeeds", async () => {
    const { client, auditLogsInsert, deadLetterInsert } = buildClient({
      auditLogsResult: { error: null },
    });
    mockCreateAdminClient.mockReturnValue(client as any);

    await expect(writeAuditLog(baseArgs)).resolves.toBeUndefined();
    expect(auditLogsInsert).toHaveBeenCalledTimes(1);
    expect(deadLetterInsert).not.toHaveBeenCalled();
    expect(getAuditLogFailureMetrics()).toMatchObject({
      "fail-closed": 0,
      "fail-recorded": 0,
      "fail-recorded-double-failure": 0,
    });
  });

  describe("default onFailure = fail-recorded", () => {
    it("does NOT throw, but dead-letters the failed write and increments the metric (regression guard: never only console.error)", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const { client, deadLetterInsert } = buildClient({
        auditLogsResult: { error: { message: "permission denied for table audit_logs" } },
      });
      mockCreateAdminClient.mockReturnValue(client as any);

      await expect(writeAuditLog(baseArgs)).resolves.toBeUndefined();

      // console.error alone must not be the only signal — a dead-letter
      // row must also have been written.
      expect(consoleSpy).toHaveBeenCalled();
      expect(deadLetterInsert).toHaveBeenCalledTimes(1);
      const deadLetterRow = deadLetterInsert.mock.calls[0][0];
      expect(deadLetterRow).toMatchObject({
        tenant_id: "tenant-1",
        action: "membership_plan.create",
        resource_type: "membership_plan",
        resource_id: "plan-1",
        error_message: expect.stringContaining("permission denied"),
      });
      expect(deadLetterRow.payload_json).toBeTruthy();

      expect(getAuditLogFailureMetrics()["fail-recorded"]).toBe(1);
      expect(getAuditLogFailureMetrics()["fail-recorded-double-failure"]).toBe(0);

      consoleSpy.mockRestore();
    });

    it("throws AuditLogWriteError when BOTH the audit_logs insert and the dead-letter insert fail (double failure — nothing durable would otherwise record the loss)", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const { client } = buildClient({
        auditLogsResult: { error: { message: "insert failed" } },
        deadLetterResult: { error: { message: "audit_log_failures also down" } },
      });
      mockCreateAdminClient.mockReturnValue(client as any);

      await expect(writeAuditLog(baseArgs)).rejects.toThrow(AuditLogWriteError);
      expect(getAuditLogFailureMetrics()["fail-recorded-double-failure"]).toBe(1);
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe("primary insert THROWS instead of resolving with { error } (Codex review finding)", () => {
    it("still dead-letters and increments the metric when audit_logs.insert() throws (fail-recorded)", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const { client, deadLetterInsert } = buildClient({
        auditLogsThrows: new Error("fetch failed: network error"),
      });
      mockCreateAdminClient.mockReturnValue(client as any);

      await expect(writeAuditLog(baseArgs)).resolves.toBeUndefined();

      expect(deadLetterInsert).toHaveBeenCalledTimes(1);
      const deadLetterRow = deadLetterInsert.mock.calls[0][0];
      expect(deadLetterRow.error_message).toContain("network error");
      expect(getAuditLogFailureMetrics()["fail-recorded"]).toBe(1);

      consoleSpy.mockRestore();
    });

    it("still throws AuditLogWriteError immediately when audit_logs.insert() throws under fail-closed", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const { client, deadLetterInsert } = buildClient({
        auditLogsThrows: new Error("fetch failed: network error"),
      });
      mockCreateAdminClient.mockReturnValue(client as any);

      await expect(
        writeAuditLog(baseArgs, { onFailure: "fail-closed" })
      ).rejects.toThrow(AuditLogWriteError);
      expect(deadLetterInsert).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it("counts a double failure when the dead-letter insert ALSO throws (not just resolves with an error)", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const { client } = buildClient({
        auditLogsThrows: new Error("network error"),
        deadLetterThrows: new Error("dead-letter table unreachable"),
      });
      mockCreateAdminClient.mockReturnValue(client as any);

      await expect(writeAuditLog(baseArgs)).rejects.toThrow(AuditLogWriteError);
      expect(getAuditLogFailureMetrics()["fail-recorded-double-failure"]).toBe(1);

      consoleSpy.mockRestore();
    });
  });

  describe("onFailure = fail-closed", () => {
    it("throws AuditLogWriteError immediately on the first failure, without attempting a dead-letter write", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const { client, deadLetterInsert } = buildClient({
        auditLogsResult: { error: { message: "permission denied for table audit_logs" } },
      });
      mockCreateAdminClient.mockReturnValue(client as any);

      await expect(
        writeAuditLog(baseArgs, { onFailure: "fail-closed" })
      ).rejects.toThrow(AuditLogWriteError);
      await expect(
        writeAuditLog(baseArgs, { onFailure: "fail-closed" })
      ).rejects.toThrow(/permission denied for table audit_logs/);

      expect(deadLetterInsert).not.toHaveBeenCalled();
      expect(getAuditLogFailureMetrics()["fail-closed"]).toBe(2);

      consoleSpy.mockRestore();
    });
  });

  it("never resolves successfully while leaving only a console.error trail (core regression guard)", async () => {
    // For every onFailure mode, a failed primary insert must result in
    // EITHER a thrown error OR a durable dead-letter row + metric — never
    // "resolves + console.error only", which is the exact silent-loss bug
    // this fix closes. See
    // 30_Knowledge/errors/audit_log_write_best_effort_silent_loss.md
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    // fail-recorded path, dead-letter succeeds: must resolve AND dead-letter.
    const { client, deadLetterInsert } = buildClient({
      auditLogsResult: { error: { message: "boom" } },
    });
    mockCreateAdminClient.mockReturnValue(client as any);
    await writeAuditLog(baseArgs);
    expect(deadLetterInsert).toHaveBeenCalledTimes(1);

    consoleSpy.mockRestore();
  });
});
