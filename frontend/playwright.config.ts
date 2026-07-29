import { defineConfig } from "@playwright/test";

// Тесты запускаются против уже поднятых dev-сервера (localhost:3000) и
// бэкенда (localhost:8000) - webServer тут намеренно не настроен, т.к. в
// этой среде оба сервиса управляются вручную (см. project README/сессию).
export default defineConfig({
  testDir: "./e2e",
  // dev-сервер компилирует первый заход на страницу небезосно долго
  // (в этой сессии видели и 30-40с на холодную компиляцию) - таймаут
  // теста должен это учитывать
  timeout: 180_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: 0,
  use: {
    baseURL: "http://localhost:3000",
    // сцена рендерит непрерывный WebGL-канвас (requestAnimationFrame),
    // и Playwright-трассировка/скриншоты поверх такой страницы на этой
    // машине зависают на этапе финализации - весь тестовый сценарий уже
    // отрабатывает успешно к этому моменту, трейсинг тут не критичен
    trace: "off",
    screenshot: "off",
    video: "off",
  },
});
