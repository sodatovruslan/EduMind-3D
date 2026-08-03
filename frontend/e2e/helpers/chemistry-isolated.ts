import {
  chromium,
  expect,
  request as playwrightRequest,
  type Browser,
  type BrowserContext,
  type Page,
  type TestInfo,
} from "@playwright/test";

export interface BrowserDiagnostics {
  consoleErrors: string[];
  pageErrors: string[];
  requestFailures: string[];
  badResponses: string[];
}

export interface IsolatedChemistrySession {
  page: Page;
  diagnostics: BrowserDiagnostics;
  canvas: { x: number; y: number; width: number; height: number };
}

const CLOSE_TIMEOUT_MS = 5_000;

async function settleClose(action: () => Promise<unknown>) {
  await Promise.race([
    action().catch(() => undefined),
    new Promise<void>((resolve) => setTimeout(resolve, CLOSE_TIMEOUT_MS)),
  ]);
}

async function openChemistry(page: Page) {
  const api = await playwrightRequest.newContext({ baseURL: "http://localhost:8000" });
  try {
    const email = `e2e_s25_${Date.now()}_${Math.random().toString(16).slice(2)}@example.com`;
    const password = "supersecret123";
    expect(
      (await api.post("/api/auth/register", { data: { email, password, full_name: "E2E S2.5" } })).ok()
    ).toBeTruthy();
    const login = await api.post("/api/auth/login", { form: { username: email, password } });
    expect(login.ok()).toBeTruthy();
    const tokens = await login.json();
    const labsResponse = await api.get("/api/simulations/?module=chemistry_world", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    expect(labsResponse.ok()).toBeTruthy();
    const labs = await labsResponse.json();

    await page.goto("http://localhost:3000/login", { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.evaluate((authTokens) => {
      localStorage.setItem("edumind_access_token", authTokens.access_token);
      localStorage.setItem("edumind_refresh_token", authTokens.refresh_token);
      localStorage.setItem("edumind:quality", "low");
      localStorage.setItem("edumind_chemistry_tutorial_done", "1");
    }, tokens);
    await page.goto(`http://localhost:3000/chemistry_world/${labs[0].id}`, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await expect(page.locator("canvas")).toBeVisible({ timeout: 45_000 });
    await page.waitForTimeout(2_000);
  } finally {
    await api.dispose();
  }
}

export async function withIsolatedChemistry(
  testInfo: TestInfo,
  run: (session: IsolatedChemistrySession) => Promise<void>,
  options: { viewport?: { width: number; height: number }; screenshot?: boolean } = {}
) {
  let browser: Browser | undefined;
  let context: BrowserContext | undefined;
  let page: Page | undefined;
  const diagnostics: BrowserDiagnostics = {
    consoleErrors: [],
    pageErrors: [],
    requestFailures: [],
    badResponses: [],
  };

  try {
    browser = await chromium.launch({
      headless: true,
      args: ["--use-angle=swiftshader", "--disable-dev-shm-usage"],
    });
    context = await browser.newContext({ viewport: options.viewport ?? { width: 1024, height: 640 } });
    page = await context.newPage();
    page.setDefaultTimeout(25_000);
    page.on("console", (message) => {
      if (message.type() === "error") diagnostics.consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => diagnostics.pageErrors.push(error.message));
    page.on("requestfailed", (request) => diagnostics.requestFailures.push(`${request.method()} ${request.url()}`));
    page.on("response", (response) => {
      if (response.status() >= 400) diagnostics.badResponses.push(`${response.status()} ${response.url()}`);
    });

    await openChemistry(page);
    const canvas = await page.locator("canvas").evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    });
    if (canvas.width <= 0 || canvas.height <= 0) throw new Error("Canvas has no screen-space bounds");
    await run({ page, diagnostics, canvas });
    expect(diagnostics.consoleErrors, "browser console errors").toEqual([]);
    expect(diagnostics.pageErrors, "uncaught page errors").toEqual([]);
    expect(diagnostics.requestFailures, "failed network requests").toEqual([]);
    expect(diagnostics.badResponses, "HTTP responses >= 400").toEqual([]);
    if (options.screenshot !== false) {
      await page.screenshot({ path: testInfo.outputPath("key-result.png"), timeout: 25_000 });
    }
  } finally {
    if (page) await settleClose(() => page!.close({ runBeforeUnload: false }));
    if (context) await settleClose(() => context!.close());
    if (browser) await settleClose(() => browser!.close());
  }
}

export async function projectedCenter(page: Page, testId: string) {
  return page.getByTestId(testId).evaluate((element) => {
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      throw new Error(`Projected marker has no screen-space bounds: ${element.getAttribute("data-testid")}`);
    }
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  });
}

export async function bringProjectedTargetIntoCanvas(
  page: Page,
  canvas: IsolatedChemistrySession["canvas"],
  testId: string
) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const target = await projectedCenter(page, testId);
    if (
      target.x >= canvas.x + 8 &&
      target.x <= canvas.x + canvas.width - 8 &&
      target.y >= canvas.y + 8 &&
      target.y <= canvas.y + canvas.height - 8
    ) {
      return;
    }

    const startX = canvas.x + canvas.width * 0.5;
    const startY = canvas.y + canvas.height * 0.12;
    const direction = target.x < canvas.x ? 1 : -1;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + direction * canvas.width * 0.18, startY, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(500);
  }

  const target = await projectedCenter(page, testId);
  throw new Error(`OrbitControls could not bring projected target into canvas: ${JSON.stringify({ target, canvas })}`);
}

