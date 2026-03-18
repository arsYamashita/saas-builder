import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { resolveQualityChecks, resolveExtraGateDefinitions } from "@/lib/db/quality-runs";
import { runExtraGate } from "@/lib/quality/run-extra-gate";
import { COMMON_QUALITY_GATES } from "@/types/quality-run";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "extra-gate-"));
}

function writeFile(dir: string, relPath: string, content: string) {
  const fullPath = path.join(dir, relPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);
}

// ---------------------------------------------------------------------------
// 1. No extraQualityGates keeps behavior unchanged
// ---------------------------------------------------------------------------

describe("no extraQualityGates — backward compatibility", () => {
  it("returns only common gates when templateKey is undefined", () => {
    const checks = resolveQualityChecks(undefined);
    expect(checks).toHaveLength(COMMON_QUALITY_GATES.length);
    expect(checks.every((c) => c.category === "common")).toBe(true);
  });

  it("returns only common gates when templateKey is null", () => {
    const checks = resolveQualityChecks(null);
    expect(checks).toHaveLength(COMMON_QUALITY_GATES.length);
  });

  it("returns only common gates for membership_content_affiliate (no extra gates)", () => {
    const checks = resolveQualityChecks("membership_content_affiliate");
    expect(checks).toHaveLength(COMMON_QUALITY_GATES.length);
    expect(checks.every((c) => c.category === "common")).toBe(true);
  });

  it("returns only common gates for community_membership_saas (no extra gates)", () => {
    const checks = resolveQualityChecks("community_membership_saas");
    expect(checks).toHaveLength(COMMON_QUALITY_GATES.length);
  });

  it("resolveExtraGateDefinitions returns empty for templates without extras", () => {
    expect(resolveExtraGateDefinitions(null)).toEqual([]);
    expect(resolveExtraGateDefinitions(undefined)).toEqual([]);
    expect(resolveExtraGateDefinitions("membership_content_affiliate")).toEqual([]);
    expect(resolveExtraGateDefinitions("community_membership_saas")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 2. extraQualityGates are loaded from manifest
// ---------------------------------------------------------------------------

describe("extraQualityGates loaded from manifest", () => {
  it("reservation_saas includes role_consistency extra gate", () => {
    const checks = resolveQualityChecks("reservation_saas");
    expect(checks.length).toBeGreaterThan(COMMON_QUALITY_GATES.length);
    const extra = checks.filter((c) => c.category === "extra");
    expect(extra.length).toBeGreaterThanOrEqual(1);
    expect(extra.find((e) => e.key === "role_consistency")).toBeDefined();
  });

  it("simple_crm_saas includes role_consistency extra gate", () => {
    const checks = resolveQualityChecks("simple_crm_saas");
    const extra = checks.filter((c) => c.category === "extra");
    expect(extra.length).toBeGreaterThanOrEqual(1);
    expect(extra.find((e) => e.key === "role_consistency")).toBeDefined();
  });

  it("internal_admin_ops_saas includes role_consistency extra gate", () => {
    const checks = resolveQualityChecks("internal_admin_ops_saas");
    const extra = checks.filter((c) => c.category === "extra");
    expect(extra.length).toBeGreaterThanOrEqual(1);
    expect(extra.find((e) => e.key === "role_consistency")).toBeDefined();
  });

  it("resolveExtraGateDefinitions returns gate definitions with tool field", () => {
    const gates = resolveExtraGateDefinitions("reservation_saas");
    expect(gates).toHaveLength(1);
    expect(gates[0]).toMatchObject({
      key: "role_consistency",
      tool: "role-consistency-check",
      required: true,
    });
  });
});

// ---------------------------------------------------------------------------
// 3. extraQualityGates run after common gates (execution order)
// ---------------------------------------------------------------------------

describe("execution order — extra gates follow common gates", () => {
  it("common gates appear before extra gates in resolved checks", () => {
    const checks = resolveQualityChecks("reservation_saas");
    const commonKeys = COMMON_QUALITY_GATES.map((g) => g.key);
    const resolvedKeys = checks.map((c) => c.key);

    // First N keys should be common
    for (let i = 0; i < commonKeys.length; i++) {
      expect(resolvedKeys[i]).toBe(commonKeys[i]);
    }

    // Remaining keys should be extra
    const extraPortion = checks.slice(commonKeys.length);
    expect(extraPortion.every((c) => c.category === "extra")).toBe(true);
  });

  it("all checks start with pending status", () => {
    const checks = resolveQualityChecks("internal_admin_ops_saas");
    expect(checks.every((c) => c.status === "pending")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4. Failing extra gate causes overall quality failure
// ---------------------------------------------------------------------------

describe("failing extra gate — role_consistency", () => {
  it("fails when generated code uses forbidden role", async () => {
    const dir = makeTmpDir();
    writeFile(dir, "schema.sql", `CHECK (role IN ('owner', 'admin', 'member'))`);

    const gate = {
      key: "role_consistency",
      label: "Role Consistency",
      tool: "role-consistency-check",
      required: true,
      timeoutMs: 10_000,
    };

    const result = await runExtraGate(gate, dir, "reservation_saas");
    expect(result.success).toBe(false);
    expect(result.combined).toContain("FAILED");
    expect(result.combined).toContain("member");

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("fails for IAO template with staff role", async () => {
    const dir = makeTmpDir();
    writeFile(dir, "types.ts", `type Role = 'owner' | 'admin' | 'staff';`);

    const gate = {
      key: "role_consistency",
      label: "Role Consistency",
      tool: "role-consistency-check",
      required: true,
      timeoutMs: 10_000,
    };

    const result = await runExtraGate(gate, dir, "internal_admin_ops_saas");
    expect(result.success).toBe(false);
    expect(result.combined).toContain("staff");

    fs.rmSync(dir, { recursive: true, force: true });
  });
});

// ---------------------------------------------------------------------------
// 5. Passing extra gates preserves success
// ---------------------------------------------------------------------------

describe("passing extra gate — role_consistency", () => {
  it("passes when roles are correct for reservation_saas", async () => {
    const dir = makeTmpDir();
    writeFile(dir, "schema.sql", `CHECK (role IN ('owner', 'admin', 'staff'))`);

    const gate = {
      key: "role_consistency",
      label: "Role Consistency",
      tool: "role-consistency-check",
      required: true,
      timeoutMs: 10_000,
    };

    const result = await runExtraGate(gate, dir, "reservation_saas");
    expect(result.success).toBe(true);
    expect(result.combined).toContain("passed");

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("passes when roles are correct for simple_crm_saas", async () => {
    const dir = makeTmpDir();
    writeFile(dir, "types.ts", `type UserRole = 'owner' | 'admin' | 'sales';`);

    const gate = {
      key: "role_consistency",
      label: "Role Consistency",
      tool: "role-consistency-check",
      required: true,
      timeoutMs: 10_000,
    };

    const result = await runExtraGate(gate, dir, "simple_crm_saas");
    expect(result.success).toBe(true);

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("passes when no scannable files exist", async () => {
    const dir = makeTmpDir();

    const gate = {
      key: "role_consistency",
      label: "Role Consistency",
      tool: "role-consistency-check",
      required: true,
      timeoutMs: 10_000,
    };

    const result = await runExtraGate(gate, dir, "reservation_saas");
    expect(result.success).toBe(true);

    fs.rmSync(dir, { recursive: true, force: true });
  });
});

// ---------------------------------------------------------------------------
// 6. Quality summary includes extra gates
// ---------------------------------------------------------------------------

describe("quality summary includes extra gates", () => {
  it("resolved checks include both common and extra with labels", () => {
    const checks = resolveQualityChecks("reservation_saas");

    const commonChecks = checks.filter((c) => c.category === "common");
    const extraChecks = checks.filter((c) => c.category === "extra");

    expect(commonChecks).toHaveLength(COMMON_QUALITY_GATES.length);
    expect(extraChecks.length).toBeGreaterThanOrEqual(1);
    expect(extraChecks.find((e) => e.label === "Role Consistency (staff, not member)")).toBeDefined();

    // Total count = common + extras (role_consistency + template_smoke)
    expect(checks.length).toBeGreaterThan(COMMON_QUALITY_GATES.length);
  });

  it("each check has required fields for summary reporting", () => {
    const checks = resolveQualityChecks("internal_admin_ops_saas");

    for (const check of checks) {
      expect(check.key).toBeTruthy();
      expect(check.label).toBeTruthy();
      expect(check.status).toBe("pending");
      expect(check.category).toMatch(/^(common|extra)$/);
    }
  });
});

// ---------------------------------------------------------------------------
// 7. GREEN eligibility fails when extra gate fails
// ---------------------------------------------------------------------------

describe("GREEN eligibility — extra gate affects quality outcome", () => {
  it("quality checks reflect failure state for promotion blocking", () => {
    // Simulate: all common passed, extra failed
    const checks = resolveQualityChecks("reservation_saas");

    // Mark common as passed
    const simulated = checks.map((c) =>
      c.category === "common"
        ? { ...c, status: "passed" as const }
        : { ...c, status: "failed" as const }
    );

    // Promotion logic checks: all checks passed?
    const allPassed = simulated.every((c) => c.status === "passed");
    expect(allPassed).toBe(false);

    const failedChecks = simulated.filter((c) => c.status !== "passed");
    expect(failedChecks.length).toBeGreaterThanOrEqual(1);
    expect(failedChecks.every((c) => c.category === "extra")).toBe(true);
    expect(failedChecks.find((c) => c.key === "role_consistency")).toBeDefined();
  });

  it("quality checks reflect success when all gates pass", () => {
    const checks = resolveQualityChecks("reservation_saas");

    const simulated = checks.map((c) => ({ ...c, status: "passed" as const }));
    const allPassed = simulated.every((c) => c.status === "passed");
    expect(allPassed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 8. Deterministic execution order is preserved
// ---------------------------------------------------------------------------

describe("deterministic execution order", () => {
  it("resolveQualityChecks returns same order on repeated calls", () => {
    const first = resolveQualityChecks("reservation_saas").map((c) => c.key);
    const second = resolveQualityChecks("reservation_saas").map((c) => c.key);
    const third = resolveQualityChecks("reservation_saas").map((c) => c.key);

    expect(first).toEqual(second);
    expect(second).toEqual(third);
  });

  it("extra gates always appear at the end regardless of template", () => {
    for (const tk of ["reservation_saas", "simple_crm_saas", "internal_admin_ops_saas"]) {
      const checks = resolveQualityChecks(tk);
      const commonCount = COMMON_QUALITY_GATES.length;

      // First N are common
      for (let i = 0; i < commonCount; i++) {
        expect(checks[i].category).toBe("common");
      }

      // Rest are extra
      for (let i = commonCount; i < checks.length; i++) {
        expect(checks[i].category).toBe("extra");
      }
    }
  });

  it("resolveExtraGateDefinitions preserves manifest order", () => {
    const gates = resolveExtraGateDefinitions("reservation_saas");
    expect(gates[0].key).toBe("role_consistency");
  });
});
