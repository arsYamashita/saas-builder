/**
 * Role Consistency Check — Template-aware
 *
 * Scans generated files for forbidden role names.
 * Each template declares its allowed roles; anything else is forbidden.
 */

import * as fs from "fs";
import * as path from "path";

export interface RoleViolation {
  file: string;
  line: number;
  content: string;
  forbiddenRole: string;
}

export interface RoleConsistencyResult {
  passed: boolean;
  violations: RoleViolation[];
  filesScanned: number;
}

/** All known role names across all templates */
const ALL_KNOWN_ROLES = [
  "owner", "admin", "member", "operator", "staff", "sales",
  "editor", "moderator", "superadmin", "viewer", "affiliate_manager",
];

/**
 * Per-template allowed roles.
 * Any known role NOT in the allowed list is forbidden for that template.
 */
const TEMPLATE_ALLOWED_ROLES: Record<string, string[]> = {
  internal_admin_ops_saas: ["owner", "admin", "operator"],
  simple_crm_saas: ["owner", "admin", "sales"],
  community_membership_saas: ["owner", "admin", "member"],
  reservation_saas: ["owner", "admin", "staff"],
};

/** Default forbidden roles (when no template is specified) */
const DEFAULT_FORBIDDEN = ["member", "editor", "moderator", "superadmin", "viewer", "affiliate_manager"];

/**
 * Resolve forbidden roles for a template.
 */
function getForbiddenRoles(templateKey?: string): string[] {
  if (!templateKey || !TEMPLATE_ALLOWED_ROLES[templateKey]) {
    return DEFAULT_FORBIDDEN;
  }
  const allowed = new Set(TEMPLATE_ALLOWED_ROLES[templateKey]);
  return ALL_KNOWN_ROLES.filter((r) => !allowed.has(r));
}

function buildRolePatterns(role: string): RegExp[] {
  return [
    // Quoted role name in SQL CHECK or TS type: 'member', "member"
    new RegExp(`['"]${role}['"]`, "i"),
    // Role type union: | 'member'
    new RegExp(`\\|\\s*['"]${role}['"]`, "i"),
    // CHECK constraint: IN (...'member'...)
    new RegExp(`IN\\s*\\([^)]*'${role}'`, "i"),
  ];
}

function scanFile(filePath: string, relPath: string, forbiddenRoles: string[]): RoleViolation[] {
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n");
  const violations: RoleViolation[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const role of forbiddenRoles) {
      const patterns = buildRolePatterns(role);
      for (const pattern of patterns) {
        if (pattern.test(line)) {
          violations.push({
            file: relPath,
            line: i + 1,
            content: line.trim(),
            forbiddenRole: role,
          });
          break;
        }
      }
    }
  }

  return violations;
}

const SCANNABLE_EXTENSIONS = new Set([".ts", ".tsx", ".sql", ".md", ".json"]);

function collectFiles(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".next") continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectFiles(fullPath));
    } else if (SCANNABLE_EXTENSIONS.has(path.extname(entry.name))) {
      results.push(fullPath);
    }
  }
  return results;
}

/**
 * Check role consistency for a generated project directory.
 *
 * @param projectDir - The exported project directory to scan
 * @param templateKey - Optional template key for template-specific role validation
 * @returns RoleConsistencyResult with pass/fail and violation details
 */
export function checkRoleConsistency(
  projectDir: string,
  templateKey?: string
): RoleConsistencyResult {
  const forbiddenRoles = getForbiddenRoles(templateKey);
  const files = collectFiles(projectDir);
  const allViolations: RoleViolation[] = [];

  for (const file of files) {
    const relPath = path.relative(projectDir, file);
    const violations = scanFile(file, relPath, forbiddenRoles);
    allViolations.push(...violations);
  }

  return {
    passed: allViolations.length === 0,
    violations: allViolations,
    filesScanned: files.length,
  };
}
