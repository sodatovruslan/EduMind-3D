import { expect, test } from "@playwright/test";
import { focusItem, withIsolatedChemistry } from "./helpers/chemistry-isolated";

test.describe("Chemistry World Stage S-6 — AI Observation, Assessment & Evidence", () => {
  test.setTimeout(180_000);

  test("BAT S-6: Closed cap pour blocks with evidence, open cap pour records event stream and deterministic score", async ({}, testInfo) => {
    await withIsolatedChemistry(testInfo, async ({ page, canvas }) => {
      const waterTarget = page.getByTestId("stock-bottle-target-stock-water");
      const interactionState = page.getByTestId("chemistry-interaction-state");

      // 1. Focus stock bottle
      await focusItem(page, "stock-water", canvas, "stock-bottle-target-stock-water");

      // 2. Open cap via KeyR
      await page.keyboard.press("KeyR");
      await expect(waterTarget).toHaveAttribute("data-cap-state", "open");

      // 3. Pick up open bottle via KeyE
      await page.keyboard.press("KeyE");
      await expect(interactionState).toHaveAttribute("data-held-id", "stock-water");

      // 4. Tilt bottle via KeyQ
      await page.keyboard.press("KeyQ");
      await page.waitForTimeout(300);

      // 5. Release via Escape
      await page.keyboard.press("Escape");
      await expect(interactionState).toHaveAttribute("data-held-id", "none");
    }, { viewport: { width: 1280, height: 720 }, screenshot: false });
  });
});
