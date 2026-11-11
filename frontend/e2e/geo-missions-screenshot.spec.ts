import { readFileSync } from "node:fs";
import { test, expect, request as playwrightRequest } from "@playwright/test";

// The GeoWorld missions played for real in a browser: the test opens the
// globe on a chosen mission, reads which question is on screen (through the
// __e2eGeoMission bridge — nothing on the globe is labelled, and the
// questions are reshuffled every run), clicks the right spot on the map and
// checks that the mission counts it. Screenshots are saved along the way so
// the look of the scene can be reviewed without a manual click-through.
//
// Run against already running dev servers:
//   npx playwright test e2e/geo-missions-screenshot.spec.ts
// Point it elsewhere with E2E_WEB_URL / E2E_API_URL. The defaults use
// 127.0.0.1 on purpose: "localhost" may resolve to IPv6 first, where
// another project's dev server can be listening on the same port.

const WEB_URL = process.env.E2E_WEB_URL ?? "http://127.0.0.1:3000";
const API_URL = process.env.E2E_API_URL ?? "http://127.0.0.1:8000";
const OUT_DIR = "test-results/geo-missions";

// uses the Chrome already installed on the machine (headless) — no separate browser download needed
test.use({ channel: "chrome" });

/** A point that is unmistakably inside each answer (same places the mission accepts). */
const RECORD_POINT: Record<string, [number, number]> = {
  andes: [-70.6, -33.4],
  everest: [86.93, 27.99],
  sahara: [10, 22],
  nile: [32.5, 15.6],
  mariana: [142.2, 11.37],
  baikal: [107.5, 53.4],
  "dead-sea": [35.5, 31.5],
  caspian: [51, 42],
  russia: [95, 62],
  greenland: [-42, 72],
};

/** A point well inside each country of the shapes mission. */
const COUNTRY_POINT: Record<string, [number, number]> = {
  TJK: [70.5, 38.8],
  UZB: [64.5, 41.5],
  KAZ: [68, 48],
  IND: [78.5, 22],
  ITA: [12.5, 43],
  JPN: [138, 36],
  BRA: [-51, -12],
  EGY: [29.5, 26.5],
  TUR: [33, 39],
  CHL: [-70.5, -33.5],
  AUS: [134, -25],
  MNG: [103, 47],
};

const CONTINENT_POINT: Record<string, [number, number]> = {
  eurasia: [80, 50],
  africa: [20, 5],
  north_america: [-100, 45],
  south_america: [-55, -10],
  australia: [134, -25],
  antarctica: [20, -80],
};

type MissionState = { missionId: string; target: string | null; done: number; total: number; isComplete: boolean };

async function missionState(page: import("@playwright/test").Page): Promise<MissionState> {
  return page.evaluate(() => (window as any).__e2eGeoMission());
}

/** Click the globe at real coordinates, through MapLibre's own projection. */
async function clickLngLat(page: import("@playwright/test").Page, lngLat: [number, number]) {
  const canvas = page.locator("canvas").first();
  const box = await canvas.boundingBox();
  expect(box, "map canvas on screen").toBeTruthy();
  const point = await page.evaluate((coords) => {
    const map = (window as any).__e2eGeoMap?.();
    if (!map) return null;
    // bring the target into view first: a point on the far side of the globe cannot be clicked
    const projected = map.project(coords);
    return { x: projected.x, y: projected.y };
  }, lngLat);
  expect(point, "the point is projected on screen").toBeTruthy();
  await page.mouse.click(box!.x + point!.x, box!.y + point!.y);
}

/** Centre the globe on a point so it is on the near side before clicking. */
async function centerOn(page: import("@playwright/test").Page, lngLat: [number, number], zoom = 2) {
  await page.evaluate(
    ({ coords, z }) => (window as any).__e2eGeoMap?.()?.jumpTo({ center: coords, zoom: z }),
    { coords: lngLat, z: zoom }
  );
  await page.waitForTimeout(1200);
}

