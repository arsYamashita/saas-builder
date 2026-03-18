import { test } from "@playwright/test";
import {
  navigateAndWait,
  expectNoCrash,
  expectMainContentVisible,
  expectInteractiveElements,
} from "./smoke-helpers";

/**
 * Internal Admin Ops SaaS — Template-specific smoke tests
 *
 * Validates that admin operations UI paths render correctly.
 */

test.describe("internal_admin_ops_saas smoke", () => {
  test("admin-dashboard-renders: operational dashboard renders", async ({ page }) => {
    await navigateAndWait(page, "/operations");
    await expectNoCrash(page);
    await expectMainContentVisible(page);
  });

  test("admin-task-entry: admin task/workflow entry accessible", async ({ page }) => {
    await navigateAndWait(page, "/tasks");
    await expectNoCrash(page);
    await expectInteractiveElements(page, 1);
  });
});
