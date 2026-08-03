import { expect, test } from "@playwright/test";

test.describe("Stage S-7 v2 — CheckPoint S7-V2.3 Dynamic Room Bounds & Wall Collisions BAT", () => {
  test.setTimeout(45_000);

  test("S7-V2.3: Player is clamped inside room interior boundaries and cannot walk into black void", async ({ page }) => {
    await page.goto("/sandbox-prototype");
    await page.waitForLoadState("networkidle");

    const container = page.getByTestId("sandbox-prototype-container");
    await expect(container).toHaveAttribute("data-spawn-valid", "true");
    await expect(container).toHaveAttribute("data-room-interior", /X\[-3\.83\.\.3\.83\]/);

    // Focus viewport
    await page.locator("main").click();

    // 1. Walk continuously forward (towards back wall along -Z)
    await page.keyboard.down("KeyW");

    // Wait until player hits back wall (clamped at Z >= -2.85)
    await page.waitForFunction(() => {
      const containerEl = document.querySelector('[data-testid="sandbox-prototype-container"]');
      const blocked = containerEl?.getAttribute("data-blocked-wall");
      return blocked === "back";
    }, { timeout: 15_000 });

    const posZAfterBackWall = parseFloat((await container.getAttribute("data-player-z")) ?? "0");
    const blockedStatusBack = await container.getAttribute("data-blocked-wall");

    expect(blockedStatusBack).toBe("back");
    expect(posZAfterBackWall).toBeGreaterThanOrEqual(-2.85); // Clamped inside back wall!

    await page.keyboard.up("KeyW");
    await page.waitForTimeout(100);

    // 2. Walk continuously left (towards left wall along -X)
    await page.keyboard.down("KeyA");

    // Wait until player hits left wall (clamped at X >= -3.85)
    await page.waitForFunction(() => {
      const containerEl = document.querySelector('[data-testid="sandbox-prototype-container"]');
      const blocked = containerEl?.getAttribute("data-blocked-wall");
      return blocked === "left";
    }, { timeout: 15_000 });

    const posXAfterLeftWall = parseFloat((await container.getAttribute("data-player-x")) ?? "0");
    const blockedStatusLeft = await container.getAttribute("data-blocked-wall");

    expect(blockedStatusLeft).toBe("left");
    expect(posXAfterLeftWall).toBeGreaterThanOrEqual(-3.85); // Clamped inside left wall!

    await page.keyboard.up("KeyA");
    await page.waitForTimeout(100);
  });
});
