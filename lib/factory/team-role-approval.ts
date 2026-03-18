/**
 * Team / Role-Based Approval v1
 *
 * Provides:
 *   1. Role definitions (owner, admin, reviewer, operator, viewer)
 *   2. Typed action model for factory operations
 *   3. Deterministic permission matrix
 *   4. Authorization checks (can / authorize)
 *   5. Actor resolution
 *   6. Permission report
 *
 * Conservative v1 — no external auth, no DB, static policy.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FactoryRole = "owner" | "admin" | "reviewer" | "operator" | "viewer";

export type FactoryAction =
  | "proposal.approve"
  | "proposal.reject"
  | "proposal.defer"
  | "change.preview"
  | "change.apply"
  | "policy.promote.dev_to_staging"
  | "policy.promote.staging_to_prod"
  | "rollback.preview"
  | "rollback.apply"
  | "marketplace.publish"
  | "marketplace.unpublish"
  | "marketplace.experimental"
  | "marketplace.adopt"
  | "marketplace.derive"
  | "orchestration.plan"
  | "orchestration.run"
  | "release.preview"
  | "release.promote.candidate_to_dev"
  | "release.promote.dev_to_staging"
  | "release.promote.staging_to_prod"
  | "dashboard.view"
  | "audit.view";

export interface FactoryActor {
  actorId: string;
  role: FactoryRole;
}

export interface AuthorizationResult {
  allowed: boolean;
  actor: FactoryActor;
  action: FactoryAction;
  reason: string;
}

export interface PermissionMatrixEntry {
  action: FactoryAction;
  owner: boolean;
  admin: boolean;
  reviewer: boolean;
  operator: boolean;
  viewer: boolean;
}

export interface RoleApprovalReport {
  matrix: PermissionMatrixEntry[];
  roles: FactoryRole[];
  actions: FactoryAction[];
  summary: {
    totalActions: number;
    rolesCount: number;
  };
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const ALL_ROLES: FactoryRole[] = [
  "owner",
  "admin",
  "reviewer",
  "operator",
  "viewer",
];

export const ALL_ACTIONS: FactoryAction[] = [
  "proposal.approve",
  "proposal.reject",
  "proposal.defer",
  "change.preview",
  "change.apply",
  "policy.promote.dev_to_staging",
  "policy.promote.staging_to_prod",
  "rollback.preview",
  "rollback.apply",
  "marketplace.publish",
  "marketplace.unpublish",
  "marketplace.experimental",
  "marketplace.adopt",
  "marketplace.derive",
  "orchestration.plan",
  "orchestration.run",
  "release.preview",
  "release.promote.candidate_to_dev",
  "release.promote.dev_to_staging",
  "release.promote.staging_to_prod",
  "dashboard.view",
  "audit.view",
];

// ---------------------------------------------------------------------------
// Permission matrix (static, code-defined)
// ---------------------------------------------------------------------------

const ROLE_PERMISSIONS: Record<FactoryRole, Set<FactoryAction>> = {
  owner: new Set<FactoryAction>(ALL_ACTIONS),

  admin: new Set<FactoryAction>([
    "proposal.approve",
    "proposal.reject",
    "proposal.defer",
    "change.preview",
    "change.apply",
    "policy.promote.dev_to_staging",
    "rollback.preview",
    "rollback.apply",
    "marketplace.publish",
    "marketplace.unpublish",
    "marketplace.experimental",
    "marketplace.adopt",
    "marketplace.derive",
    "orchestration.plan",
    "orchestration.run",
    "release.preview",
    "release.promote.candidate_to_dev",
    "release.promote.dev_to_staging",
    "dashboard.view",
    "audit.view",
  ]),

  reviewer: new Set<FactoryAction>([
    "proposal.approve",
    "proposal.reject",
    "proposal.defer",
    "change.preview",
    "rollback.preview",
    "orchestration.plan",
    "release.preview",
    "dashboard.view",
    "audit.view",
  ]),

  operator: new Set<FactoryAction>([
    "change.preview",
    "change.apply",
    "policy.promote.dev_to_staging",
    "rollback.preview",
    "rollback.apply",
    "marketplace.adopt",
    "marketplace.derive",
    "orchestration.plan",
    "orchestration.run",
    "release.preview",
    "release.promote.candidate_to_dev",
    "dashboard.view",
    "audit.view",
  ]),

  viewer: new Set<FactoryAction>([
    "dashboard.view",
    "audit.view",
    "change.preview",
    "rollback.preview",
    "orchestration.plan",
    "release.preview",
  ]),
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resolve actor role. For v1, accepts role directly.
 * Future versions could look up from config/JWT.
 */
