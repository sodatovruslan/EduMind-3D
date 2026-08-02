import { expect, test } from "@playwright/test";
import {
  aimAtFreeTablePoint,
  bringProjectedTargetIntoCanvas,
  projectedClickEscapeAndPlace,
  projectedCenter,
  withIsolatedChemistry,
} from "./helpers/chemistry-isolated";

test.describe("S-2.5 equipment", () => {
  test.setTimeout(120_000);

  test("burner legacy toggle and safety guard", async ({}, testInfo) => {
    test.setTimeout(90_000);
    await withIsolatedChemistry(testInfo, async ({ page, canvas }) => {
      const state = page.getByTestId("chemistry-interaction-state");
      await bringProjectedTargetIntoCanvas(page, canvas, "interactable-target-burner-1");
      const burnerTarget = await projectedCenter(page, "interactable-target-burner-1");
      await page.mouse.click(burnerTarget.x, burnerTarget.y);
      await expect(state).toHaveAttribute("data-dragging-id", "none");
      await expect(state).toHaveAttribute("data-focused-id", "burner-1");
      const toggleState = page.getByTestId("burner-toggle-burner-1");
      let toggle = await projectedCenter(page, "burner-toggle-burner-1");
      if ((await toggleState.getAttribute("data-is-on")) !== "true") {
        await page.mouse.click(toggle.x, toggle.y);
      }
      await expect(toggleState).toHaveAttribute("data-is-on", "true");
      await expect(page.getByText("Сначала выключите горелку", { exact: true })).toBeVisible();
      await page.keyboard.press("KeyE");
      await expect(state).toHaveAttribute("data-held-id", "none");

      toggle = await projectedCenter(page, "burner-toggle-burner-1");
      await page.mouse.click(toggle.x, toggle.y);
      await expect(toggleState).toHaveAttribute("data-is-on", "false");
      await expect(page.getByText("Дождитесь, пока горелка остынет", { exact: true })).toBeVisible();
      await page.waitForTimeout(5_000);
      await expect(page.getByText("E — Взять: Горелка", { exact: true })).toBeVisible();
      await page.keyboard.press("KeyE");
      await expect(state).toHaveAttribute("data-held-id", "burner-1");
      await aimAtFreeTablePoint(page, canvas);
      await page.keyboard.press("KeyE");
      await expect(state).toHaveAttribute("data-held-id", "none");
    }, { viewport: { width: 1280, height: 720 }, screenshot: false });
  });

  test("stand", async ({}, testInfo) => {
    test.setTimeout(75_000);
    await withIsolatedChemistry(testInfo, async ({ page, canvas }) => {
      await bringProjectedTargetIntoCanvas(page, canvas, "stand-visual-target-stand-1");
      await projectedClickEscapeAndPlace(page, "stand-1", canvas, "stand-visual-target-stand-1");
      console.log("[EQUIPMENT BAT] stand-held-escape-placed");
    }, { viewport: { width: 1280, height: 720 }, screenshot: false });
  });

  test("scale", async ({}, testInfo) => {
    test.setTimeout(75_000);
    await withIsolatedChemistry(testInfo, async ({ page, canvas }) => {
      await bringProjectedTargetIntoCanvas(page, canvas, "interactable-target-scale-1");
      await projectedClickEscapeAndPlace(page, "scale-1", canvas);
      await expect(page.getByTestId("scale-reading")).toHaveAttribute("data-value");
      console.log("[EQUIPMENT BAT] scale-held-escape-placed-reading");
    }, { viewport: { width: 1280, height: 720 }, screenshot: false });
  });
});
