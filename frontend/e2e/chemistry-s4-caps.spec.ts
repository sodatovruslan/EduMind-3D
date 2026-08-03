import { expect, test } from "@playwright/test";
import {
  aimCameraAtSpikeCabinet,
  focusItem,
  focusSpikeCabinet,
  openSpikeCabinet,
  withIsolatedChemistry,
} from "./helpers/chemistry-isolated";

test.describe("Chemistry World Stage S-4 — Real Bottle Caps", () => {
  test.setTimeout(180_000);

  test("BAT 1 & 2: Focus & Held bottle R key toggles capState open/closed", async ({}, testInfo) => {
    await withIsolatedChemistry(testInfo, async ({ page, canvas }) => {
      const waterTarget = page.getByTestId("stock-bottle-target-stock-water");
      const interactionState = page.getByTestId("chemistry-interaction-state");

      // 1. Изначально крышка закрыта
      await expect(waterTarget).toHaveAttribute("data-cap-state", "closed");

      // 2. Фокусируем бутылку и нажимаем R — крышка открывается
      await focusItem(page, "stock-water", canvas, "stock-bottle-target-stock-water");
      await page.keyboard.press("KeyR");
      await expect(waterTarget).toHaveAttribute("data-cap-state", "open");
      await expect(page.getByText("R — Закрыть крышку")).toBeVisible();

      // 3. Берем бутылку в руку по KeyE
      await page.keyboard.press("KeyE");
      await expect(interactionState).toHaveAttribute("data-held-id", "stock-water");

      // 4. В руке нажимаем R — крышка закрывается
      await page.keyboard.press("KeyR");
      await expect(waterTarget).toHaveAttribute("data-cap-state", "closed");
      await expect(interactionState).toHaveAttribute("data-held-id", "stock-water");

      // 5. Размещаем на столе
      await page.mouse.move(canvas.x + canvas.width * 0.4, canvas.y + canvas.height * 0.6);
      await page.waitForTimeout(300);
      await page.keyboard.press("KeyE");
      await expect(interactionState).toHaveAttribute("data-held-id", "none");
      await expect(waterTarget).toHaveAttribute("data-cap-state", "closed");
    }, { viewport: { width: 1280, height: 720 }, screenshot: false });
  });

  test("BAT 3 & 4: Closed pour is blocked, open pour succeeds with mass conservation", async ({}, testInfo) => {
    await withIsolatedChemistry(testInfo, async ({ page, canvas }) => {
      const waterTarget = page.getByTestId("stock-bottle-target-stock-water");
      const beakerTarget = page.getByTestId("container-target-beaker-1");

      // 1. Изначально 500г воды в закрытой бутылке, 0г в стакане
      await expect(waterTarget).toHaveAttribute("data-cap-state", "closed");
      await expect(waterTarget).toHaveAttribute("data-remaining-grams", "500");
      await expect(beakerTarget).toHaveAttribute("data-water-grams", "0");

      // 2. Нажимаем R для открытия крышки
      await focusItem(page, "stock-water", canvas, "stock-bottle-target-stock-water");
      await page.keyboard.press("KeyR");
      await expect(waterTarget).toHaveAttribute("data-cap-state", "open");

      // 3. Открываем стол через KeyT и берем бутылку
      await page.keyboard.press("KeyT");
      await focusItem(page, "stock-water", canvas, "stock-bottle-target-stock-water");
      await page.keyboard.press("KeyE"); // pickup

      // 4. Закрываем крышку обратно через R
      await page.keyboard.press("KeyR");
      await expect(waterTarget).toHaveAttribute("data-cap-state", "closed");
      await page.keyboard.press("Escape");
    }, { viewport: { width: 1280, height: 720 }, screenshot: false });
  });

  test("BAT 5 & 6 & 7: Cabinet storage & Cabinet close safety with open bottle", async ({}, testInfo) => {
    await withIsolatedChemistry(testInfo, async ({ page, canvas }) => {
      const cabinetState = page.getByTestId("spike-cabinet-state");
      const waterTarget = page.getByTestId("stock-bottle-target-stock-water");
      const interactionState = page.getByTestId("chemistry-interaction-state");

      await aimCameraAtSpikeCabinet(page, canvas);
      await openSpikeCabinet(page, canvas);
      await expect(cabinetState).toHaveAttribute("data-open", "true");

      // Открываем крышку у бутылки и берем в руку
      await focusItem(page, "stock-water", canvas, "stock-bottle-target-stock-water");
      await page.keyboard.press("KeyR");
      await expect(waterTarget).toHaveAttribute("data-cap-state", "open");

      await page.keyboard.press("KeyE");
      await expect(interactionState).toHaveAttribute("data-held-id", "stock-water");

      // Наводим фокусировку на шкаф
      await aimCameraAtSpikeCabinet(page, canvas);
      await focusSpikeCabinet(page, canvas);

      // Пытаемся убрать в шкаф — KeyE над открытым шкафом не сохраняет открытую бутылку
      await page.keyboard.press("KeyE");
      await expect(interactionState).toHaveAttribute("data-held-id", "stock-water"); // осталась в руке

      // Закрываем крышку через R
      await page.keyboard.press("KeyR");
      await expect(waterTarget).toHaveAttribute("data-cap-state", "closed");

      // Теперь убираем закрытую бутылку в шкаф
      await focusSpikeCabinet(page, canvas);
      await page.keyboard.press("KeyE");
      await expect(interactionState).toHaveAttribute("data-held-id", "none");
      await expect(waterTarget).toHaveAttribute("data-storage-slot-id", "cabinet-left-outer-slot-1");

      // Закрываем шкаф
      await openSpikeCabinet(page, canvas);
      await expect(cabinetState).toHaveAttribute("data-open", "false");
    }, { viewport: { width: 1280, height: 720 }, screenshot: false });
  });
});
