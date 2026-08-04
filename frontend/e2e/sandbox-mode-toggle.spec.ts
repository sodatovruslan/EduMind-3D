import { test, expect } from "@playwright/test";

test.describe("Stage S-7 v2 — CheckPoint S7-V2.8B Camera Mode Toggle Shell BAT", () => {
  test.beforeEach(async ({ page }) => {
    // Используем прототипную страницу с изолированным Canvas и оверлеем
    await page.goto("/sandbox-prototype");
    await page.waitForSelector("canvas");
  });

  test("S7-V2.8B: Starts in Orbit/Sandbox mode toggle shell, F2 toggles mode", async ({ page }) => {
    // 1. Проверяем наличие оверлея управления режимом
    const modeBadge = page.locator("text=Свободный (Sandbox S-7)");
    await expect(modeBadge).toBeVisible();

    // 2. Нажимаем F2 для проверки работы горячей клавиши
    await page.keyboard.press("F2");
    await page.waitForTimeout(300);

    const orbitBadge = page.locator("text=Обзор стола (Orbit S-6)");
    await expect(orbitBadge).toBeVisible();

    // 3. Повторный F2 возвращает в Sandbox Mode
    await page.keyboard.press("F2");
    await page.waitForTimeout(300);
    await expect(modeBadge).toBeVisible();
  });
});
