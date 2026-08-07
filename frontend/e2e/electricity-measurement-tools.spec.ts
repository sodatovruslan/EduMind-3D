import { test, expect, request as playwrightRequest, type Page } from "@playwright/test";

/**
 * Stage S9.3 — Measurement Tools acceptance test. Reuses the exact same
 * wiring helpers as electricity-lab.spec.ts (real mouse drag between real
 * projected terminal markers, not scripted state) — this test only adds
 * NEW assertions about the ammeter/voltmeter placement warnings, it does
 * not reimplement drag-and-drop or wiring.
 */
const API_URL = "http://localhost:8000";

async function registerAndLogin(): Promise<{ accessToken: string; refreshToken: string }> {
  const api = await playwrightRequest.newContext({ baseURL: API_URL });
  const email = `e2e_measure_${Date.now()}@example.com`;
  const password = "supersecret123";
  await api.post("/api/auth/register", { data: { email, password, full_name: "E2E Measurement" } });
  const loginResp = await api.post("/api/auth/login", { form: { username: email, password } });
  const tokens = await loginResp.json();
  await api.dispose();
  return { accessToken: tokens.access_token, refreshToken: tokens.refresh_token };
}

async function findElectricityLabSimulationId(accessToken: string): Promise<string> {
  const api = await playwrightRequest.newContext({
    baseURL: API_URL,
    extraHTTPHeaders: { Authorization: `Bearer ${accessToken}` },
  });
  const resp = await api.get("/api/simulations/?module=electricity_lab");
  const sims = await resp.json();
  await api.dispose();
  if (!sims.length) throw new Error("Нет посеянной симуляции electricity_lab — запусти seed_simulations.py");
  return sims[0].id;
}

async function terminalCenter(page: Page, terminalId: string) {
  const box = await page.getByTestId(`terminal-${terminalId}`).boundingBox();
  if (!box) throw new Error(`Терминал не найден на экране: ${terminalId}`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

const RENDER_SETTLE_MS = 4000; // см. electricity-lab.spec.ts — тот же документированный workaround

async function connectTerminals(page: Page, fromId: string, toId: string) {
  const from = await terminalCenter(page, fromId);
  const to = await terminalCenter(page, toId);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 15 });
  await page.mouse.up();
  await page.waitForTimeout(RENDER_SETTLE_MS);
}

test.describe("Electricity Lab — Measurement Tools (Stage S9.3)", () => {
  test("ammeter shows a real current when correct, an educational warning when wired in parallel, and recovers live", async ({
    page,
  }) => {
    const { accessToken, refreshToken } = await registerAndLogin();
    const simulationId = await findElectricityLabSimulationId(accessToken);

    await page.goto("/login");
    await page.evaluate(
      ([access, refresh]) => {
        window.localStorage.setItem("edumind_access_token", access);
        window.localStorage.setItem("edumind_refresh_token", refresh);
        window.localStorage.setItem("edumind:quality", "low");
      },
      [accessToken, refreshToken]
    );

    await page.goto(`/electricity_lab/${simulationId}`);
    await expect(page.getByTestId("terminal-battery_pos")).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(RENDER_SETTLE_MS);

    // 1. Correct series wiring: battery -> switch -> bulb -> ammeter -> battery.
    await connectTerminals(page, "battery_pos", "switch_a");
    await connectTerminals(page, "switch_b", "bulb_a");
    await connectTerminals(page, "bulb_b", "ammeter_a");
    await connectTerminals(page, "ammeter_b", "battery_neg");

    const ammeterReading = page.getByTestId("ammeter-reading");
    await expect(ammeterReading).toHaveAttribute("data-placement-status", "valid");
    const currentA = Number(await ammeterReading.getAttribute("data-value"));
    expect(currentA).toBeCloseTo(12 / 4, 1); // 12V / 4Ω bulb
    await expect(page.getByTestId("ammeter-reading-warning")).toHaveCount(0);

    // 2. Now ALSO wire the ammeter directly across the bulb — parallel,
    // invalid — must show the educational warning live, without reload.
    await connectTerminals(page, "ammeter_a", "bulb_a");
    await connectTerminals(page, "ammeter_b", "bulb_b");

    await expect(ammeterReading).toHaveAttribute("data-placement-status", "parallel_invalid", { timeout: 10_000 });
    await expect(page.getByTestId("ammeter-reading-warning")).toBeVisible();
    await expect(page.getByTestId("ammeter-reading-warning")).toContainText("параллельно");
  });
});
