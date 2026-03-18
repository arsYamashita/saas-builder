import { describe, it, expect } from "vitest";
import {
  resolveActorRole,
  canPerformFactoryAction,
  authorizeFactoryAction,
  buildPermissionMatrix,
  buildRoleApprovalReport,
  formatPermissionMatrix,
  formatRoleApprovalReport,
  proposalDecisionToAction,
  ALL_ROLES,
  ALL_ACTIONS,
  type FactoryActor,
  type FactoryAction,
  type FactoryRole,
} from "../team-role-approval";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function actor(role: FactoryRole, id: string = "test-user"): FactoryActor {
  return resolveActorRole(id, role);
}

// ---------------------------------------------------------------------------
// 1. Owner has full access
// ---------------------------------------------------------------------------

describe("owner — full access", () => {
  it("can perform every action", () => {
    const owner = actor("owner");
    for (const action of ALL_ACTIONS) {
      expect(canPerformFactoryAction(owner, action)).toBe(true);
    }
  });

  it("authorize returns allowed for all actions", () => {
    const owner = actor("owner");
    for (const action of ALL_ACTIONS) {
      const result = authorizeFactoryAction(owner, action);
      expect(result.allowed).toBe(true);
      expect(result.reason).toContain("authorized");
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Admin can approve and publish
// ---------------------------------------------------------------------------

describe("admin — approve and publish", () => {
  it("can approve proposals", () => {
    const a = actor("admin");
    expect(canPerformFactoryAction(a, "proposal.approve")).toBe(true);
    expect(canPerformFactoryAction(a, "proposal.reject")).toBe(true);
    expect(canPerformFactoryAction(a, "proposal.defer")).toBe(true);
  });

  it("can publish marketplace templates", () => {
    const a = actor("admin");
    expect(canPerformFactoryAction(a, "marketplace.publish")).toBe(true);
    expect(canPerformFactoryAction(a, "marketplace.unpublish")).toBe(true);
    expect(canPerformFactoryAction(a, "marketplace.experimental")).toBe(true);
  });

  it("can apply changes and promote dev→staging", () => {
    const a = actor("admin");
    expect(canPerformFactoryAction(a, "change.apply")).toBe(true);
    expect(canPerformFactoryAction(a, "policy.promote.dev_to_staging")).toBe(true);
  });

  it("cannot promote staging→prod", () => {
    const a = actor("admin");
    expect(canPerformFactoryAction(a, "policy.promote.staging_to_prod")).toBe(false);
  });

  it("can rollback", () => {
    const a = actor("admin");
    expect(canPerformFactoryAction(a, "rollback.apply")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3. Reviewer can approve but cannot apply/promote/rollback
// ---------------------------------------------------------------------------

describe("reviewer — approve only, no mutations", () => {
  it("can approve/reject/defer proposals", () => {
    const r = actor("reviewer");
    expect(canPerformFactoryAction(r, "proposal.approve")).toBe(true);
    expect(canPerformFactoryAction(r, "proposal.reject")).toBe(true);
    expect(canPerformFactoryAction(r, "proposal.defer")).toBe(true);
  });

  it("can preview changes and rollbacks", () => {
    const r = actor("reviewer");
    expect(canPerformFactoryAction(r, "change.preview")).toBe(true);
    expect(canPerformFactoryAction(r, "rollback.preview")).toBe(true);
  });

  it("cannot apply changes", () => {
    const r = actor("reviewer");
    expect(canPerformFactoryAction(r, "change.apply")).toBe(false);
  });

  it("cannot promote", () => {
    const r = actor("reviewer");
    expect(canPerformFactoryAction(r, "policy.promote.dev_to_staging")).toBe(false);
    expect(canPerformFactoryAction(r, "policy.promote.staging_to_prod")).toBe(false);
  });

  it("cannot rollback", () => {
    const r = actor("reviewer");
    expect(canPerformFactoryAction(r, "rollback.apply")).toBe(false);
  });

  it("cannot publish marketplace", () => {
    const r = actor("reviewer");
    expect(canPerformFactoryAction(r, "marketplace.publish")).toBe(false);
    expect(canPerformFactoryAction(r, "marketplace.unpublish")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 4. Operator — restricted non-prod operational access
// ---------------------------------------------------------------------------

describe("operator — restricted ops", () => {
  it("can apply changes and preview", () => {
    const o = actor("operator");
    expect(canPerformFactoryAction(o, "change.preview")).toBe(true);
    expect(canPerformFactoryAction(o, "change.apply")).toBe(true);
  });

  it("can promote dev→staging only", () => {
    const o = actor("operator");
    expect(canPerformFactoryAction(o, "policy.promote.dev_to_staging")).toBe(true);
    expect(canPerformFactoryAction(o, "policy.promote.staging_to_prod")).toBe(false);
  });

  it("can rollback", () => {
    const o = actor("operator");
    expect(canPerformFactoryAction(o, "rollback.preview")).toBe(true);
    expect(canPerformFactoryAction(o, "rollback.apply")).toBe(true);
  });

  it("can record adoption/derivation intents", () => {
    const o = actor("operator");
    expect(canPerformFactoryAction(o, "marketplace.adopt")).toBe(true);
    expect(canPerformFactoryAction(o, "marketplace.derive")).toBe(true);
  });

  it("cannot approve proposals", () => {
    const o = actor("operator");
    expect(canPerformFactoryAction(o, "proposal.approve")).toBe(false);
    expect(canPerformFactoryAction(o, "proposal.reject")).toBe(false);
    expect(canPerformFactoryAction(o, "proposal.defer")).toBe(false);
  });

  it("cannot publish marketplace", () => {
    const o = actor("operator");
    expect(canPerformFactoryAction(o, "marketplace.publish")).toBe(false);
    expect(canPerformFactoryAction(o, "marketplace.unpublish")).toBe(false);
    expect(canPerformFactoryAction(o, "marketplace.experimental")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 5. Viewer is read-only
// ---------------------------------------------------------------------------

describe("viewer — read-only", () => {
  it("can view dashboard and audit", () => {
    const v = actor("viewer");
    expect(canPerformFactoryAction(v, "dashboard.view")).toBe(true);
    expect(canPerformFactoryAction(v, "audit.view")).toBe(true);
  });

  it("can preview changes and rollbacks", () => {
    const v = actor("viewer");
    expect(canPerformFactoryAction(v, "change.preview")).toBe(true);
    expect(canPerformFactoryAction(v, "rollback.preview")).toBe(true);
  });

  it("cannot perform any mutation", () => {
    const v = actor("viewer");
    const mutations: FactoryAction[] = [
      "proposal.approve",
      "proposal.reject",
      "proposal.defer",
      "change.apply",
      "policy.promote.dev_to_staging",
      "policy.promote.staging_to_prod",
      "rollback.apply",
      "marketplace.publish",
      "marketplace.unpublish",
      "marketplace.experimental",
      "marketplace.adopt",
      "marketplace.derive",
    ];
    for (const action of mutations) {
      expect(canPerformFactoryAction(v, action)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// 6. Unauthorized actions are blocked with no mutation
// ---------------------------------------------------------------------------

describe("authorizeFactoryAction — blocked actions", () => {
  it("returns allowed=false with reason for unauthorized action", () => {
    const v = actor("viewer");
    const result = authorizeFactoryAction(v, "change.apply");
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("not authorized");
    expect(result.reason).toContain("viewer");
    expect(result.reason).toContain("change.apply");
  });

  it("returns consistent actor and action in result", () => {
    const r = actor("reviewer", "reviewer-1");
    const result = authorizeFactoryAction(r, "rollback.apply");
    expect(result.actor.actorId).toBe("reviewer-1");
    expect(result.actor.role).toBe("reviewer");
    expect(result.action).toBe("rollback.apply");
    expect(result.allowed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 7. Authorized actions proceed correctly
// ---------------------------------------------------------------------------

describe("authorizeFactoryAction — allowed actions", () => {
  it("returns allowed=true with reason for authorized action", () => {
    const a = actor("admin");
    const result = authorizeFactoryAction(a, "proposal.approve");
    expect(result.allowed).toBe(true);
    expect(result.reason).toContain("authorized");
    expect(result.actor.actorId).toBe("test-user");
    expect(result.action).toBe("proposal.approve");
  });
});

// ---------------------------------------------------------------------------
// 8. Action histories record actorId and role
// ---------------------------------------------------------------------------

describe("resolveActorRole", () => {
  it("creates actor with correct id and role", () => {
    const a = resolveActorRole("admin-user-1", "admin");
    expect(a.actorId).toBe("admin-user-1");
    expect(a.role).toBe("admin");
  });

  it("actor identity is preserved in authorization result", () => {
    const a = resolveActorRole("my-actor", "operator");
    const result = authorizeFactoryAction(a, "change.apply");
    expect(result.actor.actorId).toBe("my-actor");
    expect(result.actor.role).toBe("operator");
  });
});

// ---------------------------------------------------------------------------
// 9. Permission matrix is deterministic
// ---------------------------------------------------------------------------

describe("buildPermissionMatrix — determinism", () => {
  it("produces same matrix on repeated calls", () => {
    const m1 = buildPermissionMatrix();
    const m2 = buildPermissionMatrix();

    expect(m1.length).toBe(m2.length);
    for (let i = 0; i < m1.length; i++) {
      expect(m1[i]!.action).toBe(m2[i]!.action);
      expect(m1[i]!.owner).toBe(m2[i]!.owner);
      expect(m1[i]!.admin).toBe(m2[i]!.admin);
      expect(m1[i]!.reviewer).toBe(m2[i]!.reviewer);
      expect(m1[i]!.operator).toBe(m2[i]!.operator);
      expect(m1[i]!.viewer).toBe(m2[i]!.viewer);
    }
  });

  it("covers all actions", () => {
    const matrix = buildPermissionMatrix();
    expect(matrix.length).toBe(ALL_ACTIONS.length);
    const matrixActions = matrix.map((e) => e.action);
    for (const action of ALL_ACTIONS) {
      expect(matrixActions).toContain(action);
    }
  });

  it("owner has all true", () => {
    const matrix = buildPermissionMatrix();
    for (const entry of matrix) {
      expect(entry.owner).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// 10. Report and formatting
// ---------------------------------------------------------------------------

describe("buildRoleApprovalReport", () => {
  it("produces summary counts", () => {
    const report = buildRoleApprovalReport();
    expect(report.summary.totalActions).toBe(ALL_ACTIONS.length);
    expect(report.summary.rolesCount).toBe(ALL_ROLES.length);
    expect(report.roles).toEqual(ALL_ROLES);
    expect(report.actions).toEqual(ALL_ACTIONS);
    expect(report.generatedAt).toBeDefined();
  });
});

describe("formatPermissionMatrix", () => {
  it("produces readable text output", () => {
    const matrix = buildPermissionMatrix();
    const text = formatPermissionMatrix(matrix);

    expect(text).toContain("FACTORY PERMISSION MATRIX");
    expect(text).toContain("proposal.approve");
    expect(text).toContain("Owner");
    expect(text).toContain("Admin");
    expect(text).toContain("Viewer");
  });
});

describe("formatRoleApprovalReport", () => {
  it("includes summary line", () => {
    const report = buildRoleApprovalReport();
    const text = formatRoleApprovalReport(report);
    expect(text).toContain("Roles:");
    expect(text).toContain("Actions:");
  });
});

// ---------------------------------------------------------------------------
// 11. Helper: proposalDecisionToAction
// ---------------------------------------------------------------------------

describe("proposalDecisionToAction", () => {
  it("maps decisions correctly", () => {
    expect(proposalDecisionToAction("approved")).toBe("proposal.approve");
    expect(proposalDecisionToAction("rejected")).toBe("proposal.reject");
    expect(proposalDecisionToAction("deferred")).toBe("proposal.defer");
    expect(proposalDecisionToAction("unknown")).toBeNull();
  });
});
