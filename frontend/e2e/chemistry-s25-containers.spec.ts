import { expect, test } from "@playwright/test";
import {
  aimCameraAtSpikeCabinet,
  aimAtFreeTablePoint,
  focusItem,
  openSpikeCabinet,
  pickupAndEscape,
  pickupAndPlace,
  projectedCenter,
  withIsolatedChemistry,
} from "./helpers/chemistry-isolated";

test.describe("S-2.5 containers", () => {
  test.setTimeout(120_000);

  test("beaker", async ({}, testInfo) => {
    await withIsolatedChemistry(testInfo, async ({ page, canvas }) => {
      await pickupAndEscape(page, "beaker-1", canvas);
      await pickupAndPlace(page, "beaker-1", canvas);
    });
  });

  test("flask", async ({}, testInfo) => {
    test.setTimeout(120_000);
    await withIsolatedChemistry(testInfo, async ({ page, canvas }) => {
      const state = page.getByTestId("chemistry-interaction-state");
      await aimCameraAtSpikeCabinet(page, canvas);
      const closedFlask = await projectedCenter(page, "spike-flask-target");
      await page.mouse.move(closedFlask.x, closedFlask.y, { steps: 4 });
      await page.waitForTimeout(250);
      expect(await state.getAttribute("data-focused-id")).not.toBe("flask-1");
      await expect(page.getByText("E — Взять: Колба", { exact: true })).toHaveCount(0);

      await openSpikeCabinet(page, canvas);
      console.log("[FLASK BAT] cabinet-open");
      await focusItem(page, "flask-1", canvas);
      await expect(page.getByText("E — Взять: Колба", { exact: true })).toBeVisible();
      await page.keyboard.press("KeyE");
      await expect(state).toHaveAttribute("data-held-id", "flask-1");
      console.log("[FLASK BAT] held-from-cabinet");

      await page.keyboard.press("KeyT");
      await page.waitForTimeout(350);
      console.log("[FLASK BAT] table-camera");

      await aimAtFreeTablePoint(page, canvas);
      const placedAimX = Number(await state.getAttribute("data-aim-x"));
      const placedAimZ = Number(await state.getAttribute("data-aim-z"));
      console.log("[FLASK BAT] valid-green", JSON.stringify([placedAimX, placedAimZ]));
      await page.keyboard.press("KeyE");
      await expect(state).toHaveAttribute("data-held-id", "none");
      await expect(page.getByTestId("spike-flask-target")).toHaveCount(0);
      console.log("[FLASK BAT] placed-on-table");

      const transform = page.getByTestId("workspace-transform-flask-1");
      const placedX = Number(await transform.getAttribute("data-x"));
      const placedZ = Number(await transform.getAttribute("data-z"));
      const placedRotation = await transform.getAttribute("data-rotation-y");
      expect(Math.abs(placedX - placedAimX)).toBeLessThan(0.001);
      expect(Math.abs(placedZ - placedAimZ)).toBeLessThan(0.001);

      const tableFlask = await projectedCenter(page, "interactable-target-flask-1");
      expect(tableFlask.x).toBeGreaterThan(canvas.x);
      expect(tableFlask.x).toBeLessThan(canvas.x + canvas.width);
      expect(tableFlask.y).toBeGreaterThan(canvas.y);
      expect(tableFlask.y).toBeLessThan(canvas.y + canvas.height);

      await focusItem(page, "flask-1", canvas);
      await page.keyboard.press("KeyE");
      await expect(state).toHaveAttribute("data-held-id", "flask-1");
      await page.keyboard.press("Escape");
      await expect(state).toHaveAttribute("data-held-id", "none");
      await expect(transform).toHaveAttribute("data-x", String(placedX));
      await expect(transform).toHaveAttribute("data-z", String(placedZ));
      await expect(transform).toHaveAttribute("data-rotation-y", placedRotation ?? "0");
      console.log("[FLASK BAT] repick-escape-transform-preserved");
    }, { viewport: { width: 1280, height: 720 }, screenshot: false });
  });

  test("test tube", async ({}, testInfo) => {
    await withIsolatedChemistry(testInfo, async ({ page, canvas }) => {
      await pickupAndEscape(page, "test-tube-1", canvas);
      await pickupAndPlace(page, "test-tube-1", canvas);
    });
  });
});