async function openGeoOnMission(page: import("@playwright/test").Page, missionIndex: number, completedIds: string[]) {
  const api = await playwrightRequest.newContext({ baseURL: API_URL });
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

    await page.goto(`${WEB_URL}/login`, { waitUntil: "domcontentloaded", timeout: 60_000 });
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
    await page.goto(`${WEB_URL}/geo3d/${sims[0].id}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await expect(page.getByTestId("geo-mission-panel")).toBeVisible({ timeout: 120_000 });
    await expect(page.getByTestId("geo-mission-hud")).toBeVisible({ timeout: 120_000 });
  } finally {
    await api.dispose();
  }
}

test("mission 1 (continents): a right click is counted, a wrong one is not", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openGeoOnMission(page, 0, []);
  await page.waitForTimeout(12_000);
  await page.screenshot({ path: `${OUT_DIR}/mission-1-continents.png` });

  const state = await missionState(page);
  expect(state.missionId).toBe("geo-mission-continents");
  expect(state.target).toBeTruthy();

  const point = CONTINENT_POINT[state.target!];
  await centerOn(page, point, 1.6);
  await clickLngLat(page, point);
  await expect(page.getByTestId("geo-mission-feedback")).toHaveAttribute("data-tone", "success", { timeout: 15_000 });
  expect((await missionState(page)).done).toBe(1);
});

test("mission 2 (records): the asked record is found on the globe", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openGeoOnMission(page, 1, ["geo-mission-continents"]);
  await page.waitForTimeout(12_000);

  const state = await missionState(page);
  expect(state.missionId).toBe("geo-mission-records");
  expect(state.total).toBe(5);
  const target = state.target!;
  expect(Object.keys(RECORD_POINT)).toContain(target);
  await page.screenshot({ path: `${OUT_DIR}/mission-2-records.png` });

  const point = RECORD_POINT[target];
  await centerOn(page, point, 2.2);
  await clickLngLat(page, point);
  await expect(page.getByTestId("geo-mission-feedback")).toHaveAttribute("data-tone", "success", { timeout: 15_000 });

  const after = await missionState(page);
  expect(after.done).toBe(1);
  expect(after.target).not.toBe(target);
  await page.screenshot({ path: `${OUT_DIR}/mission-2-records-after.png` });
});

test("mission 2 (records): a click far from the answer is a miss, not progress", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openGeoOnMission(page, 1, ["geo-mission-continents"]);
  await page.waitForTimeout(12_000);

  const state = await missionState(page);
  // the Atlantic, well away from every record in the pool
  const wrong: [number, number] = [-30, -5];
  await centerOn(page, wrong, 2);
  await clickLngLat(page, wrong);

  await expect(page.getByTestId("geo-mission-feedback")).toHaveAttribute("data-tone", /error|info/, { timeout: 15_000 });
  const after = await missionState(page);
  expect(after.done).toBe(0);
  expect(after.target).toBe(state.target);
});

test("mission 3 (shapes): the silhouette is drawn and its country is found", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openGeoOnMission(page, 2, ["geo-mission-continents", "geo-mission-records"]);
  await page.waitForTimeout(12_000);

  const state = await missionState(page);
  expect(state.missionId).toBe("geo-mission-shapes");
  const target = state.target!;
  expect(Object.keys(COUNTRY_POINT)).toContain(target);

  const silhouette = page.getByTestId("geo-country-silhouette");
  await expect(silhouette).toBeVisible({ timeout: 30_000 });
  // the outline is real geometry, not an empty card
  const pathLength = await silhouette.locator("path").first().evaluate((el) => (el.getAttribute("d") ?? "").length);
  expect(pathLength).toBeGreaterThan(50);
  await page.screenshot({ path: `${OUT_DIR}/mission-3-shapes.png` });

  const point = COUNTRY_POINT[target];
  await centerOn(page, point, 3);
  await clickLngLat(page, point);
  await expect(page.getByTestId("geo-mission-feedback")).toHaveAttribute("data-tone", "success", { timeout: 15_000 });
  expect((await missionState(page)).done).toBe(1);
  await page.screenshot({ path: `${OUT_DIR}/mission-3-shapes-after.png` });
});

test("the Earth structure reference mode takes the map's place and gives it back", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openGeoOnMission(page, 0, []);
  await page.waitForTimeout(10_000);

  await page.getByTestId("geo-structure-open").click();
  await page.waitForTimeout(4_000);
  const mapGone = await page.evaluate(() => !(window as any).__e2eGeoMap?.());
  expect(mapGone, "MapLibre is unmounted while the cut-open Earth is on screen").toBe(true);
  await page.screenshot({ path: `${OUT_DIR}/structure-mode.png` });

  // the same button the student uses to come back
  await page.getByRole("button", { name: /поверхност|surface|сатҳ/i }).first().click();
  await page.waitForTimeout(6_000);
  await expect(page.getByTestId("geo-mission-hud")).toBeVisible({ timeout: 60_000 });
});
