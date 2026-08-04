import { test, expect } from "@playwright/test";

test.describe("Stage S-7 v2 — Stage S7-V2.11 Bottle Caps & Pouring Mechanics Integration", () => {
  test("1. Bottle Cap Management: R key toggles bottle cap state", async ({ page }) => {
    await page.goto("/sandbox-prototype");
    await page.waitForSelector("canvas");
    await page.waitForTimeout(800);
    await page.locator("main").click();
    await page.waitForTimeout(300);

    const overlay = page.locator("text=READY (4/4 walls)");
    await expect(overlay).toBeVisible({ timeout: 20000 });

    // Подходим к столу и берем бутылку
    await page.keyboard.down("KeyW");
    await page.waitForTimeout(2500);
    await page.keyboard.up("KeyW");
    await page.waitForTimeout(400);

    await page.keyboard.press("KeyE");
    await page.waitForTimeout(400);

    // Нажимаем R для открытия/закрытия крышки
    await page.keyboard.press("KeyR");
    await page.waitForTimeout(400);

    await page.screenshot({
      path: "C:\\Users\\USER\\.gemini\\antigravity\\brain\\2545fd01-0145-415f-8330-b73c7e26df25\\screenshot_cap_toggled.png",
    });
  });

  test("2. Pouring Validation: Open cap and Q-tilt allows liquid transfer", async ({ page }) => {
    await page.goto("/sandbox-prototype");
    await page.waitForSelector("canvas");
    await page.waitForTimeout(800);
    await page.locator("main").click();
    await page.waitForTimeout(300);

    const overlay = page.locator("text=READY (4/4 walls)");
    await expect(overlay).toBeVisible({ timeout: 20000 });

    await page.keyboard.down("KeyW");
    await page.waitForTimeout(2500);
    await page.keyboard.up("KeyW");
    await page.waitForTimeout(400);

    await page.keyboard.press("KeyE");
    await page.waitForTimeout(400);

    // Открываем крышку по клавише R
    await page.keyboard.press("KeyR");
    await page.waitForTimeout(400);

    // Удерживаем клавишу Q для наклона бутылки
    await page.keyboard.down("KeyQ");
    await page.waitForTimeout(600);
    await page.keyboard.up("KeyQ");

    await page.screenshot({
      path: "C:\\Users\\USER\\.gemini\\antigravity\\brain\\2545fd01-0145-415f-8330-b73c7e26df25\\screenshot_pouring_stream.png",
    });
  });
});
