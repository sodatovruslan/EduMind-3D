import { test, expect } from "@playwright/test";

test.describe("Stage S-7 v2 — Real Chemistry World Wall Collision Verification", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/sandbox-prototype");
    await page.waitForSelector("canvas");
    await page.waitForTimeout(800);
    await page.locator("main").click();
    await page.waitForTimeout(300);

    const overlay = page.locator("text=READY (4/4 walls)");
    await expect(overlay).toBeVisible();
  });

  test("1. LEFT Wall Collision: distance is exactly 0.21m", async ({ page }) => {
    const container = page.getByTestId("sandbox-prototype-container");

    // Идем назад на Z = 4.5
    await page.keyboard.down("KeyS");
    await page.waitForTimeout(1200);
    await page.keyboard.up("KeyS");

    // Зажимаем KeyA и ждём достижения стены X <= -6.78
    await page.keyboard.down("KeyA");
    await expect.poll(async () => {
      return parseFloat((await container.getAttribute("data-player-x")) ?? "0");
    }, { timeout: 15000 }).toBeLessThanOrEqual(-6.78);
    await page.keyboard.up("KeyA");
    await page.waitForTimeout(300);

    const gapLeft = page.locator("[data-testid='gap-left']");
    await expect(gapLeft).toContainText("0.21m");

    await page.screenshot({
      path: "C:\\Users\\USER\\.gemini\\antigravity\\brain\\2545fd01-0145-415f-8330-b73c7e26df25\\screenshot_wall_left.png",
    });
  });

  test("2. RIGHT Wall Collision: distance is exactly 0.21m", async ({ page }) => {
    const container = page.getByTestId("sandbox-prototype-container");

    await page.keyboard.down("KeyS");
    await page.waitForTimeout(1200);
    await page.keyboard.up("KeyS");

    // Зажимаем KeyD и ждём достижения стены X >= 6.78
    await page.keyboard.down("KeyD");
    await expect.poll(async () => {
      return parseFloat((await container.getAttribute("data-player-x")) ?? "0");
    }, { timeout: 15000 }).toBeGreaterThanOrEqual(6.78);
    await page.keyboard.up("KeyD");
    await page.waitForTimeout(300);

    const gapRight = page.locator("[data-testid='gap-right']");
    await expect(gapRight).toContainText("0.21m");

    await page.screenshot({
      path: "C:\\Users\\USER\\.gemini\\antigravity\\brain\\2545fd01-0145-415f-8330-b73c7e26df25\\screenshot_wall_right.png",
    });
  });

  test("3. BACK Wall Collision: distance is exactly 0.21m", async ({ page }) => {
    const container = page.getByTestId("sandbox-prototype-container");

    // Зажимаем KeyW и ждём достижения задней стены Z <= -2.98
    await page.keyboard.down("KeyW");
    await expect.poll(async () => {
      return parseFloat((await container.getAttribute("data-player-z")) ?? "0");
    }, { timeout: 15000 }).toBeLessThanOrEqual(-2.98);
    await page.keyboard.up("KeyW");
    await page.waitForTimeout(300);

    const gapBack = page.locator("[data-testid='gap-back']");
    await expect(gapBack).toContainText("0.21m");

    await page.screenshot({
      path: "C:\\Users\\USER\\.gemini\\antigravity\\brain\\2545fd01-0145-415f-8330-b73c7e26df25\\screenshot_wall_back.png",
    });
  });

  test("4. FRONT Wall Collision: distance is exactly 0.21m", async ({ page }) => {
    const container = page.getByTestId("sandbox-prototype-container");

    // Зажимаем KeyS и ждём достижения передней границы Z >= 7.78
    await page.keyboard.down("KeyS");
    await expect.poll(async () => {
      return parseFloat((await container.getAttribute("data-player-z")) ?? "0");
    }, { timeout: 15000 }).toBeGreaterThanOrEqual(7.78);
    await page.keyboard.up("KeyS");
    await page.waitForTimeout(300);

    const gapFront = page.locator("[data-testid='gap-front']");
    await expect(gapFront).toContainText("0.21m");

    await page.screenshot({
      path: "C:\\Users\\USER\\.gemini\\antigravity\\brain\\2545fd01-0145-415f-8330-b73c7e26df25\\screenshot_wall_front.png",
    });
  });
});
