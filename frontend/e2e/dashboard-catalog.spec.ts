import { test, expect, request as playwrightRequest, chromium } from "@playwright/test";

/**
 * Stage: Simulation catalog cleanup. Dashboard renders GET /api/simulations/
 * verbatim (no client-side title filtering) — the visibility gate lives
 * entirely in the backend (default filter to visibility="public"). This
 * test proves the real end-to-end result: a fresh user opening /dashboard
 * sees exactly the 3 real simulations and none of the test/archived ones.
 *
 * No WebGL/Chemistry World canvas involved here, so this doesn't need the
 * heavy chemistry-isolated.ts SwiftShader setup — a plain page is enough
 * and this runs in a few seconds.
 */
const API_URL = "http://localhost:8000";

async function registerAndLogin(): Promise<{ accessToken: string; refreshToken: string }> {
  const api = await playwrightRequest.newContext({ baseURL: API_URL });
  const email = `e2e_dashboard_${Date.now()}@example.com`;
  const password = "supersecret123";
  await api.post("/api/auth/register", { data: { email, password, full_name: "E2E Dashboard" } });
  const loginResp = await api.post("/api/auth/login", { form: { username: email, password } });
  const tokens = await loginResp.json();
  await api.dispose();
  return { accessToken: tokens.access_token, refreshToken: tokens.refresh_token };
}

test("Dashboard shows exactly the 3 real simulations, no test/archived cards", async () => {
  const { accessToken, refreshToken } = await registerAndLogin();

  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto("http://localhost:3000/login", { waitUntil: "domcontentloaded", timeout: 20_000 });
    await page.evaluate(
      (tokens) => {
        localStorage.setItem("edumind_access_token", tokens.access);
        localStorage.setItem("edumind_refresh_token", tokens.refresh);
      },
      { access: accessToken, refresh: refreshToken }
    );

    await page.goto("http://localhost:3000/dashboard", { waitUntil: "domcontentloaded", timeout: 20_000 });

    const cards = page.locator('[href^="/geo3d/"], [href^="/electricity_lab/"], [href^="/chemistry_world/"]');
    await expect(cards).toHaveCount(3, { timeout: 15_000 });

    const titles = await cards.locator("h3").allTextContents();
    expect(titles.sort()).toEqual(
      [
        "Chemistry World: первые эксперименты",
        "Собери электрическую цепь",
        "Строение Земли: кора, мантия, ядро",
      ].sort()
    );

    const pageText = await page.textContent("body");
    expect(pageText).not.toContain("Нейтрализация HCl + NaOH");
    expect(pageText).not.toContain("Внутреннее строение Земли");
    expect(pageText).not.toContain("Chemistry World for E2E Tests");
    expect(pageText).not.toContain("Chemistry Lab for optimistic lock tests");
  } finally {
    await browser.close();
  }
});
