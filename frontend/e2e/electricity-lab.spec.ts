import { test, expect, request as playwrightRequest, type Page } from "@playwright/test";

/**
 * E2E-тест acceptance-сценария Electricity Lab. Требует запущенных
 * dev-сервера (localhost:3000) и бэкенда (localhost:8000) с уже
 * применёнными миграциями и посеянной симуляцией electricity_lab.
 *
 * Координаты кликов НЕ хардкодятся и не зависят от положения камеры:
 * каждый терминал/провод несёт невидимый drei-Html маркер с data-testid,
 * который проецируется в реальные экранные координаты каждый кадр —
 * boundingBox() этого маркера дает точку клика, устойчивую к повороту
 * OrbitControls (который на время перетаскивания провода в любом случае
 * выключен в самом приложении).
 */
const API_URL = "http://localhost:8000";

async function registerAndLogin(): Promise<{ accessToken: string; refreshToken: string }> {
  const api = await playwrightRequest.newContext({ baseURL: API_URL });
  const email = `e2e_electricity_${Date.now()}@example.com`;
  const password = "supersecret123";

  await api.post("/api/auth/register", {
    data: { email, password, full_name: "E2E Electricity" },
  });
  const loginResp = await api.post("/api/auth/login", {
    form: { username: email, password },
  });
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

// В этом окружении WebGL рендерится программно (видны GL-предупреждения
// "GPU stall due to ReadPixels"), и под нагрузкой headless-браузер не
// сразу успевает обработать следующую CDP-команду сразу после того, как
// React пересчитывает сцену (новый провод/меш) - без паузы это выглядит
// как зависание mouse.move/page.evaluate, хотя на самом деле рендерер
// просто отстает и "догоняет" через пару секунд. Это не баг приложения:
// подтверждено бисекцией (см. историю отладки) - с паузой все стабильно.
const RENDER_SETTLE_MS = 4000;

async function connectTerminals(page: Page, fromId: string, toId: string) {
  const from = await terminalCenter(page, fromId);
  const to = await terminalCenter(page, toId);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 15 });
  await page.mouse.up();
  await page.waitForTimeout(RENDER_SETTLE_MS);
}

async function disconnectWire(page: Page, terminalIdA: string, terminalIdB: string) {
  // середина провода - это среднее между экранными координатами двух
  // терминалов (отдельного Html-маркера на сам провод больше нет, чтобы
  // не плодить лишние drei-порталы на каждое соединение)
  const a = await terminalCenter(page, terminalIdA);
  const b = await terminalCenter(page, terminalIdB);
  await page.mouse.click((a.x + b.x) / 2, (a.y + b.y) / 2);
  await page.waitForTimeout(RENDER_SETTLE_MS);
}

test.describe("Electricity Lab", () => {
  test("сборка цепи, запуск, разрыв провода, короткое замыкание, сброс", async ({ page }) => {
    const { accessToken, refreshToken } = await registerAndLogin();
    const simulationId = await findElectricityLabSimulationId(accessToken);

    await page.goto("/login");
    await page.evaluate(
      ([access, refresh]) => {
        window.localStorage.setItem("edumind_access_token", access);
        window.localStorage.setItem("edumind_refresh_token", refresh);
        // низкое качество (без Bloom/ContactShadows) снижает нагрузку на
        // программный WebGL-рендерер в этом окружении
        window.localStorage.setItem("edumind:quality", "low");
      },
      [accessToken, refreshToken]
    );

    await page.goto(`/electricity_lab/${simulationId}`);
    await expect(page.getByTestId("circuit-status")).toBeVisible();
    await expect(page.getByTestId("terminal-battery_pos")).toBeVisible({ timeout: 15_000 });
    // даем программному WebGL-рендереру "остыть" после первой загрузки
    // сцены (компиляция шейдеров, первые кадры) перед серией CDP-команд
    await page.waitForTimeout(RENDER_SETTLE_MS);

    // 1. Собираем полную рабочую цепь: батарея -> резистор -> лампа ->
    // выключатель -> амперметр -> предохранитель -> обратно к батарее
    await connectTerminals(page, "battery_pos", "resistor_a");
    await connectTerminals(page, "resistor_b", "bulb_a");
    await connectTerminals(page, "bulb_b", "switch_a");
    await connectTerminals(page, "switch_b", "ammeter_a");
    await connectTerminals(page, "ammeter_b", "fuse_a");
    await connectTerminals(page, "fuse_b", "battery_neg");

    // 2. Цепь замкнута и реально работает
    const status = page.getByTestId("circuit-status");
    await expect(status).toHaveAttribute("data-active", "true");
    await expect(status).toContainText("Ток течет");

    // 3. Запускаем симуляцию (Simulation Clock)
    await page.getByTestId("clock-toggle").click();
    await expect(page.getByTestId("clock-toggle")).toContainText("Пауза");

    // 4. Приборы показывают реально рассчитанное значение (I = 12/6 = 2А),
    // а не случайное число
    const ammeterValue = Number(await page.getByTestId("ammeter-reading").getAttribute("data-value"));
    expect(ammeterValue).toBeCloseTo(2, 1);

    // 5. Разрыв провода немедленно останавливает ток
    await disconnectWire(page, "switch_b", "ammeter_a");
    await expect(status).toHaveAttribute("data-active", "false");
    const ammeterAfterBreak = Number(await page.getByTestId("ammeter-reading").getAttribute("data-value"));
    expect(ammeterAfterBreak).toBe(0);

    // восстанавливаем провод обратно
    await connectTerminals(page, "switch_b", "ammeter_a");
    await expect(status).toHaveAttribute("data-active", "true");

    // 6. Короткое замыкание через предохранитель: разрываем участок
    // резистор+лампа и подключаем выключатель напрямую к батарее -
    // ток при этом все еще идет через предохранитель, и он должен перегореть
    await disconnectWire(page, "battery_pos", "resistor_a");
    await disconnectWire(page, "resistor_b", "bulb_a");
    await disconnectWire(page, "bulb_b", "switch_a");
    await connectTerminals(page, "battery_pos", "switch_a");

    // "короткое замыкание" - переходное состояние на один рендер (тут же
    // сгорает предохранитель и сам размыкает цепь), поэтому проверяем
    // устоявшийся результат: предохранитель сгорел, ток остановлен
    await expect(status).toHaveAttribute("data-fuse-blown", "true", { timeout: 5_000 });
    await expect(status).toHaveAttribute("data-active", "false");

    // 7. Reset полностью восстанавливает начальное состояние
    await page.getByTestId("reset-button").click();
    await expect(status).toHaveAttribute("data-active", "false");
    await expect(status).toHaveAttribute("data-fuse-blown", "false");
    await expect(status).toContainText("Соедини терминалы");
    await expect(page.getByTestId("clock-toggle")).toContainText("Старт");
  });
});
