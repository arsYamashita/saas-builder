import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { checkRoleConsistency } from "../role-consistency";

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "role-check-"));
}

function writeFile(dir: string, relPath: string, content: string) {
  const fullPath = path.join(dir, relPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);
}

describe("checkRoleConsistency (default / IAO)", () => {
  it("passes when only owner/admin/operator are used", () => {
    const dir = makeTmpDir();
    writeFile(dir, "types.ts", `export type UserRole = 'owner' | 'admin' | 'operator';`);
    writeFile(dir, "schema.sql", `CHECK (role IN ('owner', 'admin', 'operator'))`);
    const result = checkRoleConsistency(dir, "internal_admin_ops_saas");
    expect(result.passed).toBe(true);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("fails when 'member' appears in IAO template", () => {
    const dir = makeTmpDir();
    writeFile(dir, "schema.sql", `CHECK (role IN ('owner', 'admin', 'member'))`);
    const result = checkRoleConsistency(dir, "internal_admin_ops_saas");
    expect(result.passed).toBe(false);
    expect(result.violations[0].forbiddenRole).toBe("member");
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("fails when 'staff' appears in IAO template", () => {
    const dir = makeTmpDir();
    writeFile(dir, "roles.ts", `const roles = ['owner', 'admin', 'staff'];`);
    const result = checkRoleConsistency(dir, "internal_admin_ops_saas");
    expect(result.passed).toBe(false);
    expect(result.violations[0].forbiddenRole).toBe("staff");
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe("checkRoleConsistency (CRM)", () => {
  it("passes when owner/admin/sales are used", () => {
    const dir = makeTmpDir();
    writeFile(dir, "types.ts", `export type UserRole = 'owner' | 'admin' | 'sales';`);
    writeFile(dir, "schema.sql", `CHECK (role IN ('owner', 'admin', 'sales'))`);
    const result = checkRoleConsistency(dir, "simple_crm_saas");
    expect(result.passed).toBe(true);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("fails when 'member' appears in CRM template", () => {
    const dir = makeTmpDir();
    writeFile(dir, "schema.sql", `CHECK (role IN ('owner', 'admin', 'member'))`);
    const result = checkRoleConsistency(dir, "simple_crm_saas");
    expect(result.passed).toBe(false);
    expect(result.violations[0].forbiddenRole).toBe("member");
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("fails when 'operator' appears in CRM template", () => {
    const dir = makeTmpDir();
    writeFile(dir, "types.ts", `export type UserRole = 'owner' | 'admin' | 'operator';`);
    const result = checkRoleConsistency(dir, "simple_crm_saas");
    expect(result.passed).toBe(false);
    expect(result.violations[0].forbiddenRole).toBe("operator");
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("fails when 'staff' appears in CRM template", () => {
    const dir = makeTmpDir();
    writeFile(dir, "types.ts", `export type UserRole = 'owner' | 'admin' | 'staff';`);
    const result = checkRoleConsistency(dir, "simple_crm_saas");
    expect(result.passed).toBe(false);
    expect(result.violations[0].forbiddenRole).toBe("staff");
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe("checkRoleConsistency (RSV)", () => {
  it("passes when owner/admin/staff are used", () => {
    const dir = makeTmpDir();
    writeFile(dir, "types.ts", `export type UserRole = 'owner' | 'admin' | 'staff';`);
    writeFile(dir, "schema.sql", `CHECK (role IN ('owner', 'admin', 'staff'))`);
    const result = checkRoleConsistency(dir, "reservation_saas");
    expect(result.passed).toBe(true);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("fails when 'member' appears in RSV template", () => {
    const dir = makeTmpDir();
    writeFile(dir, "schema.sql", `CHECK (role IN ('owner', 'admin', 'member'))`);
    const result = checkRoleConsistency(dir, "reservation_saas");
    expect(result.passed).toBe(false);
    expect(result.violations[0].forbiddenRole).toBe("member");
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("fails when 'operator' appears in RSV template", () => {
    const dir = makeTmpDir();
    writeFile(dir, "types.ts", `export type UserRole = 'owner' | 'admin' | 'operator';`);
    const result = checkRoleConsistency(dir, "reservation_saas");
    expect(result.passed).toBe(false);
    expect(result.violations[0].forbiddenRole).toBe("operator");
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("fails when 'sales' appears in RSV template", () => {
    const dir = makeTmpDir();
    writeFile(dir, "types.ts", `export type UserRole = 'owner' | 'admin' | 'sales';`);
    const result = checkRoleConsistency(dir, "reservation_saas");
    expect(result.passed).toBe(false);
    expect(result.violations[0].forbiddenRole).toBe("sales");
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe("checkRoleConsistency (general)", () => {
  it("ignores node_modules directory", () => {
    const dir = makeTmpDir();
    writeFile(dir, "node_modules/pkg/index.ts", `export type Role = 'member';`);
    const result = checkRoleConsistency(dir);
    const nmViolations = result.violations.filter((v) => v.file.includes("node_modules"));
    expect(nmViolations).toHaveLength(0);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("returns empty result for empty directory", () => {
    const dir = makeTmpDir();
    const result = checkRoleConsistency(dir);
    expect(result.passed).toBe(true);
    expect(result.filesScanned).toBe(0);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
