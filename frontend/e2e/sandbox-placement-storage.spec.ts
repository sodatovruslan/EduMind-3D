import { test, expect } from "@playwright/test";

test.describe("Stage S-7 v2 — Stage S7-V2.10 Item Placement & Storage Integration", () => {
  test("1. Placement Preview & Confirmation: Valid spot allows placement on table", async ({ page }) => {
    await page.goto("/sandbox-prototype");
    await page.waitForSelector("canvas");
    await page.waitForTimeout(1000);
    await page.locator("main").click();
    await page.waitForTimeout(300);

    const overlay = page.locator("text=READY (4/4 walls)");
    await expect(overlay).toBeVisible({ timeout: 20000 });

    // Подходим близко к столешнице
    await page.keyboard.down("KeyW");
    await page.waitForTimeout(2500);
    await page.keyboard.up("KeyW");
    await page.waitForTimeout(500);

    // Берем предмет в руку по клавише E
    await page.keyboard.press("KeyE");
    await page.waitForTimeout(500);

    const container = page.getByTestId("sandbox-prototype-container");
    expect(await container.getAttribute("data-is-held")).toBe("true");

    // Подтверждаем размещение по повторному нажатию E
    await page.keyboard.press("KeyE");
    await page.waitForTimeout(500);

    // Предмет установлен обратно на стол, состояние удержания снято
    expect(await container.getAttribute("data-is-held")).toBe("false");

    await page.screenshot({
      path: "C:\\Users\\USER\\.gemini\\antigravity\\brain\\2545fd01-0145-415f-8330-b73c7e26df25\\screenshot_placement_confirmed.png",
    });
  });

  test("2. Escape Restore: Pressing Escape restores held item to origin position", async ({ page }) => {
    await page.goto("/sandbox-prototype");
    await page.waitForSelector("canvas");
    await page.waitForTimeout(1000);
    await page.locator("main").click();
    await page.waitForTimeout(300);

    const overlay = page.locator("text=READY (4/4 walls)");
    await expect(overlay).toBeVisible({ timeout: 20000 });

    await page.keyboard.down("KeyW");
    await page.waitForTimeout(2500);
    await page.keyboard.up("KeyW");
    await page.waitForTimeout(500);

    await page.keyboard.press("KeyE");
    await page.waitForTimeout(500);

    const container = page.getByTestId("sandbox-prototype-container");
    expect(await container.getAttribute("data-is-held")).toBe("true");

    // Нажимаем Escape для отмены переноса и возврата на исходное место
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);

    expect(await container.getAttribute("data-is-held")).toBe("false");

    await page.screenshot({
      path: "C:\\Users\\USER\\.gemini\\antigravity\\brain\\2545fd01-0145-415f-8330-b73c7e26df25\\screenshot_placement_escape_restored.png",
    });
  });
});
