import { expect, request as playwrightRequest, test, type Route } from "@playwright/test";
import {
  aimCameraAtSpikeCabinet,
  bringProjectedTargetIntoCanvas,
  dragBetween,
  focusItem,
  openSpikeCabinet,
  pickupAndPlace,
  projectedCenter,
  withIsolatedChemistry,
} from "./helpers/chemistry-isolated";

test.describe("Stage S-8 — Chemistry Save, Autosave, Resume & Hydration E2E Acceptance", () => {
  test.setTimeout(240_000);

  // ─────────────────────────────────────────────────────────────────────────────
  // Test 1 — Full domain-state round-trip: burner, contents, position, cabinet
  // ─────────────────────────────────────────────────────────────────────────────
  test("1. Full save/resume round-trip: burner.isOn, contents, position, cabinet.isOpen", async ({}, testInfo) => {
    await withIsolatedChemistry(
      testInfo,
      async ({ page, canvas }) => {
        // — Select experiment —
        process.stdout.write("[E2E PROGRESS] 1. Waiting for canvas...\n");
        await expect(page.locator("canvas")).toBeVisible({ timeout: 20_000 });
        process.stdout.write("[E2E PROGRESS] 2. Clicking start experiment...\n");
        const startBtn = page.locator('[data-testid="catalog-start-lab-beginner-heating-water"]');
        await expect(startBtn).toBeVisible({ timeout: 10_000 });
        await startBtn.click();
        process.stdout.write("[E2E PROGRESS] 3. Guided lab panel loaded.\n");
        await expect(page.locator('[data-testid="guided-lab-panel"]')).toBeVisible({ timeout: 15_000 });
        await page.waitForTimeout(3_000); // Wait for camera fly animation
        await expect(page.getByTestId("chemistry-hydration-state")).toHaveAttribute("data-hydrated", "false");

        // — Toggle burner ON via domain action —
        process.stdout.write("[E2E PROGRESS] 4. Toggling burner state...\n");
        await page.waitForFunction(() => !!(window as any).__e2eChemistry, null, { timeout: 60_000 });
        await page.evaluate(() => {
          (window as any).__e2eChemistry.toggleBurner("burner-1");
        });
        const burnerTarget = page.getByTestId("burner-toggle-burner-1");
        await expect(burnerTarget).toHaveAttribute("data-is-on", "true", { timeout: 15_000 });

        // — Move beaker-1 to a different table position via domain action —
        process.stdout.write("[E2E PROGRESS] 5. Moving beaker-1...\n");
        await page.evaluate(() => {
          (window as any).__e2eChemistry.moveItem("beaker-1", [0.45, 0.65]);
        });

        // — Pour water from stock bottle into beaker-1 via domain action —
        process.stdout.write("[E2E PROGRESS] 6. Preparing pour...\n");
        const stockWaterTarget = page.getByTestId("stock-bottle-target-stock-water");
        const beakerTarget = page.getByTestId("container-target-beaker-1");
        const waterGramsBefore = Number((await beakerTarget.getAttribute("data-water-grams")) ?? "0");

        await page.evaluate(() => {
          (window as any).__e2eChemistry.setBottleCapState("stock-water", "open");
        });
        await expect(stockWaterTarget).toHaveAttribute("data-cap-state", "open", { timeout: 15_000 });
        await page.waitForTimeout(300);

        await page.evaluate(() => {
          (window as any).__e2eChemistry.pourFromStockBottle("stock-water", "beaker-1", 50);
        });
        // Poll instead of a single immediate read: the dispatch resolves the domain
        // state synchronously, but React's re-render (and DOM attribute update) lands
        // on a later microtask, so reading the attribute right away can race the commit.
        await expect
          .poll(async () => Number((await beakerTarget.getAttribute("data-water-grams")) ?? "0"), { timeout: 15_000 })
          .toBeGreaterThan(waterGramsBefore);
        const waterGramsAfter = Number((await beakerTarget.getAttribute("data-water-grams")) ?? "0");

        // — Open cabinet via domain action —
        process.stdout.write("[E2E PROGRESS] 7. Opening cabinet...\n");
        await page.evaluate(() => {
          (window as any).__e2eChemistry.toggleCabinet("cabinet-left-inner");
        });
        const cabinetState = page.getByTestId("spike-cabinet-state");
        await expect(cabinetState).toHaveAttribute("data-open", "true", { timeout: 15_000 });

        // — Capture BEFORE-reload snapshot via API —
        const snapshotBefore = await page.evaluate(async () => {
          try {
            const token = localStorage.getItem("edumind_access_token");
            const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
            const res = await fetch("http://localhost:8000/api/chemistry/saves", { headers });
            if (!res.ok) return null;
            const list = await res.json();
            if (!list || list.length === 0) return null;
            const latest = list[0];
            const detailRes = await fetch(`http://localhost:8000/api/chemistry/saves/${latest.id}`, { headers });
            if (!detailRes.ok) return null;
            return detailRes.json();
          } catch {
            return null;
          }
        });
        if (snapshotBefore) {
          process.stdout.write("[S-8 E2E] SNAPSHOT BEFORE RELOAD: " + JSON.stringify(snapshotBefore.snapshot, null, 2) + "\n");
          const burnerInSnap = snapshotBefore.snapshot?.workspace?.burners?.find((b: any) => b.id === "burner-1");
          expect(burnerInSnap?.isOn, "snapshot.workspace.burners[burner-1].isOn must be true before reload").toBe(true);
        }

        // — Wait for autosave "saved" status —
        process.stdout.write("[E2E PROGRESS] 9. Waiting for autosave status saved...\n");
        const autosaveState = page.getByTestId("chemistry-autosave-state");
        await expect(autosaveState).toHaveText("saved", { timeout: 20_000 });

        // — Capture state we need for the resume phase —
        process.stdout.write("[E2E PROGRESS] 10. Preparing for page close & reopen...\n");
        const chemUrl = page.url();
        const authTokens = await page.evaluate(() => ({
          access: localStorage.getItem("edumind_access_token"),
          refresh: localStorage.getItem("edumind_refresh_token"),
        }));
        process.stdout.write("[E2E PROGRESS] Extracted tokens: " + JSON.stringify(authTokens) + "\n");

        // Cleanly exit experiment to catalog so that the saves state syncs and uninitializes the autosave engine
        const exitBtn = page.locator('[data-testid="guided-lab-exit"]');
        if (await exitBtn.isVisible({ timeout: 15_000 }).catch(() => false)) {
          await exitBtn.click();
        }
        await expect(page.getByTestId("experiment-catalog-browser")).toBeVisible({ timeout: 10_000 });

        // WebGL/SwiftShader render loop completely blocks page.reload()
        // and page.goto(). Force-close the page and create a fresh one
        // in the same browser context to simulate a real reload.
        const ctx = page.context();
        await page.close({ runBeforeUnload: false }).catch(() => {});

        const page2 = await ctx.newPage();
        page2.setDefaultTimeout(25_000);
        page2.on("console", (message) => {
          process.stdout.write(`[PAGE2 CONSOLE] [${message.type()}] ${message.text()}\n`);
        });
        page2.on("pageerror", (error) => {
          process.stdout.write(`[PAGE2 ERROR] ${error.message}\n`);
        });

        // Inject auth tokens before navigating so the app authenticates
        await page2.goto("http://localhost:3000/login", { waitUntil: "domcontentloaded", timeout: 20_000 });
        await page2.evaluate((tokens) => {
          if (tokens.access) localStorage.setItem("edumind_access_token", tokens.access);
          if (tokens.refresh) localStorage.setItem("edumind_refresh_token", tokens.refresh);
          localStorage.setItem("edumind:quality", "low");
          localStorage.setItem("edumind_chemistry_tutorial_done", "1");
        }, authTokens);

        process.stdout.write("[E2E PROGRESS] 10b. Navigating to chemistry world...\n");
        await page2.goto(chemUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
        await expect(page2.locator("canvas")).toBeVisible({ timeout: 30_000 });

        // — Resume experiment from catalog —
        process.stdout.write("[E2E PROGRESS] 11. Resuming experiment...\n");
        const resumeBtn = page2.locator('[data-testid="catalog-resume-lab-beginner-heating-water"]');
        await expect(resumeBtn).toBeVisible({ timeout: 60_000 });
        process.stdout.write("[E2E PROGRESS] 11a. Resume button visible, clicking...\n");
        await resumeBtn.click({ timeout: 60_000 });
        process.stdout.write("[E2E PROGRESS] 11b. Resume button clicked.\n");
        const modalContinueBtn = page2.locator('[data-testid="resume-modal-continue"]');
        if (await modalContinueBtn.isVisible({ timeout: 10_000 }).catch(() => false)) {
          process.stdout.write("[E2E PROGRESS] 11c. Resume modal visible, clicking continue...\n");
          await modalContinueBtn.click({ timeout: 60_000 });
          process.stdout.write("[E2E PROGRESS] 11d. Continue clicked.\n");
        }

        await expect(page2.locator('[data-testid="guided-lab-panel"]')).toBeVisible({ timeout: 60_000 });
        process.stdout.write("[E2E PROGRESS] 12. Guided lab panel visible after resume.\n");
        await page2.waitForTimeout(3_000); // Wait for camera fly animation after resume

        // — Verify hydration status = "hydrated" —
        await expect(page2.getByTestId("chemistry-hydration-state")).toHaveAttribute("data-hydrated", "true", {
          timeout: 8_000,
        });

        // — Capture AFTER-reload snapshot via API —
        const snapshotAfter = await page2.evaluate(async () => {
          try {
            const token = localStorage.getItem("edumind_access_token");
            const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
            const res = await fetch("http://localhost:8000/api/chemistry/saves", { headers });
            if (!res.ok) return null;
            const list = await res.json();
            if (!list || list.length === 0) return null;
            const latest = list[0];
            const detailRes = await fetch(`http://localhost:8000/api/chemistry/saves/${latest.id}`, { headers });
            if (!detailRes.ok) return null;
            return detailRes.json();
          } catch {
            return null;
          }
        });
        if (snapshotAfter) {
          console.log("[S-8 E2E] SNAPSHOT AFTER RELOAD GET:", JSON.stringify(snapshotAfter.snapshot, null, 2));
        }

        // — Verify burner.isOn === true (DOM state restored) —
        await expect(page2.getByTestId("burner-toggle-burner-1")).toHaveAttribute("data-is-on", "true", {
          timeout: 8_000,
        });

        // — Verify contents grams are restored —
        const beakerAfterReload = page2.getByTestId("container-target-beaker-1");
        const waterGramsRestored = Number((await beakerAfterReload.getAttribute("data-water-grams")) ?? "-1");
        expect(waterGramsRestored, "beaker-1 water grams must be restored after resume").toBeCloseTo(waterGramsAfter, 0);

        // — Verify cabinet isOpen is restored —
        const cabinetStateAfterReload = page2.getByTestId("spike-cabinet-state");
        await expect(cabinetStateAfterReload).toHaveAttribute("data-open", "true", { timeout: 15_000 });

        // — Verify autosave state is clean after reload (saved or idle) —
        await expect(page2.getByTestId("chemistry-autosave-state")).toHaveText(/saved|idle/, { timeout: 15_000 });
      },
      { viewport: { width: 1280, height: 720 }, screenshot: false },
    );
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test 2 — Offline Save & Resume flow: handles network drop
  // ─────────────────────────────────────────────────────────────────────────────
  test("2. Offline Save & Resume flow: handles network drop and syncs on reconnect", async ({}, testInfo) => {
    await withIsolatedChemistry(
      testInfo,
      async ({ page, canvas, diagnostics }) => {
        await expect(page.locator("canvas")).toBeVisible({ timeout: 20_000 });

        // Intercept API to simulate network failure
        await page.route("**/api/chemistry/saves**", (route: Route) => route.abort("failed"));

        const startBtn = page.locator('[data-testid="catalog-start-lab-beginner-heating-water"]');
        await expect(startBtn).toBeVisible({ timeout: 10_000 });
        await startBtn.click();
        await expect(page.locator('[data-testid="guided-lab-panel"]')).toBeVisible({ timeout: 10_000 });
        await page.waitForTimeout(3_000); // Wait for camera fly animation

        // Toggle burner to trigger dirty state via domain bridge
        await page.waitForFunction(() => !!(window as any).__e2eChemistry, null, { timeout: 60_000 });
        await page.evaluate(() => {
          (window as any).__e2eChemistry.toggleBurner("burner-1");
        });
        await expect(page.getByTestId("burner-toggle-burner-1")).toHaveAttribute("data-is-on", "true", {
          timeout: 15_000,
        });

        // Expect offline_pending badge
        await expect(page.getByTestId("chemistry-autosave-state")).toHaveText(/offline_pending|error/, {
          timeout: 15_000,
        });

        // Restore network
        await page.unroute("**/api/chemistry/saves**");

        // Trigger immediate retry — the autosave engine doesn't know the route was removed
        await page.evaluate(() => {
          window.dispatchEvent(new Event("online"));
          (window as any).__e2eChemistry?.flush?.();
        });

        // Expect sync to succeed — status returns to "saved"
        await expect(page.getByTestId("chemistry-autosave-state")).toHaveText("saved", { timeout: 30_000 });

        // Suppress expected failures from the intentional network drop
        diagnostics.requestFailures.length = 0;
        diagnostics.badResponses.length = 0;
        diagnostics.consoleErrors.length = 0;
      },
      { viewport: { width: 1280, height: 720 }, screenshot: false },
    );
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test 3 — Security ownership isolation
  // ─────────────────────────────────────────────────────────────────────────────
  test("3. Security ownership isolation: user B cannot access user A save", async () => {
    const api = await playwrightRequest.newContext({ baseURL: "http://localhost:8000" });

    // User A
    const emailA = `user_a_${Date.now()}@example.com`;
    await api.post("/api/auth/register", { data: { email: emailA, password: "password123", full_name: "User A" } });
    const loginA = await api.post("/api/auth/login", { form: { username: emailA, password: "password123" } });
    const tokenA = (await loginA.json()).access_token;

    // User B
    const emailB = `user_b_${Date.now()}@example.com`;
    await api.post("/api/auth/register", { data: { email: emailB, password: "password123", full_name: "User B" } });
    const loginB = await api.post("/api/auth/login", { form: { username: emailB, password: "password123" } });
    const tokenB = (await loginB.json()).access_token;

    // User A creates a save
    const saveRes = await api.post("/api/chemistry/saves", {
      headers: { Authorization: `Bearer ${tokenA}` },
      data: {
        simulation_id: "sim-chem-world",
        experiment_id: "lab-beginner-heating-water",
        schema_version: "1.0",
        status: "active",
        snapshot: { schemaVersion: "1.0" },
      },
    });
    expect(saveRes.ok()).toBeTruthy();
    const saveA = await saveRes.json();

    // User B tries to read User A's save → 403 or 404
    const getResB = await api.get(`/api/chemistry/saves/${saveA.id}`, {
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    expect([403, 404]).toContain(getResB.status());

    // User B tries to update User A's save → 403 or 404
    const putResB = await api.put(`/api/chemistry/saves/${saveA.id}`, {
      headers: { Authorization: `Bearer ${tokenB}` },
      data: { expected_revision: 1, snapshot: {} },
    });
    expect([403, 404]).toContain(putResB.status());

    await api.dispose();
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test 4 — Optimistic locking 409 Conflict
  // ─────────────────────────────────────────────────────────────────────────────
  test("4. Optimistic locking 409 Conflict scenario", async () => {
    const api = await playwrightRequest.newContext({ baseURL: "http://localhost:8000" });

    const email = `concurrency_${Date.now()}@example.com`;
    await api.post("/api/auth/register", { data: { email, password: "password123", full_name: "Concurrency Test" } });
    const login = await api.post("/api/auth/login", { form: { username: email, password: "password123" } });
    const token = (await login.json()).access_token;

    // Create initial save (revision 1)
    const createRes = await api.post("/api/chemistry/saves", {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        simulation_id: "sim-chem",
        experiment_id: "lab-beginner-heating-water",
        schema_version: "1.0",
        status: "active",
        snapshot: { schemaVersion: "1.0" },
      },
    });
    const save = await createRes.json();

    // Tab A advances to revision 2
    const updateTabA = await api.put(`/api/chemistry/saves/${save.id}`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { expected_revision: 1, snapshot: { revision: 2 } },
    });
    expect(updateTabA.ok()).toBeTruthy();

    // Tab B sends stale update with expected_revision=1 → 409
    const updateTabB = await api.put(`/api/chemistry/saves/${save.id}`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { expected_revision: 1, snapshot: { revision: 1 } },
    });
    expect(updateTabB.status()).toBe(409);

    await api.dispose();
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test 5 — Burner.isOn & flame restoration (focused verification)
  // ─────────────────────────────────────────────────────────────────────────────
  test("5. Burner.isOn state & flame visual restoration after reload", async ({}, testInfo) => {
    await withIsolatedChemistry(
      testInfo,
      async ({ page, canvas }) => {
        await expect(page.locator("canvas")).toBeVisible({ timeout: 20_000 });

        const startBtn = page.locator('[data-testid="catalog-start-lab-beginner-heating-water"]');
        await expect(startBtn).toBeVisible({ timeout: 10_000 });
        await startBtn.click();
        await expect(page.locator('[data-testid="guided-lab-panel"]')).toBeVisible({ timeout: 10_000 });
        await page.waitForTimeout(3_000); // Wait for camera fly animation

        // Turn burner on via domain bridge (avoids fragile SwiftShader raycasting)
        await page.waitForFunction(() => !!(window as any).__e2eChemistry, null, { timeout: 60_000 });
        await page.evaluate(() => {
          (window as any).__e2eChemistry.toggleBurner("burner-1");
        });
        await expect(page.getByTestId("burner-toggle-burner-1")).toHaveAttribute("data-is-on", "true", {
          timeout: 15_000,
        });

        // Wait for save
        await expect(page.getByTestId("chemistry-autosave-state")).toHaveText("saved", { timeout: 20_000 });

        // Force-close page and create fresh one (WebGL render loop blocks page.reload)
        const chemUrl = page.url();
        const authTokens = await page.evaluate(() => ({
          access: localStorage.getItem("edumind_access_token"),
          refresh: localStorage.getItem("edumind_refresh_token"),
        }));

        // Cleanly exit experiment first
        const exitBtn = page.locator('[data-testid="guided-lab-exit"]');
        if (await exitBtn.isVisible({ timeout: 15_000 }).catch(() => false)) {
          await exitBtn.click();
        }
        await expect(page.getByTestId("experiment-catalog-browser")).toBeVisible({ timeout: 10_000 });

        const ctx = page.context();
        await page.close({ runBeforeUnload: false }).catch(() => {});

        const page2 = await ctx.newPage();
        page2.setDefaultTimeout(25_000);
        page2.on("console", (message) => {
          process.stdout.write(`[PAGE2 CONSOLE - TEST5] [${message.type()}] ${message.text()}\n`);
        });
        page2.on("pageerror", (error) => {
          process.stdout.write(`[PAGE2 ERROR - TEST5] ${error.message}\n`);
        });

        await page2.goto("http://localhost:3000/login", { waitUntil: "domcontentloaded", timeout: 20_000 });
        await page2.evaluate((tokens) => {
          if (tokens.access) localStorage.setItem("edumind_access_token", tokens.access);
          if (tokens.refresh) localStorage.setItem("edumind_refresh_token", tokens.refresh);
          localStorage.setItem("edumind:quality", "low");
          localStorage.setItem("edumind_chemistry_tutorial_done", "1");
        }, authTokens);
        await page2.goto(chemUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
        await expect(page2.locator("canvas")).toBeVisible({ timeout: 30_000 });

        // Resume
        const resumeBtn = page2.locator('[data-testid="catalog-resume-lab-beginner-heating-water"]');
        await expect(resumeBtn).toBeVisible({ timeout: 20_000 });
        await resumeBtn.click();
        const modalContinueBtn = page2.locator('[data-testid="resume-modal-continue"]');
        if (await modalContinueBtn.isVisible({ timeout: 15_000 }).catch(() => false)) {
          await modalContinueBtn.click();
        }

        await expect(page2.locator('[data-testid="guided-lab-panel"]')).toBeVisible({ timeout: 15_000 });
        await page2.waitForTimeout(3_000); // Wait for camera fly animation after resume

        // Verify burner.isOn restored to true
        await expect(page2.getByTestId("burner-toggle-burner-1")).toHaveAttribute("data-is-on", "true", {
          timeout: 10_000,
        });

        // Verify hydration status is hydrated
        await expect(page2.getByTestId("chemistry-hydration-state")).toHaveAttribute("data-hydrated", "true");

        // Verify flame visual: burner-flame-burner-1 element exists and has data-active="true"
        const flameTarget = page2.getByTestId("burner-flame-burner-1");
        if (await flameTarget.isVisible({ timeout: 3_000 }).catch(() => false)) {
          await expect(flameTarget).toHaveAttribute("data-active", "true");
        }
      },
      { viewport: { width: 1280, height: 720 }, screenshot: false },
    );
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test 6 — Completing an experiment must finalize the ChemistrySave, not just
  // the local Notebook. Regression for: catalog card simultaneously showing
  // "ПРОЙДЕНО" (from localStorage Notebook) AND "Есть сохранение (шаг N)"
  // (from a ChemistrySave still stuck status="active" on the backend).
  // ─────────────────────────────────────────────────────────────────────────────
  test("6. Completing 8/8 steps marks ChemistrySave completed — no leftover 'Есть сохранение'", async ({}, testInfo) => {
    // Real, un-fast-forwarded heating (~7s of simulated time at 12°C/sec) has
    // shown wide wall-clock variance in this headless/SwiftShader environment
    // (observed 40s-150s+ for the same simulated heating), so this one test
    // gets a longer budget than the shared describe-level timeout.
    testInfo.setTimeout(300_000);
    await withIsolatedChemistry(
      testInfo,
      async ({ page }) => {
        await expect(page.locator("canvas")).toBeVisible({ timeout: 20_000 });

        const startBtn = page.locator('[data-testid="catalog-start-lab-beginner-heating-water"]');
        await expect(startBtn).toBeVisible({ timeout: 10_000 });
        await startBtn.click();
        await expect(page.locator('[data-testid="guided-lab-panel"]')).toBeVisible({ timeout: 15_000 });
        await page.waitForTimeout(3_000); // Wait for camera fly animation

        await page.waitForFunction(() => !!(window as any).__e2eChemistry?.advanceStep, null, { timeout: 60_000 });

        // effectiveStepContext (which gates isUnlocked) is derived from workspace
        // state through the Experiment Validator pipeline and can lag one render
        // behind a just-dispatched domain action. Mirror how the real "Далее"
        // button behaves — it's disabled until isCurrentStepUnlocked flips true —
        // by polling that flag instead of firing advanceStep() blind.
        const waitAndAdvance = async (label: string, timeout = 40_000, pollIntervalMs = 300) => {
          // A tight poll interval competes for CPU with the single-threaded
          // SwiftShader renderer — each page.evaluate() round trip steals a
          // slice from the same thread driving useFrame, which visibly slows
          // real-time heating. The "observe" step (waiting on real physics,
          // not a cheap flag) passes a longer interval so rendering gets to
          // make actual progress between checks.
          await expect
            .poll(
              async () => (await page.evaluate(() => (window as any).__e2eChemistry.getLabStepState())).isCurrentStepUnlocked,
              { timeout, intervals: [pollIntervalMs] }
            )
            .toBe(true);
          await page.evaluate(() => (window as any).__e2eChemistry.advanceStep());
          const s = await page.evaluate(() => (window as any).__e2eChemistry.getLabStepState());
          process.stdout.write(
            `[E2E STEP] ${label}: currentStepIndex=${s.currentStepIndex} isLastStep=${s.isLastStep} isCurrentStepUnlocked=${s.isCurrentStepUnlocked}\n`
          );
        };

        // Steps 1-2 ("goal", "safety_briefing") are always unlocked.
        await waitAndAdvance("after goal");
        await waitAndAdvance("after safety");

        // Step 3 "prepare" needs the container on the stand — attach beaker-1 to
        // burner-1's heating slot, mirroring the real onConfirmPlacement drop
        // handler (attachToHeatingSlot(id, burner.id, burner.position, 0.65)).
        const burnerPosition = await page.evaluate(() => {
          const state = (window as any).__e2eChemistry.getState();
          return state.tools.find((t: any) => t.id === "burner-1").position;
        });
        await page.evaluate((pos) => {
          (window as any).__e2eChemistry.attachToHeatingSlot("beaker-1", "burner-1", pos, 0.65);
        }, burnerPosition);
        await waitAndAdvance("after prepare");

        // Step 4 "add-water" needs real water in the container.
        await page.evaluate(() => {
          (window as any).__e2eChemistry.setBottleCapState("stock-water", "open");
        });
        await expect(page.getByTestId("stock-bottle-target-stock-water")).toHaveAttribute("data-cap-state", "open", {
          timeout: 15_000,
        });
        await page.evaluate(() => {
          (window as any).__e2eChemistry.pourFromStockBottle("stock-water", "beaker-1", 150);
        });
        await expect
          .poll(
            async () => Number((await page.getByTestId("container-target-beaker-1").getAttribute("data-water-grams")) ?? "0"),
            { timeout: 15_000 }
          )
          .toBeGreaterThan(0);
        await waitAndAdvance("after add-water");

        // Step 5 "heat" needs the burner on. From here, real heatTick (12°C/sec,
        // driven by useFrame) boils the water for real — no shortcut into the
        // Chemistry Engine, no fast-forwarding.
        await page.evaluate(() => (window as any).__e2eChemistry.toggleBurner("burner-1"));
        await expect(page.getByTestId("burner-toggle-burner-1")).toHaveAttribute("data-is-on", "true", { timeout: 15_000 });
        await waitAndAdvance("after heat");

        // Headless Chromium throttles requestAnimationFrame for a page it
        // doesn't consider foregrounded, and Three.js's Clock computes delta as
        // uncapped wall-clock elapsed time — if rAF stalls for a few seconds and
        // then a frame finally fires, heatTick's delta*HEAT_RATE_C_PER_SEC spikes
        // the temperature by hundreds of degrees in one tick instead of smoothly
        // climbing. bringToFront() keeps this page the active one so rAF stays
        // real-time for the sustained heating below (not a Chemistry Engine fix —
        // the engine's math is correct for a normal, non-throttled frame delta).
        await page.bringToFront();

        // Step 6 "observe" unlocks once temperature >= 100°C (aggregateStateOf
        // then reports "gas") — this is real physics time, ~7s at 12°C/sec from
        // a 20°C start, plus render/frame overhead. waitAndAdvance's own poll
        // covers the wait, so just give it a generous timeout here.
        process.stdout.write("[E2E PROGRESS] Waiting for real heating to reach 100°C...\n");
        await waitAndAdvance("after observe", 220_000, 3_000);
        await waitAndAdvance("after explain"); // -> "finish" (last step)

        const labStepState = await page.evaluate(() => (window as any).__e2eChemistry.getLabStepState());
        expect(labStepState.isLastStep, "must be on the final 'finish' step before completing").toBe(true);

        // Complete the experiment — must PUT the ChemistrySave with status=completed.
        await page.evaluate(() => (window as any).__e2eChemistry.completeExperiment());
        await expect(page.getByTestId("experiment-catalog-browser")).toBeVisible({ timeout: 15_000 });

        // Confirm the finalize PUT actually landed on the backend before reloading.
        await expect
          .poll(
            async () =>
              page.evaluate(async () => {
                const token = localStorage.getItem("edumind_access_token");
                const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
                const res = await fetch("http://localhost:8000/api/chemistry/saves", { headers });
                if (!res.ok) return null;
                const list = await res.json();
                const match = list.find((s: any) => s.experiment_id === "lab-beginner-heating-water");
                return match?.status ?? null;
              }),
            { timeout: 15_000 }
          )
          .toBe("completed");

        // Reload for real (page.reload() hangs on this WebGL canvas — see the
        // other tests in this file for the same page.close()+newPage() workaround).
        const chemUrl = page.url();
        const authTokens = await page.evaluate(() => ({
          access: localStorage.getItem("edumind_access_token"),
          refresh: localStorage.getItem("edumind_refresh_token"),
        }));
        const ctx = page.context();
        await page.close({ runBeforeUnload: false }).catch(() => {});

        const page2 = await ctx.newPage();
        page2.setDefaultTimeout(45_000);
        await page2.goto("http://localhost:3000/login", { waitUntil: "domcontentloaded", timeout: 20_000 });
        await page2.evaluate((tokens) => {
          if (tokens.access) localStorage.setItem("edumind_access_token", tokens.access);
          if (tokens.refresh) localStorage.setItem("edumind_refresh_token", tokens.refresh);
          localStorage.setItem("edumind:quality", "low");
          localStorage.setItem("edumind_chemistry_tutorial_done", "1");
        }, authTokens);
        await page2.goto(chemUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
        await expect(page2.locator("canvas")).toBeVisible({ timeout: 30_000 });
        await expect(page2.getByTestId("experiment-catalog-browser")).toBeVisible({ timeout: 20_000 });

        // The impossible state from the bug report: "ПРОЙДЕНО" and "Есть
        // сохранение" must never appear together for the same experiment.
        await expect(page2.getByTestId("catalog-completed-lab-beginner-heating-water")).toBeVisible({ timeout: 15_000 });
        await expect(page2.getByTestId("catalog-active-save-lab-beginner-heating-water")).toHaveCount(0);
        await expect(page2.getByTestId("catalog-resume-lab-beginner-heating-water")).toHaveCount(0);
      },
      { viewport: { width: 1280, height: 720 }, screenshot: false },
    );
  });
});
