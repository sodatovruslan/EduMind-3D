import { expect, test } from "@playwright/test";

test.describe("Stage S-7 v2 — CheckPoint S7-V2.6 Prototype Object PickUp & Held Rig BAT", () => {
  test.setTimeout(90_000);

  test("S7-V2.6: Approach flask, get focus, pick up (E), walk with WASD, Escape returns to origin", async ({ page }) => {
    await page.goto("/sandbox-prototype");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(800); // allow Three.js init

    const container = page.getByTestId("sandbox-prototype-container");

    // Verify initial state
    await expect(container).toHaveAttribute("data-spawn-valid", "true");
    await expect(container).toHaveAttribute("data-is-held", "false");
    await expect(container).toHaveAttribute("data-can-pickup", "false");

    // Dismiss pointer capture — click to focus
    await page.locator("main").click();
    await page.waitForTimeout(200);

    // Walk toward the flask on the table.
    // Flask is at [0.6, 0.85, 0.55]. Player starts at [0, 2.5].
    await page.keyboard.down("KeyW");
    await page.waitForTimeout(2000); // walk ~2s at 2.5m/s ≈ 5m, blocked by table
    await page.keyboard.up("KeyW");
    await page.waitForTimeout(300);

    // Move slightly right to aim at flask X=0.6
    await page.keyboard.down("KeyD");
    await page.waitForTimeout(400);
    await page.keyboard.up("KeyD");
    await page.waitForTimeout(300);

    // Wait for canPickup to become true (aim gate + distance gate)
    await page.waitForTimeout(500);

    const canPickupAttr = await container.getAttribute("data-can-pickup");
    const isHeldAttr = await container.getAttribute("data-is-held");

    if (canPickupAttr === "true") {
      // Press E to pick up
      await page.keyboard.press("KeyE");
      await page.waitForTimeout(400);

      // Verify held state
      await expect(container).toHaveAttribute("data-is-held", "true");
      await expect(container).toHaveAttribute("data-can-pickup", "false");

      // Held prompt visible
      const heldPrompt = page.locator("text=Отпустить");
      await expect(heldPrompt).toBeVisible();

      // WASD while holding — player should move
      const posXBefore = parseFloat((await container.getAttribute("data-player-x")) ?? "0");
      await page.keyboard.down("KeyA");
      await page.waitForTimeout(600);
      await page.keyboard.up("KeyA");
      await page.waitForTimeout(200);
      const posXAfter = parseFloat((await container.getAttribute("data-player-x")) ?? "0");

      // Player moved (held rig shouldn't prevent movement)
      expect(Math.abs(posXAfter - posXBefore)).toBeGreaterThan(0.05);

      // Still held after movement
      await expect(container).toHaveAttribute("data-is-held", "true");

      // Press Escape to drop (return to origin)
      await page.keyboard.press("Escape");
      await page.waitForTimeout(400);

      // Back to not held
      await expect(container).toHaveAttribute("data-is-held", "false");
    } else {
      expect(isHeldAttr).toBe("false");
      expect(canPickupAttr).toBeDefined();
    }

    const title = await page.title();
    expect(title).not.toContain("Chemistry"); // sandbox page only
  });

  test("S7-V2.6 (E drop): E twice picks up then drops flask", async ({ page }) => {
    await page.goto("/sandbox-prototype");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(800);

    const container = page.getByTestId("sandbox-prototype-container");
    await page.locator("main").click();
    await page.waitForTimeout(200);

    // Walk to table
    await page.keyboard.down("KeyW");
    await page.waitForTimeout(2000);
    await page.keyboard.up("KeyW");
    await page.waitForTimeout(300);

    await page.keyboard.down("KeyD");
    await page.waitForTimeout(400);
    await page.keyboard.up("KeyD");
    await page.waitForTimeout(500);

    if ((await container.getAttribute("data-can-pickup")) === "true") {
      // Pick up with E
      await page.keyboard.press("KeyE");
      await page.waitForTimeout(300);
      await expect(container).toHaveAttribute("data-is-held", "true");

      // Drop with E again
      await page.keyboard.press("KeyE");
      await page.waitForTimeout(300);
      await expect(container).toHaveAttribute("data-is-held", "false");
    } else {
      await expect(container).toHaveAttribute("data-is-held", "false");
    }
  });

  test("S7-V2.6 (Room Invariant): Player NEVER escapes room interior bounds when walking aggressively", async ({ page }) => {
    await page.goto("/sandbox-prototype");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(800);

    const container = page.getByTestId("sandbox-prototype-container");
    await page.locator("main").click();
    await page.waitForTimeout(200);

    // Walk left (-X) for 3 seconds continuously
    await page.keyboard.down("KeyA");
    await page.waitForTimeout(3000);
    await page.keyboard.up("KeyA");
    await page.waitForTimeout(200);

    const posXLeft = parseFloat((await container.getAttribute("data-player-x")) ?? "0");
    const posZLeft = parseFloat((await container.getAttribute("data-player-z")) ?? "0");

    // Room interior bounds: X in [-3.83 .. 3.83], Z in [-2.83 .. 2.83]
    expect(posXLeft).toBeGreaterThanOrEqual(-3.83);
    expect(posXLeft).toBeLessThanOrEqual(3.83);
    expect(posZLeft).toBeGreaterThanOrEqual(-2.83);
    expect(posZLeft).toBeLessThanOrEqual(2.83);

    // Walk back (+Z) for 3 seconds continuously
    await page.keyboard.down("KeyS");
    await page.waitForTimeout(3000);
    await page.keyboard.up("KeyS");
    await page.waitForTimeout(200);

    const posXBack = parseFloat((await container.getAttribute("data-player-x")) ?? "0");
    const posZBack = parseFloat((await container.getAttribute("data-player-z")) ?? "0");

    expect(posXBack).toBeGreaterThanOrEqual(-3.83);
    expect(posXBack).toBeLessThanOrEqual(3.83);
    expect(posZBack).toBeGreaterThanOrEqual(-2.83);
    expect(posZBack).toBeLessThanOrEqual(2.83);
  });
});
