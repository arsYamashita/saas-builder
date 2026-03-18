import { test } from "@playwright/test";
import {
  navigateAndWait,
  expectNoCrash,
  expectMainContentVisible,
  expectInteractiveElements,
} from "./smoke-helpers";

/**
 * Community Membership SaaS — Template-specific smoke tests
 *
 * Validates that community/member-specific UI paths render correctly.
 */

test.describe("community_membership_saas smoke", () => {
  test("community-area-renders: community/member area renders", async ({ page }) => {
    await navigateAndWait(page, "/community");
    await expectNoCrash(page);
    await expectMainContentVisible(page);
  });

  test("community-navigation: community-specific navigation works", async ({ page }) => {
    await navigateAndWait(page, "/members");
    await expectNoCrash(page);
    await expectInteractiveElements(page, 1);
  });
});
