/**
 * reservation_saas — RLS Policy Verification Test
 *
 * Programmatic verification of schema.sql RLS completeness.
 * Substitutes for Supabase runtime verification when no live DB is available.
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const SCHEMA_PATH = path.resolve(
  __dirname,
  "../../../exports/projects/6c128e51-c9d7-4097-a750-f2c644c67202/supabase/schema.sql"
);

const schemaExists = fs.existsSync(SCHEMA_PATH);
const schema = schemaExists ? fs.readFileSync(SCHEMA_PATH, "utf-8") : "";
const lines = schema.split("\n");

// ============================================================
// Helpers
// ============================================================

function findPolicy(name: string): string | null {
  const idx = lines.findIndex((l) => l.includes(`CREATE POLICY ${name}`));
  if (idx === -1) return null;
  // Collect the full statement until the semicolon
  let stmt = "";
  for (let i = idx; i < lines.length; i++) {
    stmt += lines[i] + "\n";
    if (lines[i].includes(";")) break;
  }
  return stmt;
}

function extractPolicies(): {
  name: string;
  table: string;
  operation: string;
}[] {
  const re = /CREATE POLICY (\w+) ON (\w+) FOR (\w+)/g;
  const results: { name: string; table: string; operation: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(schema)) !== null) {
    results.push({ name: m[1], table: m[2], operation: m[3] });
  }
  return results;
}

// ============================================================
// 1. RLS ENABLE on all 7 tables
// ============================================================

const RLS_TABLES = [
  "tenants",
  "tenant_users",
  "services",
  "customers",
  "reservations",
  "activity_logs",
  "subscriptions",
];

const describeIfSchema = schemaExists ? describe : describe.skip;

describeIfSchema("reservation_saas RLS — ENABLE", () => {
  for (const table of RLS_TABLES) {
    it(`${table} has RLS enabled`, () => {
      expect(schema).toContain(
        `ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`
      );
    });
  }
});

// ============================================================
// 2. 21 CREATE POLICY statements
// ============================================================

const EXPECTED_POLICIES: { name: string; table: string; op: string }[] = [
  // tenants (3)
  { name: "tenants_select", table: "tenants", op: "SELECT" },
  { name: "tenants_insert", table: "tenants", op: "INSERT" },
  { name: "tenants_update", table: "tenants", op: "UPDATE" },
  // tenant_users (4)
  { name: "tenant_users_select", table: "tenant_users", op: "SELECT" },
  { name: "tenant_users_insert", table: "tenant_users", op: "INSERT" },
  { name: "tenant_users_update", table: "tenant_users", op: "UPDATE" },
  { name: "tenant_users_delete", table: "tenant_users", op: "DELETE" },
  // services (3)
  { name: "services_select", table: "services", op: "SELECT" },
  { name: "services_insert", table: "services", op: "INSERT" },
  { name: "services_update", table: "services", op: "UPDATE" },
  // customers (3)
  { name: "customers_select", table: "customers", op: "SELECT" },
  { name: "customers_insert", table: "customers", op: "INSERT" },
  { name: "customers_update", table: "customers", op: "UPDATE" },
  // reservations (3)
  { name: "reservations_select", table: "reservations", op: "SELECT" },
  { name: "reservations_insert", table: "reservations", op: "INSERT" },
  { name: "reservations_update", table: "reservations", op: "UPDATE" },
  // activity_logs (2)
  { name: "activity_logs_select", table: "activity_logs", op: "SELECT" },
  { name: "activity_logs_insert", table: "activity_logs", op: "INSERT" },
  // subscriptions (3)
  { name: "subscriptions_select", table: "subscriptions", op: "SELECT" },
  { name: "subscriptions_insert", table: "subscriptions", op: "INSERT" },
  { name: "subscriptions_update", table: "subscriptions", op: "UPDATE" },
];

describeIfSchema("reservation_saas RLS — 21 policies exist", () => {
  it("total policy count is 21", () => {
    const policies = extractPolicies();
    expect(policies).toHaveLength(21);
  });

  for (const { name, table, op } of EXPECTED_POLICIES) {
    it(`${name} ON ${table} FOR ${op}`, () => {
      const stmt = findPolicy(name);
      expect(stmt).not.toBeNull();
      expect(stmt).toContain(`ON ${table}`);
      expect(stmt).toContain(`FOR ${op}`);
    });
  }
});

// ============================================================
// 3. Helper functions
// ============================================================

const EXPECTED_FUNCTIONS = [
  "is_tenant_member",
  "has_tenant_role",
  "get_user_role_in_tenant",
  "check_user_permission",
  "update_updated_at",
];

describeIfSchema("reservation_saas RLS — helper functions", () => {
  for (const fn of EXPECTED_FUNCTIONS) {
    it(`function ${fn} exists`, () => {
      expect(schema).toContain(`CREATE OR REPLACE FUNCTION ${fn}`);
    });
  }

  it("is_tenant_member is SECURITY DEFINER STABLE", () => {
    const idx = lines.findIndex((l) => l.includes("FUNCTION is_tenant_member"));
    const block = lines.slice(idx, idx + 10).join("\n");
    expect(block).toContain("SECURITY DEFINER");
    expect(block).toContain("STABLE");
  });

  it("has_tenant_role is SECURITY DEFINER STABLE", () => {
    const idx = lines.findIndex((l) => l.includes("FUNCTION has_tenant_role"));
    const block = lines.slice(idx, idx + 15).join("\n");
    expect(block).toContain("SECURITY DEFINER");
    expect(block).toContain("STABLE");
  });

  it("has_tenant_role handles owner > admin > staff hierarchy", () => {
    const idx = lines.findIndex((l) => l.includes("FUNCTION has_tenant_role"));
    const block = lines.slice(idx, idx + 20).join("\n");
    expect(block).toContain("'staff'");
    expect(block).toContain("'admin'");
    expect(block).toContain("'owner'");
    // staff includes all three roles
    expect(block).toMatch(/staff[\s\S]*role IN \('owner', 'admin', 'staff'\)/);
    // admin includes owner + admin
    expect(block).toMatch(/admin[\s\S]*role IN \('owner', 'admin'\)/);
    // owner is owner only
    expect(block).toMatch(/owner[\s\S]*role = 'owner'/);
  });
});

// ============================================================
// 4. Tenant isolation — every domain table uses tenant_id check
// ============================================================

const DOMAIN_TABLES = [
  "services",
  "customers",
  "reservations",
  "activity_logs",
  "subscriptions",
];

describeIfSchema("reservation_saas RLS — tenant isolation", () => {
  for (const table of DOMAIN_TABLES) {
    it(`${table} SELECT policy checks tenant membership`, () => {
      const stmt = findPolicy(`${table}_select`);
      expect(stmt).not.toBeNull();
      expect(stmt).toMatch(/is_tenant_member|has_tenant_role|tenant_id/);
    });
  }
});

// ============================================================
// 5. Staff isolation — reservations filtered by staff_id
// ============================================================

describeIfSchema("reservation_saas RLS — staff isolation", () => {
  it("reservations_select limits staff to staff_id = auth.uid()", () => {
    const stmt = findPolicy("reservations_select")!;
    expect(stmt).toContain("staff_id = auth.uid()");
    expect(stmt).toContain("has_tenant_role(tenant_id, 'admin')");
  });

  it("reservations_update limits staff to staff_id = auth.uid()", () => {
    const stmt = findPolicy("reservations_update")!;
    expect(stmt).toContain("staff_id = auth.uid()");
    expect(stmt).toContain("has_tenant_role(tenant_id, 'admin')");
  });

  it("customers_update limits staff to created_by = auth.uid()", () => {
    const stmt = findPolicy("customers_update")!;
    expect(stmt).toContain("created_by = auth.uid()");
    expect(stmt).toContain("has_tenant_role(tenant_id, 'admin')");
  });

  it("activity_logs_select blocks staff (admin+ only)", () => {
    const stmt = findPolicy("activity_logs_select")!;
    expect(stmt).toContain("has_tenant_role(tenant_id, 'admin')");
    expect(stmt).not.toContain("is_tenant_member");
  });

  it("subscriptions_select blocks staff (admin+ only)", () => {
    const stmt = findPolicy("subscriptions_select")!;
    expect(stmt).toContain("has_tenant_role(tenant_id, 'admin')");
    expect(stmt).not.toContain("is_tenant_member");
  });
});

// ============================================================
// 6. Owner-only operations
// ============================================================

describeIfSchema("reservation_saas RLS — owner-only operations", () => {
  it("tenant_users_delete requires owner", () => {
    const stmt = findPolicy("tenant_users_delete")!;
    expect(stmt).toContain("has_tenant_role(tenant_id, 'owner')");
  });

  it("tenants_update requires owner (owner_user_id)", () => {
    const stmt = findPolicy("tenants_update")!;
    expect(stmt).toContain("owner_user_id = auth.uid()");
  });

  it("subscriptions_insert requires owner", () => {
    const stmt = findPolicy("subscriptions_insert")!;
    expect(stmt).toContain("has_tenant_role(tenant_id, 'owner')");
  });

  it("subscriptions_update requires owner", () => {
    const stmt = findPolicy("subscriptions_update")!;
    expect(stmt).toContain("has_tenant_role(tenant_id, 'owner')");
  });
});

// ============================================================
// 7. Reservation status flow — CHECK constraints
// ============================================================

describeIfSchema("reservation_saas — reservation status flow", () => {
  it("status CHECK allows pending, confirmed, completed, cancelled", () => {
    expect(schema).toContain(
      "status IN ('pending', 'confirmed', 'completed', 'cancelled')"
    );
  });

  it("time ordering constraint (end_time > start_time)", () => {
    expect(schema).toContain("end_time > start_time");
  });

  it("cancellation fields exist (cancelled_at, cancelled_by, cancellation_reason)", () => {
    expect(schema).toContain("cancelled_at TIMESTAMPTZ");
    expect(schema).toContain("cancelled_by UUID");
    expect(schema).toContain("cancellation_reason TEXT");
  });
});

// ============================================================
// 8. No TODO / placeholder / incomplete patterns
// ============================================================

describeIfSchema("reservation_saas RLS — no placeholders", () => {
  it("no TODO comments", () => {
    const todos = lines.filter((l) => /TODO/i.test(l));
    expect(todos).toHaveLength(0);
  });

  it('no "same pattern" placeholders', () => {
    const placeholders = lines.filter((l) =>
      /same pattern|implement.*pattern/i.test(l)
    );
    expect(placeholders).toHaveLength(0);
  });

  it("no placeholder comments", () => {
    const placeholders = lines.filter((l) => /placeholder/i.test(l));
    expect(placeholders).toHaveLength(0);
  });
});

// ============================================================
// 9. Permission matrix consistency (app vs DB)
// ============================================================

describeIfSchema("reservation_saas — permission matrix consistency", () => {
  const PERMS_PATH = path.resolve(
    __dirname,
    "../../../exports/projects/6c128e51-c9d7-4097-a750-f2c644c67202/src/lib/permissions/check-permission.ts"
  );
  const permsSource = fs.existsSync(PERMS_PATH)
    ? fs.readFileSync(PERMS_PATH, "utf-8")
    : "";

  // Staff permissions in app
  it("app staff has services:read", () => {
    expect(permsSource).toMatch(/staff[\s\S]*services:read/);
  });

  it("app staff does NOT have services:write", () => {
    // staff array should not contain services:write
    const staffMatch = permsSource.match(/staff:\s*\[([\s\S]*?)\]/);
    expect(staffMatch).not.toBeNull();
    expect(staffMatch![1]).not.toContain("services:write");
  });

  it("app staff has reservations:read and reservations:write", () => {
    const staffMatch = permsSource.match(/staff:\s*\[([\s\S]*?)\]/);
    expect(staffMatch![1]).toContain("reservations:read");
    expect(staffMatch![1]).toContain("reservations:write");
  });

  it("app staff has customers:read and customers:write", () => {
    const staffMatch = permsSource.match(/staff:\s*\[([\s\S]*?)\]/);
    expect(staffMatch![1]).toContain("customers:read");
    expect(staffMatch![1]).toContain("customers:write");
  });

  it("app staff does NOT have settings:read", () => {
    const staffMatch = permsSource.match(/staff:\s*\[([\s\S]*?)\]/);
    expect(staffMatch![1]).not.toContain("settings:read");
  });

  // DB permission function consistency
  it("DB check_user_permission grants staff services:read", () => {
    expect(schema).toMatch(/staff[\s\S]*services:read/);
  });

  it("DB check_user_permission denies admin settings:write", () => {
    expect(schema).toContain("p_permission NOT LIKE 'settings:write%'");
  });

  // Cross-layer: RLS matches app permissions for staff
  it("RLS services: staff can SELECT (member) but not INSERT/UPDATE (admin+)", () => {
    const sel = findPolicy("services_select")!;
    expect(sel).toContain("is_tenant_member");
    const ins = findPolicy("services_insert")!;
    expect(ins).toContain("has_tenant_role(tenant_id, 'admin')");
    const upd = findPolicy("services_update")!;
    expect(upd).toContain("has_tenant_role(tenant_id, 'admin')");
  });

  it("RLS reservations: staff can SELECT/UPDATE own (staff_id), INSERT any", () => {
    const sel = findPolicy("reservations_select")!;
    expect(sel).toContain("staff_id = auth.uid()");
    const upd = findPolicy("reservations_update")!;
    expect(upd).toContain("staff_id = auth.uid()");
    const ins = findPolicy("reservations_insert")!;
    expect(ins).toContain("is_tenant_member");
  });
});