export async function aimCameraAtSpikeCabinet(
  page: Page,
  canvas: IsolatedChemistrySession["canvas"]
) {
  await page.mouse.move(canvas.x + canvas.width * 0.5, canvas.y + canvas.height * 0.78);
  await page.mouse.down();
  await page.mouse.move(canvas.x + canvas.width * 0.5, canvas.y + canvas.height * 0.48, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(700);
}

export async function openSpikeCabinet(
  page: Page,
  canvas: IsolatedChemistrySession["canvas"]
) {
  const door = await projectedCenter(page, "spike-cabinet-door-target");
  if (
    door.x < canvas.x ||
    door.x > canvas.x + canvas.width ||
    door.y < canvas.y ||
    door.y > canvas.y + canvas.height
  ) {
    throw new Error(`Cabinet marker is outside canvas: ${JSON.stringify({ door, canvas })}`);
  }
  const state = page.getByTestId("spike-cabinet-state");
  if ((await state.getAttribute("data-open")) === "true") return;

  for (const [dx, dy] of [[0, 0], [0, -12], [-12, 0], [12, 0], [0, 12], [-20, 0], [20, 0]]) {
    await page.mouse.move(door.x + dx, door.y + dy);
    await page.waitForTimeout(100);
    await page.mouse.click(door.x + dx, door.y + dy);
    await page.waitForTimeout(150);
    if ((await state.getAttribute("data-focused")) === "true") {
      await page.keyboard.press("KeyE");
      await page.waitForTimeout(300);
    }
    if ((await state.getAttribute("data-open")) === "true") {
      await page.waitForTimeout(600);
      return;
    }
  }

  // Backup fallback: press E when aiming at door center
  await page.mouse.move(door.x, door.y);
  await page.keyboard.press("KeyE");
  await page.waitForTimeout(600);
  if ((await state.getAttribute("data-open")) !== "true") {
    throw new Error(`Cabinet marker did not raycast or open: ${JSON.stringify({ door, canvas })}`);
  }
}

export async function focusItem(
  page: Page,
  id: string,
  canvas: IsolatedChemistrySession["canvas"],
  projectedTestId = `interactable-target-${id}`,
  clickFallback = true
) {
  const state = page.getByTestId("chemistry-interaction-state");
  if ((await state.getAttribute("data-focused-id")) === id) return;
  const target = await projectedCenter(page, projectedTestId);
  const projectedOffsets = [
    [0, 0],
    [0, -10],
    [-10, 0],
    [10, 0],
    [0, 10],
    [-8, -8],
    [8, -8],
    [-16, 0],
    [16, 0],
    [0, -16],
    [0, 16],
    [-16, -16],
    [16, -16],
    [-24, 0],
    [24, 0],
  ];

  for (const [dx, dy] of projectedOffsets) {
    await page.mouse.move(canvas.x + 3, canvas.y + 3);
    await page.mouse.move(target.x + dx, target.y + dy, { steps: clickFallback ? 3 : 12 });
    await page.waitForTimeout(clickFallback ? 180 : 300);
    if ((await state.getAttribute("data-focused-id")) === id) return;

    if (!clickFallback) continue;

    // Software WebGL may skip a hover-only R3F pointer frame. A click around
    // the projected world marker still exercises the real scene hitbox.
    await page.mouse.click(target.x + dx, target.y + dy);
    await expect(state).toHaveAttribute("data-dragging-id", "none");
    if ((await state.getAttribute("data-focused-id")) === id) return;
  }
  throw new Error(`Projected marker raycast did not focus ${id}: ${JSON.stringify({ target, canvas })}`);
}

export async function aimAtFreeTablePoint(
  page: Page,
  canvas: IsolatedChemistrySession["canvas"]
) {
  const state = page.getByTestId("chemistry-interaction-state");
  const projectedMarkers: Array<{ x: number; y: number }> = [];
  for (let index = 0; index < 4; index += 1) {
    const marker = await projectedCenter(page, `placement-marker-table-free-${index}`);
    projectedMarkers.push(marker);
    if (
      marker.x >= canvas.x &&
      marker.x <= canvas.x + canvas.width &&
      marker.y >= canvas.y &&
      marker.y <= canvas.y + canvas.height
    ) {
      await page.mouse.move(marker.x, marker.y);
      await page.waitForTimeout(120);
      if ((await state.getAttribute("data-placement-valid")) === "true") {
        await expect(page.getByText(/E — Поставить:/)).toBeVisible();
        return;
      }
    }
  }
  for (const y of [0.4, 0.5, 0.6, 0.7, 0.8]) {
    for (const x of [0.12, 0.22, 0.34, 0.66, 0.78, 0.88]) {
      await page.mouse.move(canvas.x + canvas.width * x, canvas.y + canvas.height * y);
      await page.waitForTimeout(70);
      if ((await state.getAttribute("data-placement-valid")) === "true") {
        await expect(page.getByText(/E — Поставить:/)).toBeVisible();
        return;
      }
    }
  }
  throw new Error(`No valid free table placement point found: ${JSON.stringify({ canvas, projectedMarkers })}`);
}

export async function pickupAndEscape(
  page: Page,
  id: string,
  canvas: IsolatedChemistrySession["canvas"],
  projectedTestId?: string,
  clickFallback = true
) {
  const state = page.getByTestId("chemistry-interaction-state");
  await focusItem(page, id, canvas, projectedTestId, clickFallback);
  await page.keyboard.press("KeyE");
  await expect(state).toHaveAttribute("data-held-id", id);
  await expect(state).toHaveAttribute("data-dragging-id", "none");
  await page.keyboard.press("Escape");
  await expect(state).toHaveAttribute("data-held-id", "none");
  await expect(state).toHaveAttribute("data-dragging-id", "none");
}

export async function pickupAndPlace(
  page: Page,
  id: string,
  canvas: IsolatedChemistrySession["canvas"],
  projectedTestId?: string,
  clickFallback = true
) {
  const state = page.getByTestId("chemistry-interaction-state");
  await focusItem(page, id, canvas, projectedTestId, clickFallback);
  await page.keyboard.press("KeyE");
  await expect(state).toHaveAttribute("data-held-id", id);
  await aimAtFreeTablePoint(page, canvas);
  await page.keyboard.press("KeyE");
  await expect(state).toHaveAttribute("data-held-id", "none");
  await expect(state).toHaveAttribute("data-dragging-id", "none");
}

export async function projectedClickEscapeAndPlace(
  page: Page,
  id: string,
  canvas: IsolatedChemistrySession["canvas"],
  projectedTestId = `interactable-target-${id}`
) {
  const state = page.getByTestId("chemistry-interaction-state");
  const pickupFromProjectedTarget = async () => {
    const target = await projectedCenter(page, projectedTestId);
    await page.mouse.move(target.x, target.y, { steps: 2 });
    await page.mouse.down();
    await page.keyboard.press("KeyE");
    await page.mouse.up();
  };

  await pickupFromProjectedTarget();
  await expect(state).toHaveAttribute("data-held-id", id);
  await expect(state).toHaveAttribute("data-dragging-id", "none");
  await page.keyboard.press("Escape");
  await expect(state).toHaveAttribute("data-held-id", "none");

  await pickupFromProjectedTarget();
  await expect(state).toHaveAttribute("data-held-id", id);
  await expect(state).toHaveAttribute("data-dragging-id", "none");
  await aimAtFreeTablePoint(page, canvas);
  await page.keyboard.press("KeyE");
  await expect(state).toHaveAttribute("data-held-id", "none");
  await expect(state).toHaveAttribute("data-dragging-id", "none");
}

export async function dragBetween(page: Page, fromId: string, toId: string) {
  const from = await projectedCenter(page, fromId);
  const to = await projectedCenter(page, toId);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(1_800);
  await expect(page.getByTestId("chemistry-interaction-state")).toHaveAttribute("data-dragging-id", "none");
  await expect(page.getByTestId("chemistry-interaction-state")).toHaveAttribute("data-held-id", "none");
}
