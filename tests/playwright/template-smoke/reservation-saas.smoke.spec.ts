import { test } from "@playwright/test";
import {
  navigateAndWait,
  expectNoCrash,
  expectMainContentVisible,
  expectInteractiveElements,
} from "./smoke-helpers";

/**
 * Reservation SaaS — Template-specific smoke tests
 *
 * Validates that reservation-specific UI paths render correctly.
 */

test.describe("reservation_saas smoke", () => {
  test("reservation-list-renders: reservation list page renders", async ({ page }) => {
    await navigateAndWait(page, "/reservations");
    await expectNoCrash(page);
    await expectMainContentVisible(page);
  });

  test("reservation-new-form: new reservation form accessible", async ({ page }) => {
    await navigateAndWait(page, "/reservations/new");
    await expectNoCrash(page);
    await expectInteractiveElements(page, 2);
  });
});
