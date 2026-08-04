import { expect, request as playwrightRequest, test, type Page } from "@playwright/test";

const ARTIFACT_DIR = "../artifacts/chemistry-water-pouring";

async function registerAndOpenChemistry(page: Page) {
  const api = await playwrightRequest.newContext({ baseURL: "http://localhost:8000" });
  const email = `e2e_water_shot_${Date.now()}_${Math.random()}@example.com`;
  const password = "supersecret123";
  expect(
    (await api.post("/api/auth/register", { data: { email, password, full_name: "E2E Water Shot" } })).ok()
  ).toBeTruthy();
  const tokens = await (await api.post("/api/auth/login", { form: { username: email, password } })).json();
  const labs = await (
    await api.get("/api/simulations/?module=chemistry_world", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    })
  ).json();
  await api.dispose();

  await page.goto("http://localhost:3000/login", { waitUntil: "domcontentloaded" });
  await page.evaluate((authTokens) => {
    localStorage.setItem("edumind_access_token", authTokens.access_token);
    localStorage.setItem("edumind_refresh_token", authTokens.refresh_token);
    localStorage.setItem("edumind:quality", "low");
    localStorage.setItem("edumind_chemistry_tutorial_done", "1");
  }, tokens);
  await page.goto(`http://localhost:3000/chemistry_world/${labs[0].id}`, { waitUntil: "domcontentloaded" });
  await expect(page.locator("canvas")).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(4_000);
}

async function projectedCenter(page: Page, testId: string) {
  const box = await page.getByTestId(testId).boundingBox();
  if (!box) throw new Error(`Missing projected target: ${testId}`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function dragBottleTo(page: Page, bottleId: string, zoneId: string) {
  const from = await projectedCenter(page, `stock-bottle-target-${bottleId}`);
  const to = await projectedCenter(page, zoneId);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 20 });
  await page.mouse.up();
  await page.waitForTimeout(1_800);
}

async function openAndPourWater(page: Page) {
  await registerAndOpenChemistry(page);
  await dragBottleTo(page, "stock-water", "container-drop-zone-water-beaker-1");
  await expect(page.getByTestId("container-target-beaker-1")).toHaveAttribute("data-water-grams", "100");
}

test("capture water in beaker", async ({ page }) => {
  test.setTimeout(360_000);
  await openAndPourWater(page);
  await page.locator("canvas").screenshot({ path: `${ARTIFACT_DIR}/01-water-in-beaker.png`, timeout: 180_000 });
});

test("capture dissolved NaCl", async ({ page }) => {
  test.setTimeout(360_000);
  await openAndPourWater(page);
  await dragBottleTo(page, "stock-nacl", "container-drop-zone-reagent-beaker-1");
  await expect(page.getByTestId("container-target-beaker-1")).toHaveAttribute(
    "data-nacl-dissolved-grams",
    "20"
  );
  await page.locator("canvas").screenshot({ path: `${ARTIFACT_DIR}/02-nacl-dissolved.png`, timeout: 180_000 });
});

test("capture excess NaCl precipitate", async ({ page }) => {
  test.setTimeout(720_000);
  await openAndPourWater(page);
  await dragBottleTo(page, "stock-nacl", "container-drop-zone-reagent-beaker-1");
  await dragBottleTo(page, "stock-nacl", "container-drop-zone-reagent-beaker-1");
  await expect(page.getByTestId("container-target-beaker-1")).toHaveAttribute(
    "data-nacl-precipitate-grams",
    "4"
  );
  await page.locator("canvas").screenshot({
    path: `${ARTIFACT_DIR}/03-nacl-excess-precipitate.png`,
    timeout: 180_000,
  });
});
