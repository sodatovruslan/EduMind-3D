import { expect, test } from "@playwright/test";
import {
  aimCameraAtSpikeCabinet,
  focusItem,
  openSpikeCabinet,
  pickupAndEscape,
  withIsolatedChemistry,
} from "./helpers/chemistry-isolated";

test.describe("Chemistry World Stage S-3 — Shelves & Cabinets", () => {
  test.setTimeout(180_000);

  test("Сквозной BAT сценарий S-3: закрытый шкаф -> открыть -> взять -> на стол -> обратно в шкаф -> закрыть", async ({}, testInfo) => {
    await withIsolatedChemistry(testInfo, async ({ page, canvas }) => {
      const interactionState = page.getByTestId("chemistry-interaction-state");
      const cabinetState = page.getByTestId("spike-cabinet-state");
      const flaskTarget = page.getByTestId("spike-flask-target");

      // 1. Изначально шкаф закрыт
      await expect(cabinetState).toHaveAttribute("data-open", "false");

      // 2. Колба недоступна через закрытую дверь
      await expect(interactionState).toHaveAttribute("data-focused-id", "none");
      await expect(page.getByText("E — Взять: Колба")).not.toBeVisible();

      // 3. Открываем шкаф через проверенный helper
      await aimCameraAtSpikeCabinet(page, canvas);
      await openSpikeCabinet(page, canvas);
      await expect(cabinetState).toHaveAttribute("data-open", "true");

      // 4. Фокусируем доступную колбу и берем в руку через E
      await focusItem(page, "flask-1", canvas, "spike-flask-target");
      await expect(interactionState).toHaveAttribute("data-focused-id", "flask-1");

      await page.keyboard.press("KeyE");
      await expect(interactionState).toHaveAttribute("data-held-id", "flask-1");
      await expect(flaskTarget).toHaveAttribute("data-storage-slot-id", "none");

      // 5. Переход к столу через T и размещение колбы на столе
      await page.keyboard.press("KeyT");
      await page.waitForTimeout(500);

      await page.mouse.move(canvas.x + canvas.width * 0.5, canvas.y + canvas.height * 0.6);
      await page.waitForTimeout(300);
      await expect(interactionState).toHaveAttribute("data-placement-valid", "true");

      await page.keyboard.press("KeyE");
      await expect(interactionState).toHaveAttribute("data-held-id", "none");
      await expect(flaskTarget).toHaveAttribute("data-storage-slot-id", "none");
      await expect(flaskTarget).toHaveAttribute("data-elevation", "0.05");

      // 6. Снова берем колбу со стола
      await focusItem(page, "flask-1", canvas, "spike-flask-target");
      await page.keyboard.press("KeyE");
      await expect(interactionState).toHaveAttribute("data-held-id", "flask-1");

      // 7. Возврат к шкафу и помещение в свободный совместимый слот
      await aimCameraAtSpikeCabinet(page, canvas);
      const doorBox = await page.getByTestId("spike-cabinet-door-target").boundingBox();
      if (doorBox) {
        await page.mouse.move(doorBox.x + doorBox.width / 2, doorBox.y + doorBox.height / 2);
        await page.waitForTimeout(300);
      }

      await expect(page.getByText(/E — Убрать в шкаф/)).toBeVisible();
      await page.keyboard.press("KeyE");

      await expect(interactionState).toHaveAttribute("data-held-id", "none");
      await expect(flaskTarget).toHaveAttribute("data-storage-slot-id", "cabinet-left-inner-slot-1");
      await expect(flaskTarget).toHaveAttribute("data-elevation", "1.85");

      // 8. Закрываем шкаф через openSpikeCabinet toggle
      await openSpikeCabinet(page, canvas);
      await expect(cabinetState).toHaveAttribute("data-open", "false");
    }, { viewport: { width: 1280, height: 720 }, screenshot: true });
  });

  test("Edge case A: Escape сразу после pickup из шкафа", async ({}, testInfo) => {
    await withIsolatedChemistry(testInfo, async ({ page, canvas }) => {
      const interactionState = page.getByTestId("chemistry-interaction-state");
      const cabinetState = page.getByTestId("spike-cabinet-state");
      const flaskTarget = page.getByTestId("spike-flask-target");

      await aimCameraAtSpikeCabinet(page, canvas);
      await openSpikeCabinet(page, canvas);
      await expect(cabinetState).toHaveAttribute("data-open", "true");

      await focusItem(page, "flask-1", canvas, "spike-flask-target");
      await page.keyboard.press("KeyE");
      await expect(interactionState).toHaveAttribute("data-held-id", "flask-1");

      // Escape восстанавливает слот
      await page.keyboard.press("Escape");
      await expect(interactionState).toHaveAttribute("data-held-id", "none");
      await expect(flaskTarget).toHaveAttribute("data-storage-slot-id", "cabinet-left-inner-slot-1");
      await expect(flaskTarget).toHaveAttribute("data-elevation", "1.85");
    }, { viewport: { width: 1280, height: 720 }, screenshot: false });
  });

  test("Edge case B: Escape после pickup со стола", async ({}, testInfo) => {
    await withIsolatedChemistry(testInfo, async ({ page, canvas }) => {
      await pickupAndEscape(page, "beaker-1", canvas, "container-target-beaker-1");
      await expect(page.getByTestId("container-target-beaker-1")).toHaveAttribute("data-storage-slot-id", "none");
      await expect(page.getByTestId("container-target-beaker-1")).toHaveAttribute("data-elevation", "0.05");
    }, { viewport: { width: 1280, height: 720 }, screenshot: false });
  });

  test("Edge case C & D: Занятый и несовместимый слот не принимает стакан в шкаф для колб", async ({}, testInfo) => {
    await withIsolatedChemistry(testInfo, async ({ page, canvas }) => {
      const interactionState = page.getByTestId("chemistry-interaction-state");
      const cabinetState = page.getByTestId("spike-cabinet-state");

      await aimCameraAtSpikeCabinet(page, canvas);
      await openSpikeCabinet(page, canvas);
      await expect(cabinetState).toHaveAttribute("data-open", "true");

      // Берем beaker-1 со стола
      await page.keyboard.press("KeyT");
      await focusItem(page, "beaker-1", canvas, "container-target-beaker-1");
      await page.keyboard.press("KeyE");
      await expect(interactionState).toHaveAttribute("data-held-id", "beaker-1");

      // Наводим на открытый шкаф, где слот занят и предназначен только для flask
      await aimCameraAtSpikeCabinet(page, canvas);
      const doorBox = await page.getByTestId("spike-cabinet-door-target").boundingBox();
      if (doorBox) {
        await page.mouse.move(doorBox.x + doorBox.width / 2, doorBox.y + doorBox.height / 2);
        await page.waitForTimeout(300);
      }

      // Подсказка "Убрать в шкаф" НЕ показывается, т.к. слот несовместим/занят
      await expect(page.getByText(/E — Убрать в шкаф/)).not.toBeVisible();

      // Нажатие E не помещает стакан в шкаф, он остается в руке
      await page.keyboard.press("KeyE");
      await expect(interactionState).toHaveAttribute("data-held-id", "beaker-1");

      // Безопасный отмена в исходное место стола
      await page.keyboard.press("Escape");
      await expect(interactionState).toHaveAttribute("data-held-id", "none");
    }, { viewport: { width: 1280, height: 720 }, screenshot: false });
  });

  test("Edge case E & F: Door state animation stability & Domain data preservation", async ({}, testInfo) => {
    await withIsolatedChemistry(testInfo, async ({ page, canvas }) => {
      const cabinetState = page.getByTestId("spike-cabinet-state");
      const flaskTarget = page.getByTestId("spike-flask-target");

      await aimCameraAtSpikeCabinet(page, canvas);

      // Множественные циклы открыть/закрыть через openSpikeCabinet
      for (let cycle = 0; cycle < 3; cycle += 1) {
        await openSpikeCabinet(page, canvas);
        await expect(cabinetState).toHaveAttribute("data-open", "true");

        await openSpikeCabinet(page, canvas);
        await expect(cabinetState).toHaveAttribute("data-open", "false");
      }

      // Сохранность доменных данных
      await expect(flaskTarget).toHaveAttribute("data-water-grams", "0");
      await expect(page.getByTestId("stock-bottle-target-stock-water")).toHaveAttribute("data-remaining-grams", "500");
    }, { viewport: { width: 1280, height: 720 }, screenshot: false });
  });
});