export function resolveActorRole(
  actorId: string,
  role: FactoryRole,
): FactoryActor {
  return { actorId, role };
}

/**
 * Check if an actor can perform a factory action (boolean).
 */
export function canPerformFactoryAction(
  actor: FactoryActor,
  action: FactoryAction,
): boolean {
  const permissions = ROLE_PERMISSIONS[actor.role];
  return permissions.has(action);
}

/**
 * Authorize a factory action. Returns a deterministic result
 * with reason for logging/audit.
 */
export function authorizeFactoryAction(
  actor: FactoryActor,
  action: FactoryAction,
): AuthorizationResult {
  const allowed = canPerformFactoryAction(actor, action);

  if (allowed) {
    return {
      allowed: true,
      actor,
      action,
      reason: `Role "${actor.role}" is authorized for "${action}"`,
    };
  }

  return {
    allowed: false,
    actor,
    action,
    reason: `Role "${actor.role}" is not authorized for "${action}"`,
  };
}

/**
 * Build the full permission matrix for all roles and actions.
 */
export function buildPermissionMatrix(): PermissionMatrixEntry[] {
  return ALL_ACTIONS.map((action) => ({
    action,
    owner: ROLE_PERMISSIONS.owner.has(action),
    admin: ROLE_PERMISSIONS.admin.has(action),
    reviewer: ROLE_PERMISSIONS.reviewer.has(action),
    operator: ROLE_PERMISSIONS.operator.has(action),
    viewer: ROLE_PERMISSIONS.viewer.has(action),
  }));
}

/**
 * Build a role approval report with the full matrix.
 */
export function buildRoleApprovalReport(): RoleApprovalReport {
  const matrix = buildPermissionMatrix();
  return {
    matrix,
    roles: [...ALL_ROLES],
    actions: [...ALL_ACTIONS],
    summary: {
      totalActions: ALL_ACTIONS.length,
      rolesCount: ALL_ROLES.length,
    },
    generatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

export function formatPermissionMatrix(
  matrix: PermissionMatrixEntry[],
): string {
  const lines: string[] = [];
  const hr = "─".repeat(90);

  lines.push(hr);
  lines.push("  FACTORY PERMISSION MATRIX");
  lines.push(hr);

  const header = "  " +
    "Action".padEnd(38) +
    "Owner".padEnd(8) +
    "Admin".padEnd(8) +
    "Reviewer".padEnd(10) +
    "Operator".padEnd(10) +
    "Viewer".padEnd(8);
  lines.push(header);
  lines.push("  " + "─".repeat(86));

  for (const entry of matrix) {
    const check = (v: boolean) => (v ? "Yes" : "—");
    const line = "  " +
      entry.action.padEnd(38) +
      check(entry.owner).padEnd(8) +
      check(entry.admin).padEnd(8) +
      check(entry.reviewer).padEnd(10) +
      check(entry.operator).padEnd(10) +
      check(entry.viewer).padEnd(8);
    lines.push(line);
  }

  lines.push(hr);
  return lines.join("\n");
}

export function formatRoleApprovalReport(
  report: RoleApprovalReport,
): string {
  const lines: string[] = [];
  lines.push(formatPermissionMatrix(report.matrix));
  lines.push("");
  lines.push(
    `  Roles: ${report.summary.rolesCount}  |  Actions: ${report.summary.totalActions}`,
  );
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Helper: map subsystem actions to FactoryAction for external callers
// ---------------------------------------------------------------------------

/** Map a proposal decision to its FactoryAction */
export function proposalDecisionToAction(
  decision: string,
): FactoryAction | null {
  switch (decision) {
    case "approved": return "proposal.approve";
    case "rejected": return "proposal.reject";
    case "deferred": return "proposal.defer";
    default: return null;
  }
}
