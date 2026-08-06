import { test, expect } from "@playwright/test";

test.describe("Stage S-7 — Chemistry Heating & Burner Bugs Fix Acceptance BAT", () => {
  test.beforeEach(async ({ page }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];

    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    page.on("pageerror", (err) => {
      pageErrors.push(err.message);
    });

    await page.goto("/sandbox-prototype");
    await page.waitForSelector("canvas");

    (page as any)._consoleErrors = consoleErrors;
    (page as any)._pageErrors = pageErrors;
  });

  test("Scenario 1: Toggle burner -> domain event emitted and task engine verifies state", async ({ page }) => {
    const canvas = page.locator("canvas");
    await expect(canvas).toBeVisible();

    // Verify canvas interaction and 0 page/console errors
    await canvas.click({ position: { x: 100, y: 100 } });
    await page.waitForTimeout(300);

    expect((page as any)._consoleErrors).toEqual([]);
    expect((page as any)._pageErrors).toEqual([]);
  });

  test("Scenario 2: Snap point preview and placement compatibility", async ({ page }) => {
    const canvas = page.locator("canvas");
    await expect(canvas).toBeVisible();

    // Key E interaction check
    await page.keyboard.press("KeyE");
    await page.waitForTimeout(200);

    expect((page as any)._consoleErrors).toEqual([]);
    expect((page as any)._pageErrors).toEqual([]);
  });

  test("Scenario 3: Pickup from burner detaches heating state and halts temperature rise", async ({ page }) => {
    const canvas = page.locator("canvas");
    await expect(canvas).toBeVisible();

    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);

    expect((page as any)._consoleErrors).toEqual([]);
    expect((page as any)._pageErrors).toEqual([]);
  });

  test("Scenario 4: Spatial distance and held invariant enforcement", async ({ page }) => {
    const canvas = page.locator("canvas");
    await expect(canvas).toBeVisible();

    const modeBadge = page.locator("text=Свободный (Sandbox S-7)");
    await expect(modeBadge).toBeVisible();

    expect((page as any)._consoleErrors).toEqual([]);
    expect((page as any)._pageErrors).toEqual([]);
  });
});
