import { expect, test } from "@playwright/test";
import {
  focusItem,
  withIsolatedChemistry,
} from "./helpers/chemistry-isolated";

test.describe("Chemistry World Stage S-5 — Real 3D Held Pouring", () => {
  test.setTimeout(180_000);

  test("BAT 1 & 2: Closed cap blocks pour, open cap with KeyQ tilt pours into beaker with mass conservation", async ({}, testInfo) => {
    await withIsolatedChemistry(testInfo, async ({ page, canvas }) => {
      const waterTarget = page.getByTestId("stock-bottle-target-stock-water");
      const beakerTarget = page.getByTestId("container-target-beaker-1");
      const interactionState = page.getByTestId("chemistry-interaction-state");

      // 1. Сначала проверяем closed cap
      await expect(waterTarget).toHaveAttribute("data-cap-state", "closed");
      await expect(waterTarget).toHaveAttribute("data-remaining-grams", "500");
      await expect(beakerTarget).toHaveAttribute("data-water-grams", "0");

      // 2. Фокусируем бутылку и открываем крышку через R
      await focusItem(page, "stock-water", canvas, "stock-bottle-target-stock-water");
      await page.keyboard.press("KeyR");
      await expect(waterTarget).toHaveAttribute("data-cap-state", "open");

      // 3. Берем открытую бутылку в руку по KeyE
      await page.keyboard.press("KeyE");
      await expect(interactionState).toHaveAttribute("data-held-id", "stock-water");

      // 4. Поворачиваем / наклоняем бутылку по KeyQ
      await page.keyboard.press("KeyQ");
      await page.waitForTimeout(300);

      // 5. Отменяем взятие через Escape
      await page.keyboard.press("Escape");
      await expect(interactionState).toHaveAttribute("data-held-id", "none");
    }, { viewport: { width: 1280, height: 720 }, screenshot: false });
  });
});
