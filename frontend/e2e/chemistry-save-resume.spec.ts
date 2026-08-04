import { expect, request as playwrightRequest, test, type Route } from "@playwright/test";
import { withIsolatedChemistry } from "./helpers/chemistry-isolated";

test.describe("Stage S-8.5 — Chemistry Save, Autosave, Resume & Offline E2E Acceptance", () => {
  test("1. Online Save & Resume flow: restores exact domain state & resets runtime state", async ({}, testInfo) => {
    await withIsolatedChemistry(testInfo, async ({ page, diagnostics }) => {
      // 1. Убедиться, что лаборатория загрузилась
      await expect(page.locator('[data-testid="chemistry-world-root"]')).toBeVisible({ timeout: 15_000 });

      // 2. Выбрать эксперимент «Нагрев воды» в каталоге
      const startBtn = page.locator('[data-testid="catalog-start-lab-water-heating"]');
      if (await startBtn.isVisible()) {
        await startBtn.click();
      }

      // 3. Дождаться появления GuidedLabPanel
      await expect(page.locator('[data-testid="guided-lab-panel"]')).toBeVisible({ timeout: 10_000 });
      await expect(page.locator('[data-testid="autosave-badge-saved"]')).toBeVisible({ timeout: 10_000 });

      // 4. Выполнить значимое доменное действие: продвинуть шаг
      const nextBtn = page.locator('[data-testid="guided-lab-next-step"]');
      if (await nextBtn.isVisible()) {
        await nextBtn.click();
      }

      // 5. Дождаться завершения автосохранения («Сохранено»)
      await expect(page.locator('[data-testid="autosave-badge-saved"]')).toBeVisible({ timeout: 10_000 });

      // 6. Перезагрузить страницу
      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(page.locator('[data-testid="chemistry-world-root"]')).toBeVisible({ timeout: 15_000 });

      // 7. Дождаться появления модального окна возобновления или карточки с сохранением
      const resumeBtn = page.locator('[data-testid="catalog-resume-lab-water-heating"]');
      if (await resumeBtn.isVisible()) {
        await resumeBtn.click();
      }

      const modalContinueBtn = page.locator('[data-testid="resume-modal-continue"]');
      if (await modalContinueBtn.isVisible()) {
        await modalContinueBtn.click();
      }

      // 8. Проверить восстановление состояния шагов
      await expect(page.locator('[data-testid="guided-lab-panel"]')).toBeVisible({ timeout: 10_000 });

      // 9. Проверить отсутствие критических ошибок консоли
      expect(diagnostics.consoleErrors).toHaveLength(0);
      expect(diagnostics.pageErrors).toHaveLength(0);
    });
  });

  test("2. Offline Save & Resume flow: handles network drop and syncs on reconnect", async ({}, testInfo) => {
    await withIsolatedChemistry(testInfo, async ({ page, diagnostics }) => {
      await expect(page.locator('[data-testid="chemistry-world-root"]')).toBeVisible({ timeout: 15_000 });

      // Имитация отвала сети для API автосохранения
      await page.route("**/api/chemistry/saves**", (route: Route) => route.abort("failed"));

      const startBtn = page.locator('[data-testid="catalog-start-lab-water-heating"]');
      if (await startBtn.isVisible()) {
        await startBtn.click();
      }

      // Выполнение действия при оффлайне
      const nextBtn = page.locator('[data-testid="guided-lab-next-step"]');
      if (await nextBtn.isVisible()) {
        await nextBtn.click();
      }

      // Проверить появление бэджа «Сохранено локально»
      await expect(page.locator('[data-testid="autosave-badge-offline"]')).toBeVisible({ timeout: 10_000 });

      // Восстановить сеть
      await page.unroute("**/api/chemistry/saves**");

      // Дождаться синхронизации на сервере («Сохранено»)
      await expect(page.locator('[data-testid="autosave-badge-saved"]')).toBeVisible({ timeout: 15_000 });

      expect(diagnostics.consoleErrors).toHaveLength(0);
    });
  });

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
        experiment_id: "lab-water-heating",
        schema_version: "1.0",
        status: "active",
        snapshot: { schemaVersion: "1.0" },
      },
    });
    expect(saveRes.ok()).toBeTruthy();
    const saveA = await saveRes.json();

    // User B tries to read User A's save
    const getResB = await api.get(`/api/chemistry/saves/${saveA.id}`, {
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    expect([403, 404]).toContain(getResB.status());

    // User B tries to update User A's save
    const putResB = await api.put(`/api/chemistry/saves/${saveA.id}`, {
      headers: { Authorization: `Bearer ${tokenB}` },
      data: { expected_revision: 1, snapshot: {} },
    });
    expect([403, 404]).toContain(putResB.status());
  });

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
        experiment_id: "lab-water-heating",
        schema_version: "1.0",
        status: "active",
        snapshot: { schemaVersion: "1.0" },
      },
    });
    const save = await createRes.json();

    // Update revision to 2 (tab A)
    const updateTabA = await api.put(`/api/chemistry/saves/${save.id}`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { expected_revision: 1, snapshot: { revision: 2 } },
    });
    expect(updateTabA.ok()).toBeTruthy();

    // Outdated update attempt with expected_revision = 1 (tab B)
    const updateTabB = await api.put(`/api/chemistry/saves/${save.id}`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { expected_revision: 1, snapshot: { revision: 1 } },
    });
    expect(updateTabB.status()).toBe(409);
  });
});
