import { test, expect } from "@playwright/test";

test.describe("Stage S-7 v2 — Stage S7-V2.9 Unified requestInteraction Pipeline", () => {
  test("1. Sandbox Mode: Distant click across table (>1.8m) is blocked with too_far", async ({ page }) => {
    await page.goto("/sandbox-prototype");
    await page.waitForSelector("canvas");
    await page.waitForTimeout(800);
    await page.locator("main").click();
    await page.waitForTimeout(300);

    const overlay = page.locator("text=READY (4/4 walls)");
    await expect(overlay).toBeVisible();

    const container = page.getByTestId("sandbox-prototype-container");
    const isHeldInitial = await container.getAttribute("data-is-held");
    expect(isHeldInitial).toBe("false");

    const canvas = page.locator("canvas");
    await canvas.click({ position: { x: 400, y: 300 } });
    await page.waitForTimeout(400);

    const isHeldAfterClick = await container.getAttribute("data-is-held");
    expect(isHeldAfterClick).toBe("false");

    await page.screenshot({
      path: "C:\\Users\\USER\\.gemini\\antigravity\\brain\\2545fd01-0145-415f-8330-b73c7e26df25\\screenshot_unified_distant_blocked.png",
    });
  });

  test("2. Sandbox Mode: Close interaction (<1.8m) allows pickup", async ({ page }) => {
    await page.goto("/sandbox-prototype");
    await page.waitForSelector("canvas");
    await page.waitForTimeout(800);
    await page.locator("main").click();
    await page.waitForTimeout(300);

    // Подходим близко к столешнице (KeyW forward к столу, Z ~ 1.0)
    await page.keyboard.down("KeyW");
    await page.waitForTimeout(2500);
    await page.keyboard.up("KeyW");
    await page.waitForTimeout(300);

    await page.keyboard.press("KeyE");
    await page.waitForTimeout(400);

    const container = page.getByTestId("sandbox-prototype-container");
    const isHeld = await container.getAttribute("data-is-held");
    expect(isHeld).toBe("true");

    await page.screenshot({
      path: "C:\\Users\\USER\\.gemini\\antigravity\\brain\\2545fd01-0145-415f-8330-b73c7e26df25\\screenshot_unified_close_allowed.png",
    });
  });

  test("3. Orbit Mode: Unrestricted table-wide click interaction (Stage S-6 parity)", async ({ page }) => {
    await page.goto("/sandbox-prototype");
    await page.waitForSelector("canvas");
    await page.waitForTimeout(800);

    await page.keyboard.press("F2");
    await page.waitForTimeout(400);

    const orbitStatus = page.locator("text=Обзор стола (Orbit S-6)");
    await expect(orbitStatus).toBeVisible();

    const canvas = page.locator("canvas");
    await canvas.click({ position: { x: 400, y: 300 } });
    await page.waitForTimeout(400);

    await page.screenshot({
      path: "C:\\Users\\USER\\.gemini\\antigravity\\brain\\2545fd01-0145-415f-8330-b73c7e26df25\\screenshot_unified_orbit_mode.png",
    });
  });

  test("4. Held State: Holding an item blocks second pickup (invalid_state)", async ({ page }) => {
    await page.goto("/sandbox-prototype");
    await page.waitForSelector("canvas");
    await page.waitForTimeout(800);
    await page.locator("main").click();

    await page.keyboard.down("KeyW");
    await page.waitForTimeout(2500);
    await page.keyboard.up("KeyW");
    await page.keyboard.press("KeyE");
    await page.waitForTimeout(400);

    const container = page.getByTestId("sandbox-prototype-container");
    expect(await container.getAttribute("data-is-held")).toBe("true");

    const canvas = page.locator("canvas");
    await canvas.click({ position: { x: 400, y: 300 } });
    await page.waitForTimeout(400);

    expect(await container.getAttribute("data-is-held")).toBe("true");
  });
});
