import { test, expect } from "@playwright/test";

test.describe("Stage S-7 v2 — Stage S7-V2.13 Final Acceptance BAT", () => {
  test("1. Full Acceptance: Orbit/Sandbox toggle, Fullscreen button, Dev Diagnostics hidden by default, console clean", async ({ page }) => {
    const consoleErrors: string[] = [];
    const pageErrors: Error[] = [];

    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    page.on("pageerror", (err) => {
      pageErrors.push(err);
    });

    await page.goto("/sandbox-prototype");
    await page.waitForSelector("canvas");
    await page.waitForTimeout(800);

    // 1. Проверяем отображение текущего режима и кнопки На весь экран
    const sandboxBadge = page.locator("text=Свободный (Sandbox S-7)");
    await expect(sandboxBadge).toBeVisible();

    const fullscreenButton = page.getByTitle("Полноэкранный режим");
    await expect(fullscreenButton).toBeVisible();

    // 2. Dev Diagnostics скрыт по умолчанию
    const diagHeader = page.locator("text=Dev Diagnostics: Real Wall Collision Registry");
    await expect(diagHeader).not.toBeVisible();

    // 3. F3 открывает Dev Diagnostics в dev-режиме
    await page.keyboard.press("F3");
    await page.waitForTimeout(300);
    await expect(diagHeader).toBeVisible();

    // 4. Повторный F3 скрывает Dev Diagnostics
    await page.keyboard.press("F3");
    await page.waitForTimeout(300);
    await expect(diagHeader).not.toBeVisible();

    // 5. Переключение Orbit ↔ Sandbox по кнопке F2
    await page.keyboard.press("F2");
    await page.waitForTimeout(300);
    const orbitBadge = page.locator("text=Обзор стола (Orbit S-6)");
    await expect(orbitBadge).toBeVisible();

    await page.keyboard.press("F2");
    await page.waitForTimeout(300);
    await expect(sandboxBadge).toBeVisible();

    // 6. Клик по кнопке Полноэкранного режима
    await fullscreenButton.click();
    await page.waitForTimeout(300);

    // 7. Проверка чистоты консоли
    expect(consoleErrors, `Console errors detected: ${consoleErrors.join("; ")}`).toHaveLength(0);
    expect(pageErrors, `Page errors detected: ${pageErrors.map((e) => e.message).join("; ")}`).toHaveLength(0);
  });
});
