import { test } from "@playwright/test";
import {
  navigateAndWait,
  expectNoCrash,
  expectMainContentVisible,
  expectInteractiveElements,
} from "./smoke-helpers";

/**
 * Simple CRM SaaS — Template-specific smoke tests
 *
 * Validates that CRM-specific UI paths render correctly.
 */

test.describe("simple_crm_saas smoke", () => {
  test("crm-lead-list: lead/customer list renders", async ({ page }) => {
    await navigateAndWait(page, "/leads");
    await expectNoCrash(page);
    await expectMainContentVisible(page);
  });

  test("crm-detail-flow: CRM detail/create flow accessible", async ({ page }) => {
    await navigateAndWait(page, "/leads/new");
    await expectNoCrash(page);
    await expectInteractiveElements(page, 2);
  });
});
