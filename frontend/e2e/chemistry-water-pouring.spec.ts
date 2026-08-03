import { expect, request as playwrightRequest, test, type Page } from "@playwright/test";

async function registerAndOpenChemistry(page: Page) {
  const api = await playwrightRequest.newContext({ baseURL: "http://localhost:8000" });
  const email = `e2e_water_pour_${Date.now()}@example.com`;
  const password = "supersecret123";
  expect(
    (await api.post("/api/auth/register", { data: { email, password, full_name: "E2E Water Pour" } })).ok()
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
  await page.waitForTimeout(1_800); // 750ms pour animation + slow software WebGL settle
  await expect(page.getByTestId("chemistry-interaction-state")).toHaveAttribute("data-dragging-id", "none");
  await expect(page.getByTestId("chemistry-interaction-state")).toHaveAttribute("data-held-id", "none");
}

test("water -> beaker -> soluble NaCl -> excess NaCl precipitate", async ({ page }) => {
  test.setTimeout(360_000);
  const consoleErrors: string[] = [];
  const consoleWarnings: string[] = [];
  const pageErrors: string[] = [];
  const requestFailures: string[] = [];
  const badResponses: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
    if (message.type() === "warning") consoleWarnings.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("requestfailed", (request) => requestFailures.push(`${request.method()} ${request.url()}`));
  page.on("response", (response) => {
    if (response.status() >= 400) badResponses.push(`${response.status()} ${response.url()}`);
  });

  await registerAndOpenChemistry(page);
  const beaker = page.getByTestId("container-target-beaker-1");
  const waterBottle = page.getByTestId("stock-bottle-target-stock-water");
  const saltBottle = page.getByTestId("stock-bottle-target-stock-nacl");

  expect(Number(await waterBottle.getAttribute("data-remaining-grams"))).toBe(500);
  await expect(page.getByTestId("experiment-error-list")).toContainText("в сосуде нет воды");

  await dragBottleTo(page, "stock-water", "container-drop-zone-water-beaker-1");
  expect(Number(await waterBottle.getAttribute("data-remaining-grams"))).toBe(400);
  expect(Number(await beaker.getAttribute("data-water-grams"))).toBe(100);
  await expect(page.getByTestId("experiment-error-list")).not.toContainText("в сосуде нет воды");

  await dragBottleTo(page, "stock-nacl", "container-drop-zone-reagent-beaker-1");
  expect(Number(await saltBottle.getAttribute("data-remaining-grams"))).toBe(480);
  expect(Number(await beaker.getAttribute("data-nacl-dissolved-grams"))).toBe(20);
  expect(Number(await beaker.getAttribute("data-nacl-precipitate-grams"))).toBe(0);
  await expect(page.getByTestId("experiment-status")).toHaveAttribute("data-status", "completed");

  await dragBottleTo(page, "stock-nacl", "container-drop-zone-reagent-beaker-1");
  expect(Number(await saltBottle.getAttribute("data-remaining-grams"))).toBe(460);
  expect(Number(await beaker.getAttribute("data-nacl-dissolved-grams"))).toBe(36);
  expect(Number(await beaker.getAttribute("data-nacl-precipitate-grams"))).toBe(4);
  await expect(page.getByTestId("experiment-error-list")).toContainText("часть соли не растворилась");

  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
  expect(requestFailures).toEqual([]);
  expect(badResponses).toEqual([]);
  console.log("[WATER POUR BAT]", JSON.stringify({
    consoleErrors,
    consoleWarnings,
    pageErrors,
    requestFailures,
    badResponses,
    waterRemainingGrams: 400,
    saltRemainingGrams: 460,
    beakerWaterGrams: 100,
    beakerNaclDissolvedGrams: 36,
    beakerNaclPrecipitateGrams: 4,
  }));
});
