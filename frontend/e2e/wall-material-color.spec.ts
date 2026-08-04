import { test, expect } from "@playwright/test";

test.describe("Stage S-7 v2 — Wall Material Color Opaqueness Verification", () => {
  test("Verify wall material remains solid and opaque far and close to wall", async ({ page }) => {
    test.setTimeout(60000);

    await page.goto("/sandbox-prototype");
    await page.waitForSelector("canvas");
    await page.waitForTimeout(800);
    await page.locator("main").click();
    await page.waitForTimeout(300);

    const overlay = page.locator("text=READY (4/4 walls)");
    await expect(overlay).toBeVisible();

    // 1. Скриншот вдали от стены (в центре комнаты Pos: [0, 2.50])
    await page.screenshot({
      path: "C:\\Users\\USER\\.gemini\\antigravity\\brain\\2545fd01-0145-415f-8330-b73c7e26df25\\screenshot_wall_far.png",
    });

    // 2. Идем вплотную к передней границе (KeyS к Z = +7.79)
    const container = page.getByTestId("sandbox-prototype-container");
    await page.keyboard.down("KeyS");
    await expect.poll(async () => {
      return parseFloat((await container.getAttribute("data-player-z")) ?? "0");
    }, { timeout: 30000 }).toBeGreaterThanOrEqual(7.78);
    await page.keyboard.up("KeyS");
    await page.waitForTimeout(300);

    // 3. Скриншот вплотную к стене (Pos: [0.00, +7.79])
    await page.screenshot({
      path: "C:\\Users\\USER\\.gemini\\antigravity\\brain\\2545fd01-0145-415f-8330-b73c7e26df25\\screenshot_wall_close.png",
    });
  });
});
