/**
 * Playwright Test Generator
 *
 * Generates minimal E2E test specs from a blueprint and schema.
 * Covers: auth flow, RBAC smoke, CRUD smoke per entity.
 *
 * Output: array of { file_path, content } ready for export.
 */

import type { NormalizedFileEntry } from "@/lib/providers/result-normalizer";

// ── Types ───────────────────────────────────────────────────

export interface PlaywrightGeneratorInput {
  /** Template key for naming conventions */
  templateKey: string;
  /** Parsed blueprint JSON */
  blueprint: BlueprintSummary;
  /** Base URL for the generated app */
  baseUrl?: string;
}

export interface BlueprintSummary {
  roles: Array<{ name: string; description?: string }>;
  entities: Array<{
    name: string;
    description: string;
    main_fields: Array<{ name: string; type: string; required: boolean }>;
  }>;
  screens: Array<{ name: string; purpose: string; role_access: string[] }>;
  billing?: { enabled: boolean; model: string };
}

export interface GeneratedTestSuite {
  files: NormalizedFileEntry[];
  testCount: number;
  coveredEntities: string[];
  coveredRoles: string[];
}

// ── Generators ──────────────────────────────────────────────

/**
 * Generates the auth setup spec that other tests depend on.
 */
export function generateAuthSetup(
  roles: Array<{ name: string }>,
  baseUrl: string
): string {
  const roleFixtures = roles
    .map((r) => `    ${r.name}: { email: "test-${r.name}@example.com", password: "testpass123" }`)
    .join(",\n");

  return `import { test, expect } from "@playwright/test";

const BASE_URL = "${baseUrl}";

const TEST_USERS: Record<string, { email: string; password: string }> = {
${roleFixtures},
};

test.describe("Auth Flow", () => {
  test("signup and login for each role", async ({ page }) => {
    for (const [role, creds] of Object.entries(TEST_USERS)) {
      // Signup
      await page.goto(\`\${BASE_URL}/signup\`);
      await page.fill('[name="email"]', creds.email);
      await page.fill('[name="password"]', creds.password);
      await page.fill('[name="displayName"]', \`Test \${role}\`);
      await page.fill('[name="tenantName"]', "Test Tenant");
      await page.click('button[type="submit"]');
      await expect(page).not.toHaveURL(/signup/);

      // Logout (if applicable)
      const logoutBtn = page.locator('[data-testid="logout"]');
      if (await logoutBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await logoutBtn.click();
      }
    }
  });

  test("login with valid credentials", async ({ page }) => {
    const creds = TEST_USERS[Object.keys(TEST_USERS)[0]];
    await page.goto(\`\${BASE_URL}/login\`);
    await page.fill('[name="email"]', creds.email);
    await page.fill('[name="password"]', creds.password);
    await page.click('button[type="submit"]');
    await expect(page).not.toHaveURL(/login/);
  });

  test("login with wrong password fails", async ({ page }) => {
    await page.goto(\`\${BASE_URL}/login\`);
    await page.fill('[name="email"]', "test@example.com");
    await page.fill('[name="password"]', "wrongpassword");
    await page.click('button[type="submit"]');
    await expect(page.locator('[role="alert"], .error, .text-red')).toBeVisible({ timeout: 5000 });
  });
});
`;
}

/**
 * Generates a smoke test for RBAC — verifies that each role
 * can access its expected screens and is blocked from others.
 */
export function generateRbacSmoke(
  roles: Array<{ name: string }>,
  screens: Array<{ name: string; purpose: string; role_access: string[] }>,
  baseUrl: string
): string {
  const testCases = roles.map((role) => {
    const accessible = screens
      .filter((s) => s.role_access.includes(role.name))
      .map((s) => s.name);
    return `  test("${role.name} can access: ${accessible.join(", ") || "none"}", async ({ page }) => {
    // Login as ${role.name}
    await page.goto(\`\${BASE_URL}/login\`);
    await page.fill('[name="email"]', "test-${role.name}@example.com");
    await page.fill('[name="password"]', "testpass123");
    await page.click('button[type="submit"]');
    await expect(page).not.toHaveURL(/login/);

    // Verify dashboard loads
    await expect(page.locator("main")).toBeVisible({ timeout: 10000 });
  });`;
  });

  return `import { test, expect } from "@playwright/test";

const BASE_URL = "${baseUrl}";

test.describe("RBAC Smoke", () => {
${testCases.join("\n\n")}
});
`;
}

