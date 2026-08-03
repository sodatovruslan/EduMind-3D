import { expect, test } from "@playwright/test";

test.describe("Stage S-7 v2 — CheckPoint S7-V2.2 Kinematic WASD Locomotion BAT", () => {
  test.setTimeout(45_000);

  test("S7-V2.2: WASD keys advance player position along camera-relative XZ plane and stop on keyup", async ({ page }) => {
    await page.goto("/sandbox-prototype");
    await page.waitForLoadState("networkidle");

    const container = page.getByTestId("sandbox-prototype-container");
    await expect(container).toHaveAttribute("data-player-x", "0.00");
    await expect(container).toHaveAttribute("data-player-z", "2.50");

    // 1. Press KeyW -> Move forward along -Z
    await page.keyboard.down("KeyW");
    await page.waitForTimeout(300);

    await expect(container).toHaveAttribute("data-key-w", "true");
    const posZAfterW = parseFloat((await container.getAttribute("data-player-z")) ?? "2.50");
    expect(posZAfterW).toBeLessThan(2.50); // Player moved forward towards table

    // 2. Keyup KeyW -> Instant stop
    await page.keyboard.up("KeyW");
    await page.waitForTimeout(100);
    await expect(container).toHaveAttribute("data-key-w", "false");
    await expect(container).toHaveAttribute("data-is-moving", "false");

    // 3. Press KeyD -> Strafe right along +X
    await page.keyboard.down("KeyD");
    await page.waitForTimeout(300);

    await expect(container).toHaveAttribute("data-key-d", "true");
    const posXAfterD = parseFloat((await container.getAttribute("data-player-x")) ?? "0.00");
    expect(posXAfterD).toBeGreaterThan(0.00); // Player strafed right

    await page.keyboard.up("KeyD");
    await page.waitForTimeout(100);
    await expect(container).toHaveAttribute("data-is-moving", "false");
  });
});
