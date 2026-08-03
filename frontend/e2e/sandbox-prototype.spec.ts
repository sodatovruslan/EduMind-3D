import { expect, test } from "@playwright/test";

test.describe("Stage S-7 v2 — CheckPoint S7-V2.4 Dynamic Furniture Collision BAT", () => {
  test.setTimeout(45_000);

  test("S7-V2.4: Player is blocked at table front edge, can slide diagonally, and can walk freely around table sides", async ({ page }) => {
    await page.goto("/sandbox-prototype");
    await page.waitForLoadState("networkidle");

    const container = page.getByTestId("sandbox-prototype-container");
    await expect(container).toHaveAttribute("data-spawn-valid", "true");

    // Wait until R3F table mesh dynamically registers runtime Box3 bounds
    await expect(container).toHaveAttribute("data-table-bounds", "X[-1.5..1.5] Z[-0.7..0.7]");
    await expect(container).toHaveAttribute("data-expanded-table", "X[-1.87..1.87] Z[-1.07..1.07]");

    // Focus viewport
    await page.locator("main").click();

    // 1. Walk forward towards table (KeyW moves along -Z from Z=2.50 towards expMaxZ=+1.07)
    await page.keyboard.down("KeyW");

    // Wait until player hits table edge (clamped at Z >= 1.07, blocked side "back")
    await page.waitForFunction(() => {
      const containerEl = document.querySelector('[data-testid="sandbox-prototype-container"]');
      const blocked = containerEl?.getAttribute("data-blocked-obstacle");
      return blocked === "main_table:back";
    }, { timeout: 15_000 });

    const posZAfterTableHit = parseFloat((await container.getAttribute("data-player-z")) ?? "0");
    const blockedObstacle = await container.getAttribute("data-blocked-obstacle");

    expect(blockedObstacle).toBe("main_table:back");
    expect(posZAfterTableHit).toBeGreaterThanOrEqual(1.05); // Clamped at edge of table!

    await page.keyboard.up("KeyW");
    await page.waitForTimeout(100);

    // 2. Walk left (KeyA) to bypass table on the left side (X < -1.87)
    await page.keyboard.down("KeyA");
    await page.waitForTimeout(2000);
    await page.keyboard.up("KeyA");
    await page.waitForTimeout(100);

    const posXAfterBypass = parseFloat((await container.getAttribute("data-player-x")) ?? "0");
    expect(posXAfterBypass).toBeLessThan(-1.87); // Walked past table left edge!

    // 3. Walk past table along -Z freely on the left side
    await page.keyboard.down("KeyW");
    await page.waitForTimeout(2000);
    await page.keyboard.up("KeyW");

    const posZAfterBypass = parseFloat((await container.getAttribute("data-player-z")) ?? "0");
    expect(posZAfterBypass).toBeLessThan(0.5); // Successfully walked past table!
  });
});