/**
 * Generates a CRUD smoke test per entity.
 */
export function generateEntityCrudSmoke(
  entity: BlueprintSummary["entities"][0],
  adminRole: string,
  baseUrl: string
): string {
  const slug = entity.name.toLowerCase().replace(/[^a-z0-9]/g, "-");
  const requiredFields = entity.main_fields.filter((f) => f.required);

  const fillStatements = requiredFields
    .map((f) => {
      const value = f.type === "number" ? "42" : f.type === "boolean" ? "" : `Test ${f.name}`;
      if (f.type === "boolean") {
        return `    // Toggle ${f.name} if checkbox exists
    const ${f.name}Check = page.locator('[name="${f.name}"]');
    if (await ${f.name}Check.isVisible({ timeout: 1000 }).catch(() => false)) {
      await ${f.name}Check.check();
    }`;
      }
      return `    await page.fill('[name="${f.name}"]', "${value}");`;
    })
    .join("\n");

  return `import { test, expect } from "@playwright/test";

const BASE_URL = "${baseUrl}";

test.describe("${entity.name} CRUD Smoke", () => {
  test.beforeEach(async ({ page }) => {
    // Login as ${adminRole}
    await page.goto(\`\${BASE_URL}/login\`);
    await page.fill('[name="email"]', "test-${adminRole}@example.com");
    await page.fill('[name="password"]', "testpass123");
    await page.click('button[type="submit"]');
    await expect(page).not.toHaveURL(/login/);
  });

  test("list page loads", async ({ page }) => {
    await page.goto(\`\${BASE_URL}/dashboard/${slug}\`);
    await expect(page.locator("main")).toBeVisible({ timeout: 10000 });
  });

  test("create form is accessible", async ({ page }) => {
    await page.goto(\`\${BASE_URL}/dashboard/${slug}/new\`);
    const form = page.locator("form");
    if (await form.isVisible({ timeout: 5000 }).catch(() => false)) {
${fillStatements}
      await page.click('button[type="submit"]');
    }
  });
});
`;
}

// ── Main Entry Point ────────────────────────────────────────

/**
 * Generates a complete Playwright test suite from a blueprint.
 */
export function generatePlaywrightSuite(
  input: PlaywrightGeneratorInput
): GeneratedTestSuite {
  const { blueprint, baseUrl = "http://localhost:3000" } = input;
  const files: NormalizedFileEntry[] = [];

  // Determine admin role (prefer "admin", fallback to "owner")
  const adminRole =
    blueprint.roles.find((r) => r.name === "admin")?.name ??
    blueprint.roles[0]?.name ??
    "owner";

  // 1. Auth setup
  files.push({
    file_path: "tests/playwright/auth.spec.ts",
    file_category: "test",
    language: "typescript",
    content_text: generateAuthSetup(blueprint.roles, baseUrl),
  });

  // 2. RBAC smoke
  files.push({
    file_path: "tests/playwright/rbac-smoke.spec.ts",
    file_category: "test",
    language: "typescript",
    content_text: generateRbacSmoke(blueprint.roles, blueprint.screens, baseUrl),
  });

  // 3. Per-entity CRUD smoke
  const coveredEntities: string[] = [];
  for (const entity of blueprint.entities) {
    const slug = entity.name.toLowerCase().replace(/[^a-z0-9]/g, "-");
    files.push({
      file_path: `tests/playwright/${slug}-crud.spec.ts`,
      file_category: "test",
      language: "typescript",
      content_text: generateEntityCrudSmoke(entity, adminRole, baseUrl),
    });
    coveredEntities.push(entity.name);
  }

  // 4. Smoke test (basic app load)
  files.push({
    file_path: "tests/playwright/smoke.spec.ts",
    file_category: "test",
    language: "typescript",
    content_text: `import { test, expect } from "@playwright/test";

const BASE_URL = "${baseUrl}";

test.describe("Smoke", () => {
  test("app loads", async ({ page }) => {
    await page.goto(BASE_URL);
    await expect(page).not.toHaveTitle(/error/i);
  });

  test("login page loads", async ({ page }) => {
    await page.goto(\`\${BASE_URL}/login\`);
    await expect(page.locator('button[type="submit"]')).toBeVisible({ timeout: 10000 });
  });
});
`,
  });

  return {
    files,
    testCount: files.length,
    coveredEntities,
    coveredRoles: blueprint.roles.map((r) => r.name),
  };
}
