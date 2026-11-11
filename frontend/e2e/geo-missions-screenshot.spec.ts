import { readFileSync } from "node:fs";
import { test, expect, request as playwrightRequest } from "@playwright/test";

// Visual check of the GeoWorld missions: opens the globe on a chosen mission
// and saves screenshots, so the look of the scene can be reviewed without a
// manual click-through. Run against the already running dev servers:
//   npx playwright test e2e/geo-missions-screenshot.spec.ts
// Screenshots land in test-results/geo-missions/.

const OUT_DIR = "test-results/geo-missions";

// uses the Chrome already installed on the machine (headless) — no separate browser download needed
test.use({ channel: "chrome" });

async function openGeoOnMission(page: import("@playwright/test").Page, missionIndex: number, completedIds: string[]) {
  const api = await playwrightRequest.newContext({ baseURL: "http://localhost:8000" });
  try {
    const email = `e2e_geo_${Date.now()}_${Math.random().toString(16).slice(2)}@example.com`;
    const password = "supersecret123";
    expect((await api.post("/api/auth/register", { data: { email, password, full_name: "E2E Geo" } })).ok()).toBeTruthy();
    // New accounts must confirm their email. Without SMTP the dev backend
    // prints the code to its log; BACKEND_LOG points at that log file.
    const logPath = process.env.BACKEND_LOG;
    if (logPath) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      const log = readFileSync(logPath, "utf-8");
      const marker = `Verification code for ${email}: `;
      const at = log.lastIndexOf(marker);
      const code = at >= 0 ? log.slice(at + marker.length).trim().split(/\s/)[0] : undefined;
      expect(code, "verification code in backend log").toBeTruthy();
      expect((await api.post("/api/auth/verify-email", { data: { email, code } })).ok()).toBeTruthy();
    }
    const login = await api.post("/api/auth/login", { form: { username: email, password } });
    expect(login.ok()).toBeTruthy();
    const tokens = await login.json();
    const headers = { Authorization: `Bearer ${tokens.access_token}` };
    const me = await (await api.get("/api/auth/me", { headers })).json();
    const sims = await (await api.get("/api/simulations/?module=geo3d", { headers })).json();
    expect(sims.length).toBeGreaterThan(0);

    await page.goto("http://localhost:3000/login", { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.evaluate(
      ({ authTokens, key, progress }) => {
        localStorage.setItem("edumind_access_token", authTokens.access_token);
        localStorage.setItem("edumind_refresh_token", authTokens.refresh_token);
        localStorage.setItem(key, JSON.stringify(progress));
      },
      {
        authTokens: tokens,
        key: `edumind:geo-missions:${me.id}:${sims[0].id}`,
        progress: { missionIndex, completedIds, totalXp: 0 },
      }
    );
    await page.goto(`http://localhost:3000/geo3d/${sims[0].id}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await expect(page.getByTestId("geo-mission-panel")).toBeVisible({ timeout: 120_000 });
  } finally {
    await api.dispose();
  }
}

test("mission 2 (volcanoes) shows volcano dots on the globe", async ({ page }) => {
  page.on("console", (msg) => {
    if ((msg.type() === "error" || msg.type() === "warning") && !msg.text().includes("performance warning")) console.log(`[browser ${msg.type()}]`, msg.text().slice(0, 300));
  });
  page.on("request", (req) => {
    if (/volcano|tectonic|PB2002/i.test(req.url())) console.log("[request]", req.url().slice(0, 160));
  });
  page.on("requestfailed", (req) => console.log("[request failed]", req.failure()?.errorText, req.url().slice(0, 160)));
  page.on("response", (res) => {
    const url = res.url();
    if (res.status() >= 400 || /volcano|tectonic|PB2002|natural-earth/i.test(url)) console.log(`[response ${res.status()}]`, url.slice(0, 160));
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await openGeoOnMission(page, 1, ["geo-mission-continents"]);
  // camera flight + imagery + volcano data
  await page.waitForTimeout(25_000);
  await page.screenshot({ path: `${OUT_DIR}/mission-2-volcanoes.png` });

  const layerState = await page.evaluate(() => {
    const map = (window as any).__e2eGeoMap?.();
    if (!map) return { hasMap: false };
    const layers = map.getStyle().layers.map((l: any) => `${l.id}:${map.getLayoutProperty(l.id, "visibility") ?? "visible"}`);
    let fetchProbe = "ok";
    try {
      const holder = { f: fetch };
      holder.f("data:text/plain,x").catch(() => {});
    } catch (err) {
      fetchProbe = String(err);
    }
    return {
      fetchProbe,
      hasMap: true,
      styleLoaded: map.isStyleLoaded(),
      zoom: map.getZoom(),
      layers,
      volcanoSource: Boolean(map.getSource("geo-volcanoes")),
      volcanoFeatures: map.getSource("geo-volcanoes") ? map.querySourceFeatures("geo-volcanoes").length : -1,
      tectonicFeatures: map.getSource("geo-tectonics") ? map.querySourceFeatures("geo-tectonics").length : -1,
    };
  });
  console.log("layer state:", JSON.stringify(layerState));
});

test("mission 1 (continents) opening view", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openGeoOnMission(page, 0, []);
  await page.waitForTimeout(15_000);
  await page.screenshot({ path: `${OUT_DIR}/mission-1-continents.png` });
});
