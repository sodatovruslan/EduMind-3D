import { expect, test } from "@playwright/test";
import {
  aimAtFreeTablePoint,
  bringProjectedTargetIntoCanvas,
  pickupAndEscape,
  pickupAndPlace,
  projectedCenter,
  withIsolatedChemistry,
} from "./helpers/chemistry-isolated";

test.describe("S-2.5 thin tools", () => {
  test.setTimeout(120_000);

  test("pipette through projected world marker", async ({}, testInfo) => {
    test.setTimeout(75_000);
    await withIsolatedChemistry(testInfo, async ({ page, canvas }) => {
      await bringProjectedTargetIntoCanvas(page, canvas, "interactable-target-pipette-1");
      console.log("[THIN BAT] pipette-visible");
      const state = page.getByTestId("chemistry-interaction-state");
      let target = await projectedCenter(page, "interactable-target-pipette-1");
      await page.mouse.click(target.x, target.y);
      await expect(state).toHaveAttribute("data-dragging-id", "none");
      await page.keyboard.press("KeyE");
      await expect(state).toHaveAttribute("data-held-id", "pipette-1");
      await page.keyboard.press("Escape");
      await expect(state).toHaveAttribute("data-held-id", "none");
      console.log("[THIN BAT] pipette-held-escape");
      target = await projectedCenter(page, "interactable-target-pipette-1");
      await page.mouse.click(target.x, target.y);
      await expect(state).toHaveAttribute("data-dragging-id", "none");
      await page.keyboard.press("KeyE");
      await expect(state).toHaveAttribute("data-held-id", "pipette-1");
      await aimAtFreeTablePoint(page, canvas);
      await page.keyboard.press("KeyE");
      await expect(state).toHaveAttribute("data-held-id", "none");
      console.log("[THIN BAT] pipette-held-placed");
    }, { viewport: { width: 1280, height: 720 }, screenshot: false });
  });

  test("thermometer through projected world marker", async ({}, testInfo) => {
    test.setTimeout(75_000);
    await withIsolatedChemistry(testInfo, async ({ page, canvas }) => {
      await expect(page.getByTestId("thermometer-reading")).toHaveAttribute("data-value");
      await bringProjectedTargetIntoCanvas(page, canvas, "interactable-target-thermometer-1");
      await pickupAndEscape(page, "thermometer-1", canvas, undefined, false);
      await pickupAndPlace(page, "thermometer-1", canvas, undefined, false);
      await expect(page.getByTestId("thermometer-reading")).toHaveAttribute("data-value");
      console.log("[THIN BAT] thermometer-held-placed");
    }, { viewport: { width: 1280, height: 720 }, screenshot: false });
  });

  test("glass rod through projected world marker", async ({}, testInfo) => {
    await withIsolatedChemistry(testInfo, async ({ page, canvas }) => {
      await bringProjectedTargetIntoCanvas(page, canvas, "interactable-target-glass-rod-1");
      await pickupAndEscape(page, "glass-rod-1", canvas, undefined, false);
      await pickupAndPlace(page, "glass-rod-1", canvas, undefined, false);
    }, { viewport: { width: 1280, height: 720 }, screenshot: false });
  });
});
