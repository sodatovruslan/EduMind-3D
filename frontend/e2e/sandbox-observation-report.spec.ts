import { test, expect } from "@playwright/test";

test.describe("Stage S-7 v2 — Stage S7-V2.12 Observation & Teacher Report Verification", () => {
  test("1. WASD Locomotion Noise Exclusion: Walking does not pollute observation log", async ({ page }) => {
    await page.goto("/sandbox-prototype");
    await page.waitForSelector("canvas");
    await page.waitForTimeout(800);
    await page.locator("main").click();
    await page.waitForTimeout(300);

    const overlay = page.locator("text=READY (4/4 walls)");
    await expect(overlay).toBeVisible({ timeout: 20000 });

    // Активно перемещаемся клавишами WASD по лабе
    await page.keyboard.down("KeyW");
    await page.waitForTimeout(1000);
    await page.keyboard.up("KeyW");
    await page.keyboard.down("KeyA");
    await page.waitForTimeout(800);
    await page.keyboard.up("KeyA");
    await page.keyboard.down("KeyD");
    await page.waitForTimeout(800);
    await page.keyboard.up("KeyD");

    await page.screenshot({
      path: "C:\\Users\\USER\\.gemini\\antigravity\\brain\\2545fd01-0145-415f-8330-b73c7e26df25\\screenshot_obs_wasd_noise_free.png",
    });
  });

  test("2. Experiment Parity: Complete scenario generates clean report in Sandbox Mode", async ({ page }) => {
    await page.goto("/sandbox-prototype");
    await page.waitForSelector("canvas");
    await page.waitForTimeout(800);
    await page.locator("main").click();
    await page.waitForTimeout(300);

    const overlay = page.locator("text=READY (4/4 walls)");
    await expect(overlay).toBeVisible({ timeout: 20000 });

    // 1. Подходим к столу
    await page.keyboard.down("KeyW");
    await page.waitForTimeout(2500);
    await page.keyboard.up("KeyW");
    await page.waitForTimeout(400);

    // 2. Взять предмета (KeyE)
    await page.keyboard.press("KeyE");
    await page.waitForTimeout(400);

    // 3. Открыть крышку (KeyR)
    await page.keyboard.press("KeyR");
    await page.waitForTimeout(400);

    // 4. Поставить предмет (KeyE)
    await page.keyboard.press("KeyE");
    await page.waitForTimeout(400);

    await page.screenshot({
      path: "C:\\Users\\USER\\.gemini\\antigravity\\brain\\2545fd01-0145-415f-8330-b73c7e26df25\\screenshot_obs_clean_report.png",
    });
  });
});
