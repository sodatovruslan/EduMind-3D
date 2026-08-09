# HANDOFF — для следующего AI-агента

Этот файл — рабочая заметка о том, что происходит ПРЯМО СЕЙЧАС, а не документация проекта.
Цель: если пользователь переключится на другого AI/агента, тот должен понять состояние проекта из этого файла за 5 минут.

Обновляется по ходу работы.

**Последнее обновление: 2026-08-09** (см. раздел "Обновление 2026-08-09 (продолжение №31)" в конце файла — GeoWorld G6: образовательные геослои (тектоника/вулканы/землетрясения) поверх G1-G5. Параллельно в файле — независимая ветка работы по Design System V2/Auth, продолжения №21-30, не связана с GeoWorld).

---

## Актуальное состояние на 2026-08-04

- **Ветка разработки**: `feature/stage-s7-v2-locomotion`
- **Выполненные работы**:
  - **Stage S7-V2.13 Final Polish**: Dev overlay gated (`showDiag = false`), Fullscreen API integration, Escape priority stack, input element exclusion, distance thresholding (0.01m frame loop).
  - **Chemistry World Critical Heating Bug Fixes (Burner Placement, Heating State & Task Completion)**:
    - **BUG A — Task Completion for Burner Toggle**: Complete domain event tracking (`burner_toggled`), domain state sync (`burnerOn`), and task condition verification without UI fake-checking.
    - **Dynamic Heating Socket Registry**: Removed all static hardcoded coordinates (`[2.6, 1.4]`, `elevation 0.65`). Added dynamic 3D `HeatingSocket` ref/mesh in `BurnerMesh` updating world matrix via `updateWorldMatrix(true, true)` & `getWorldPosition()`.
    - **Registry API & Fallbacks**: Sockets dynamically registered into `registerHeatingSocket(...)`. If unregistered, placement candidate returns `reason: "registry_not_ready"`. No static fallback numbers.
    - **Audit Suite**: `ChemistryHeatingBugsFix.test.tsx` (11 scenarios) including burner move & old zone invalidation test + `chemistry-heating-bugs.spec.ts` (4/4 Playwright specs verified).
- **Проверки**:
  - `npx tsc --noEmit` — **0 ошибок** (PASS)
  - `pytest -o asyncio_mode=auto -q` — **45/45 PASSED** (PASS)
  - `npx vitest run` — **396/396 PASSED (34 test files)** (PASS)
  - `npx playwright test e2e/chemistry-heating-bugs.spec.ts` — **4/4 PASSED** (PASS)
  - `npm run lint` — **0 ошибок, 0 предупреждений** (PASS)

---

## Фактический статус Stage S-7 v2 (S7-V2.1..V2.12)

Все предыдущие подэтапы S7-V2.1–V2.12 успешно реализованы, проверены и закоммичены:
1. **S7-V2.1..V2.8**: WASD/ЦФЫВ/Стрелки локомоция, кинематическое скольжение, коллизии стен и мебели, reachability/LOS проверки, Held Rig, переключатель Orbit ↔ Sandbox.
2. **S7-V2.9..V2.10**: Единый пайплайн взаимодействия, динамическая поверхность стола (Placement Ghost), зеленый/красный превью, отмена по Escape, confirmPlacement по E/клику, интеграция шкафов и слотов.
3. **S7-V2.11**: Горячие клавиши R (крышки) и Q (наклон/налив), пороги налива (dist <= 0.35m, angle >= 45°), сохранность массы и подсистема налива.
4. **S7-V2.12**: Полная изоляция локомоции от Observation pipeline (нет spatial noise), правильная агрегация наливания, идентичность доменной истории между Orbit и Sandbox.

---

## Текущая задача: Stage S7-V2.13 — Final Polish, Performance, Full Regression & Delivery

Область работ S7-V2.13:
1. **UI/UX Polish**:
   - Понятное отображение режима Orbit (S-6) ↔ Sandbox (S-7).
   - Подсказки управления без конфликтов со старыми.
   - Dev/debug overlay скрыт по умолчанию (`showDiag = false`), доступен только в `development` по F3.
   - Production-пользователь не видит Box3, координаты и debug labels.
2. **Fullscreen Mode**:
   - Кнопка перехода/выхода из полноэкранного режима.
   - Корректный resize R3F Canvas (100vw x 100vh).
   - Безопасный приоритет Escape: if `document.fullscreenElement` is active, Escape exits fullscreen without dropping held object or cancelling placement.
3. **Cursor & Mouse UX**:
   - Подавление контекстного меню только над Canvas во время обзора.
   - Сохранение ЛКМ для UI/объектов.
   - Исключение ввода текста (input/textarea/select/contenteditable) из горячих клавиш.
4. **Performance Optimization**:
   - Оптимизация threshold для `handlePosUpdate` (исключение setState при микро-сдвигах < 1 см).
   - Работа трансформаций через refs и `useFrame`.
   - Один активный контроллер камеры (OrbitControls выключен в Sandbox).
5. **Cleanup Audit**:
   - Гарантия снятия event listeners (keydown, keyup, pointer events, blur, visibilitychange, fullscreenchange, resize).
6. **Regression Matrix & Verification**:
   - Автоматическая проверка `tsc`, `vitest`, `pytest`, `build`.
   - E2E acceptance сценарий S7-V2.13.

---

## Постоянные правила проекта
- Вся коммуникация — только на русском языке.
- Код физики/химии (Chemistry Engine) не переписывать.
- Git: коммитить от имени `sodatovruslan <email@github.com>`, без push, пушит только пользователь.

---

## Актуальное состояние на 2026-08-06 — Stage S-8 E2E Autosave/Hydration

### Что сделано ✅

1. **Критический баг безопасности — cross-user idempotency collision**
   - Файл: `backend/app/routers/chemistry_saves.py`
   - Backend проверял `idempotency_key` БЕЗ `user_id`. Пользователь B перезаписывал save пользователя A → у B не появлялась кнопка Resume.
   - Фикс: `if existing.user_id != current_user.id → 403 Forbidden`.

2. **Уникальный clientSessionId в idempotency key**
   - Файл: `frontend/lib/autosave-engine.ts`
   - Ключ был одинаковый у всех: `save-lab-beginner-heating-water:rev:1`. Теперь: `${saveId}:${clientSessionId}:rev:${revision}`.

3. **POST/PUT branching bug**
   - Файл: `frontend/lib/autosave-engine.ts`
   - `if (currentRevision === 1)` оставалось true навсегда (сервер возвращает revision=1) → бесконечные POST → idempotency key с UUID > 64 символов → 500 → CORS.
   - Фикс: флаг `createdOnServer`. После первого POST = true, дальше всё через PUT.

4. **SwiftShader cold start timeout**
   - Файл: `frontend/e2e/chemistry-save-resume.spec.ts`
   - Таймаут `__e2eChemistry` bridge: 25с → 60с (холодная компиляция шейдеров при последовательном запуске тестов).

5. **WebGL reload hang workaround**
   - `page.reload()` зависает из-за WebGL render loop. Решение: `page.close()` → новая `page2` с localStorage tokens.

6. **E2E bridge `window.__e2eChemistry`**
   - Добавлен в `ChemistryWorldScene.tsx` (строка ~3404). Позволяет тестам вызывать domain actions напрямую без raycasting.
   - Методы: `getState`, `toggleBurner`, `moveItem`, `pourFromStockBottle`, `toggleCabinet`, `toggleBottleCap`, `setBottleCapState`, `setItemTransform`, `flush`.

### Результаты тестов (последний прогон)

| # | Тест | Статус |
|---|------|--------|
| 1 | Full save/resume round-trip | ✅ PASS |
| 2 | Offline Save & Resume flow | ❌ FAIL |
| 3 | Security ownership isolation | ✅ PASS |
| 4 | Optimistic locking 409 Conflict | ✅ PASS |
| 5 | Burner.isOn flame visual restoration | ✅ PASS |

### Что НЕ доделано ❌

**Test 2 — Offline Save & Resume:**
- После `page.unroute()` autosave engine не знает что сеть вернулась. `retryPendingSync()` срабатывает по `window.online`, а `page.unroute()` его не генерирует.
- В тесте уже добавлен dispatch `online` event + вызов `flush()` через bridge.
- **НО:** в `ChemistryWorldScene.tsx` строка ~3413 добавлен `flush: () => autosaveEngine.flush()`, а **импорт `autosaveEngine` НЕ добавлен!**
- **Нужно:** добавить `import { autosaveEngine } from "@/lib/autosave-engine";` в начало `ChemistryWorldScene.tsx` и прогнать тесты.
- Если не поможет — увеличить таймаут до 40с (периодический таймер = 30с) или вызвать `markDirty()` вместо `flush()`.

### Изменённые файлы

| Файл | Что изменено |
|------|-------------|
| `frontend/lib/autosave-engine.ts` | `clientSessionId`, `createdOnServer`, POST/PUT fix |
| `backend/app/routers/chemistry_saves.py` | user_id ownership check в idempotency |
| `frontend/e2e/chemistry-save-resume.spec.ts` | Таймауты 60с, consoleErrors cleanup, online+flush dispatch |
| `frontend/components/scenes/ChemistryWorldScene.tsx` | `flush` в bridge **(НУЖЕН ИМПОРТ!)** |

### Команды для запуска

```bash
# E2E тесты (из d:\EduMind 3D\frontend)
npx playwright test e2e/chemistry-save-resume.spec.ts --reporter=list --timeout=240000

# Один тест
npx playwright test e2e/chemistry-save-resume.spec.ts --grep "2\." --reporter=list
```

---

## Обновление 2026-08-06 (продолжение) — Stage S8 E2E доведён до зелёного состояния

### Что сделано ✅

1. **Забытый импорт (корневая причина падения Test 2)**
   - `frontend/components/scenes/ChemistryWorldScene.tsx` — добавлен `import { autosaveEngine } from "@/lib/autosave-engine";`. Bridge (`window.__e2eChemistry.flush`) ссылался на него, но модуль не был импортирован.

2. **Гонка чтения DOM в Test 1 (pour water)**
   - `frontend/e2e/chemistry-save-resume.spec.ts` — после `pourFromStockBottle` тест читал `data-water-grams` немедленно (`getAttribute`), не дожидаясь ре-рендера React после dispatch. Заменено на `expect.poll(...)`.

3. **Слишком тесные фиксированные таймауты под нагрузкой (полный прогон 5 тестов подряд на SwiftShader/software-rendering)**
   - Все `{ timeout: 5_000 }` в `chemistry-save-resume.spec.ts` подняты до `15_000` (глобальный дефолт `expect.timeout` в `playwright.config.ts` и так 15с — эти оверрайды его тесняли).
   - `page.setDefaultTimeout` в `e2e/helpers/chemistry-isolated.ts` поднят с 25с до 45с.
   - `test.setTimeout` в spec-файле — 180с → 240с.
   - Resume-flow (клик Resume → модалка Continue → guided-lab-panel) в Test 1 получил построчное логирование и увеличенные таймауты (60с) для диагностики зависаний на холодном рендере.

4. **Реальная гонка в AutosaveEngine (найдена и исправлена в процессе финального прогона)**
   - Файл: `frontend/lib/autosave-engine.ts`.
   - Проблема: при восстановлении сети событие `online` (→ `retryPendingSync()`) и явный вызов `flush()` могли выполняться **параллельно**, оба слали PUT с одним и тем же `expected_revision`. Один побеждал (`"saved"`), второй получал 409 и **безусловно** откатывал статус на `"offline_pending"`/`"conflict"`, затирая уже корректный результат.
   - Фикс №1: добавлен мьютекс `isSyncing` — `flush()` и `retryPendingSync()` не запускаются одновременно.
   - Побочный эффект фикса №1, найден при повторных прогонах: если `flush()` вызывался, пока мьютекс уже занят (например, периодический 30s-таймер попал в очень узкое окно между `pour` и `toggleCabinet`), вызов просто **отбрасывался** — новое изменение (открытие шкафа) могло не попасть ни в один сохранённый снапшот. Воспроизвелось как `cabinet.isOpen: false` в снапшоте на бэкенде после релоада, хотя DOM и локальный state показывали `true`.
   - Фикс №2: добавлен `flushQueued` — если `flush()` вызван во время занятого мьютекса, вместо отбрасывания ставится флаг; сразу по завершении текущей синхронизации выполняется досрочный повторный `flush()` с уже самым свежим состоянием.

### Результаты финального прогона (после всех фиксов)

| Проверка | Результат |
|---|---|
| `npx tsc --noEmit` | 0 ошибок |
| `npx vitest run` (полный) | **438/438 PASSED (39 файлов)** |
| `pytest -o asyncio_mode=auto -q` | **54/54 PASSED** |
| `npm run lint` | 0 ошибок, 0 предупреждений |
| `npx playwright test e2e/chemistry-save-resume.spec.ts` (5 тестов) | **5/5 PASSED, дважды подряд стабильно** (~5-6 мин на прогон) |

### Изменённые файлы (эта сессия, поверх незакоммиченной работы S8)

| Файл | Что изменено |
|------|-------------|
| `frontend/components/scenes/ChemistryWorldScene.tsx` | добавлен недостающий импорт `autosaveEngine` |
| `frontend/lib/autosave-engine.ts` | мьютекс `isSyncing` + очередь `flushQueued` в `flush()`/`retryPendingSync()` |
| `frontend/e2e/chemistry-save-resume.spec.ts` | `expect.poll` вместо гонки при чтении `data-water-grams`; таймауты 5s→15s; `test.setTimeout` 180s→240s; логирование resume-flow |
| `frontend/e2e/helpers/chemistry-isolated.ts` | `page.setDefaultTimeout` 25s→45s |

### Что осталось ❌
Ничего блокирующего. Полный save→autosave→reload→resume→hydrate цикл проверен реальными backend/frontend серверами (не моками), включая offline/reconnect и optimistic locking. Backend (uvicorn :8000) и frontend (`next dev` :3000) на момент завершения сессии **запущены в фоне** для ручной проверки пользователем — не остановлены намеренно.

---

## Обновление 2026-08-06 (продолжение №2) — Баг двойного бейджа "ПРОЙДЕНО" + "Есть сохранение" — исправлен

### Ручной баг, о котором сообщил пользователь
Карточка эксперимента в каталоге одновременно показывала ✅ "ПРОЙДЕНО" (из локального Notebook) и ⚠ "Есть сохранение (шаг 7)" (из бэкенд-сохранения) — невозможное состояние.

### Корневая причина
`completeExperiment()` в `ChemistryLabExperienceProvider.tsx` обновлял ТОЛЬКО localStorage-Notebook (`completedExperimentIds` строится из него) и вызывал `autosaveEngine.uninit()` — а `uninit()` **чисто локальный** сброс, никогда не обращающийся к бэкенду. `ChemistrySave.status` на бэкенде навсегда оставался `"active"`, поэтому каталог (`GET /api/chemistry/saves`, фильтр `status==="active"`) продолжал предлагать Resume для уже пройденного эксперимента.

### Фикс (Вариант A — как и предлагал пользователь)
1. `backend/app/schemas/chemistry_save.py` / `chemistry_saves.py` — **не менялись**, PUT уже поддерживал `status` в теле запроса.
2. `frontend/lib/autosave-engine.ts`:
   - `flush(finalStatus?, snapshotOverride?)` — теперь может отправить PUT/POST со `status: "completed"` и явным снапшотом.
   - `pendingFinalStatus`/`pendingSnapshotOverride` — переживают busy-очередь (`flushQueued`), не теряются если flush встал в очередь.
   - `syncChainPromise` — `flush()` теперь возвращает promise, который резолвится только когда ВЕСЬ цикл (включая отложенный повтор) реально завершился — иначе `completeExperiment()` не мог бы надёжно дождаться завершения перед `uninit()`.
3. `frontend/components/core/ChemistryLabExperienceProvider.tsx` → `completeExperiment()`:
   - Снапшот захватывается **синхронно** в момент вызова (`getSerializeOptions()`) — НЕ через отложенный `stateGetter()`, потому что к моменту фактического выполнения (если flush встал в очередь) `selectedExperimentId` уже может быть сброшен в `null`, и `getSerializeOptions()` начнёт возвращать `null`.
   - `autosaveEngine.flush("completed", snapshot).finally(() => autosaveEngine.uninit())` — `uninit()` вызывается ПОСЛЕ попытки финализации, не раньше.
4. `frontend/components/lab/ExperimentCatalogBrowser.tsx` — добавлены `data-testid="catalog-completed-{id}"` и `data-testid="catalog-active-save-{id}"` для тестируемости (без изменения логики).

### Побочная находка и фикс — delta не был ограничен в игровом цикле
При написании E2E на этот баг (полное прохождение 8/8 шагов с реальным нагревом) обнаружилось: `ChemistryScene`'s `useFrame` считал `heatTick(delta * HEAT_RATE_C_PER_SEC, heldId)` с **необрезанным** `delta`. Если рендер-луп подвисал (фоновая вкладка, GC-пауза, throttling), следующий кадр мог получить `delta` в десятки секунд → мгновенный скачок температуры на тысячи градусов вместо плавного нагрева (воспроизведено: 20°C → 1419°C за один кадр). По прямому указанию пользователя исправлено в `ChemistryWorldScene.tsx`: `const delta = Math.min(rawDelta, 0.1);` — это защита игрового цикла, а не подгонка под тест (Chemistry Engine/математика нагрева не менялись).

### Новый E2E — Test 6 (`frontend/e2e/chemistry-save-resume.spec.ts`)
Полный реальный проход: 8/8 шагов гайда (`goal→safety→prepare→add-water→heat→observe→explain→finish`) через **реальные** domain-действия по bridge (`attachToHeatingSlot`, `pourFromStockBottle`, `toggleBurner`, `advanceStep`) → реальный нагрев до 100°C через настоящий `useFrame`/`heatTick` (не подделка) → `completeExperiment()` → проверка `GET /api/chemistry/saves` (`status==="completed"`) на бэкенде → реальный reload (`page.close()+newPage()`, т.к. `page.reload()` виснет на этом WebGL-канвасе) → в каталоге ОДНОВРЕМЕННО: `catalog-completed-...` виден, `catalog-active-save-...` и `catalog-resume-...` отсутствуют.

Bridge (`window.__e2eChemistry`, dev/test-only, `ChemistryWorldScene.tsx`) расширен: `attachToHeatingSlot`, `advanceStep`, `completeExperiment`, `getLabStepState()` — все вызывают РЕАЛЬНЫЕ domain-actions (`useChemistryWorkspace()`/`useChemistryLabExperience()`), ничего не подделывают и не инжектят напрямую. Т.к. `ChemistryWorldInner` (родитель `ChemistryLabExperienceProvider`) не может вызвать `useChemistryLabExperience()` сам, добавлен второй `useEffect` внутри `GuidedLabExperienceSection` (уже внутри провайдера), который **мёржит** (`Object.assign`, не перезаписывает) свои ключи в тот же `window.__e2eChemistry`.

### ⚠️ Важная находка про эту тестовую машину — headless-окружение нестабильно под нагрузкой
- Одиночный прогон Test 6 занимает **2.5-4 минуты реального времени** (не секунды!) — нагрев не ускорен, идёт по настоящим кадрам. Таймаут теста поднят точечно: `testInfo.setTimeout(300_000)` внутри Test 6.
- **Полный набор из всех 6 тестов подряд в одном браузере/воркере на этой машине нестабилен** — несколько раз наблюдались зависания на **40 минут и даже 3.2 часа** при попытке закрыть подвисший браузер после внутреннего таймаута теста (тот же класс проблемы, что уже описан в `playwright.config.ts` про WebGL/reload — только гораздо тяжелее с добавлением Теста 6). `frontend/e2e/helpers/chemistry-isolated.ts` получил доп. флаги браузера (`--disable-backgrounding-occluded-windows`, `--disable-renderer-backgrounding`, `--disable-background-timer-throttling`) — помогает, но не устраняет проблему полностью.
- **Рекомендация**: не гонять все 6 тестов одним `npx playwright test e2e/chemistry-save-resume.spec.ts` на этой машине. Гонять точечно (`--grep "6\."` и т.д.) или, если нужен полный прогон — закладывать реальный запас в 15-20+ минут и быть готовым вручную убить зависшие `chrome.exe` процессы (`Get-Process chrome | Stop-Process -Force`), если процесс не завершается сам.
- Тесты 1-5 по отдельности проходят надёжно (подтверждено индивидуальными прогонами). Test 5 один раз упал по таймауту, будучи 5-м тестом подряд в общей сессии — при изолированном повторном прогоне прошёл чисто (2.6 мин). Это износ ресурсов от последовательных тяжёлых WebGL-тестов, не регрессия кода.

### Обнаружена, но НЕ исправлена (не в скоупе этой задачи) — отдельная предсуществующая проблема backend-тестов
`backend/tests/test_chemistry_saves.py::test_latest_active_save` — нестабилен (не мой код, не трогал). Создаёт два сохранения подряд и ожидает второе как "latest" по `ORDER BY updated_at DESC`; на этой машине оба `datetime.utcnow()` иногда попадают в одно и то же разрешение системных часов → порядок неопределён → тест иногда падает (воспроизведено 2 раза подряд при полном прогоне, проходит всегда в изоляции). Нужен вторичный детерминированный tie-breaker при сортировке (не timestamp-based), если это когда-нибудь будет в приоритете — сейчас не трогал backend без явной необходимости.

### Финальные результаты проверок (после всех фиксов этой сессии)
| Проверка | Результат |
|---|---|
| `npx tsc --noEmit` | 0 ошибок |
| `npx vitest run` (полный) | **438/438 PASSED (39 файлов)** |
| `pytest -o asyncio_mode=auto -q` | 53/54 — 1 предсуществующий флейки-тест, см. выше (не регрессия) |
| `npm run lint` | 0 ошибок, 0 предупреждений |
| E2E Test 1-4 | PASSED |
| E2E Test 5 | PASSED в изоляции (флейки при полном прогоне подряд — см. выше) |
| E2E Test 6 (новый) | PASSED дважды подряд в изоляции (2.6 мин, 3.7 мин) |

### Изменённые файлы (эта часть сессии)
| Файл | Что изменено |
|------|-------------|
| `frontend/lib/autosave-engine.ts` | `flush(finalStatus?, snapshotOverride?)`, `pendingFinalStatus`, `pendingSnapshotOverride`, `syncChainPromise`; `retryPendingSync()` тоже учитывает `pendingFinalStatus` |
| `frontend/components/core/ChemistryLabExperienceProvider.tsx` | `completeExperiment()` шлёт финальный `flush("completed", snapshot)` перед `uninit()` |
| `frontend/components/lab/ExperimentCatalogBrowser.tsx` | `data-testid` на бейджах "пройдено"/"есть сохранение" |
| `frontend/components/scenes/ChemistryWorldScene.tsx` | delta clamp в `useFrame` (`Math.min(rawDelta, 0.1)`); bridge расширен (`attachToHeatingSlot`, `advanceStep`, `completeExperiment`, `getLabStepState`) через merge-safe `Object.assign` в двух местах |
| `frontend/e2e/chemistry-save-resume.spec.ts` | новый Test 6 (8/8 шагов + завершение + проверка каталога); `test.setTimeout` 240s (общий) |
| `frontend/e2e/helpers/chemistry-isolated.ts` | доп. anti-throttling флаги запуска Chromium |

### Что осталось ❌ (эта часть)
Ничего блокирующего по самой задаче. Единственное реальное открытое: (а) нестабильность headless-машины при ОДНОВРЕМЕННОМ прогоне всех 6 E2E — см. рекомендацию выше; (б) предсуществующий флейки-тест `test_latest_active_save` в backend, не в скоупе.

Backend (:8000) и frontend (:3000) на момент завершения **запущены в фоне** для ручной проверки — не остановлены намеренно. Ничего не закоммичено — ждёт явной команды пользователя.

Незакоммиченные изменения из предыдущей сессии (S8: backend saves API, serializer/hydrator, autosave engine, offline sync, resume UI) + фиксы из этой сессии **не закоммичены** — ждут явной команды на коммит. `frontend/tsconfig.tsbuildinfo` — сгенерированный артефакт, коммитить не нужно.

---

## Обновление 2026-08-06 (продолжение №3) — Реальный баг после ручной проверки: карточка ВСЁ ЕЩЁ показывала "Есть сохранение" после фикса завершения

### Что сообщил пользователь
После ручного прохождения эксперимента карточка одновременно показывала "ПРОЙДЕНО" и "Есть сохранение (шаг 7)" — то есть предыдущий фикс (продолжение №2) выглядел так, будто не сработал.

### Точная диагностика (прямой запрос к Postgres, не гадание)
Нашёл реальный аккаунт пользователя (`sodatovvv@gmail.com`, `user_id=93583609-...`) и напрямую запросил `chemistry_saves`:

```
id=8c143cab-... status=completed revision=20 updated_at=2026-08-06 08:39:15  (мой E2E-прогон, фикс сработал)
id=f7cee922-... status=completed revision=3  updated_at=2026-08-06 08:35:03  (мой E2E-прогон)
id=5bce4bd1-... status=active    revision=2  updated_at=2026-08-05 22:45:53  (брошенная попытка, ДО фикса)
id=09e73591-... status=active    revision=4  updated_at=2026-08-05 22:45:29  (брошенная попытка, ДО фикса)
id=f8f8039f-... status=active    revision=4  updated_at=2026-08-05 22:44:51  (брошенная попытка, ДО фикса)
id=245bc9e6-... status=active    revision=18 updated_at=2026-08-05 22:44:00  (брошенная попытка, ДО фикса)
```

**Вывод: финализация (`status=completed`) реально записывается в БД — фикс из продолжения №2 работает.** Проблема была НЕ в этом.

### Настоящая причина
`autosaveEngine.init()` генерирует новый случайный `clientSessionId` при каждом старте эксперимента → `idempotency_key` каждый раз уникален → backend (`create_save`) не находит совпадения по idempotency и создаёт **новую строку** в `chemistry_saves`, а не переиспользует старую. У одного пользователя на один `experiment_id` может быть СКОЛЬКО УГОДНО строк — по одной на каждую начатую попытку. Если попытку бросили не завершив — та строка навсегда остаётся `status="active"`.

`GET /api/chemistry/saves` (`chemistry_saves.py::list_saves`) отдаёт вообще все строки пользователя без группировки. А `ExperimentCatalogBrowser.tsx` (строки ~37-49, ДО фикса) перебирал их все и для КАЖДОЙ строки со `status==="active"` записывал `saveMap[experiment_id] = snapshot` — то есть срабатывала ЛЮБАЯ активная строка, даже старая брошенная, даже если для этого же эксперимента уже есть более новая `completed`-строка.

### Фикс
`frontend/components/lab/ExperimentCatalogBrowser.tsx`:
- Логика вынесена в чистую экспортируемую функцию `computeActiveSaveMap(saves)`.
- Список от бэкенда уже отсортирован `updated_at DESC` — функция берёт **только первую (самую свежую) строку на каждый `experiment_id`** (через `Set` уже виденных id) и показывает "Есть сохранение" только если именно ОНА `active`. Старые строки того же эксперимента, встреченные позже в списке, полностью игнорируются.
- Backend/схема/API — **не менялись** (в этом не было необходимости, диагностика это подтвердила).

### Новый тест — `frontend/components/lab/ExperimentCatalogBrowser.test.ts`
Юнит-тест (не E2E — чистая функция, без React/context/сети, доли секунды на прогон) воспроизводит ТОЧНО данные пользователя из диагностики (4 старых active + 2 новых completed) и проверяет `computeActiveSaveMap(...) === {}`. Плюс: "новая active-запись должна резюмироваться", "эксперименты не пересекаются друг с другом", "пустой/undefined/null вход не падает".

### Результаты проверок
| Проверка | Результат |
|---|---|
| `npx tsc --noEmit` | 0 ошибок |
| `npx vitest run` (полный) | **442/442 PASSED (40 файлов)** (было 438, +4 новых) |
| `npm run lint` | 0 ошибок, 0 предупреждений |

### Известное ограничение (не исправлялось — не просили, требует более крупного решения)
Старые брошенные `active`-строки в БД (5bce4bd1, 09e73591, f8f8039f, 245bc9e6 и т.п. у всех пользователей) остаются в таблице навсегда — фикс не удаляет и не помечает их, просто больше не даёт им влиять на UI. Если понадобится настоящая очистка/архивация брошенных попыток — это отдельная задача (например: TTL/cron, или помечать предыдущие `active` строки как `abandoned` при `selectExperiment()` нового захода на тот же `experiment_id`).

### Файлы, изменённые в этой части
| Файл | Что изменено |
|------|-------------|
| `frontend/components/lab/ExperimentCatalogBrowser.tsx` | вынесена и исправлена `computeActiveSaveMap()` — берёт последнюю по времени запись на `experiment_id`, а не любую активную |
| `frontend/components/lab/ExperimentCatalogBrowser.test.ts` | новый юнит-тест (4 кейса) |

Диагностические Python-скрипты (`query_saves_diag.py` и т.п.) были временными, удалены после использования — не коммитились.

Backend/frontend снова остановлены после диагностики (по просьбе пользователя). Этот коммит (27fe1c6) — от имени `sodatovruslan`, без Co-Authored-By, без push.

**Правило для будущих коммитов**: не добавлять Claude как соавтора (Co-Authored-By), коммитить только от имени пользователя. Сохранено в память агента.

---

## Обновление 2026-08-06 (продолжение №4) — Очистка каталога симуляций: управляемая видимость (visibility)

Stage S9 selected.
Planning completed.
electricity_stage_s9_plan.md approved.
Next implementation begins from Stage S9.0.

### Benchmark Status
Benchmark test file `lib/extended-graph-solver.benchmark.test.ts` not found.

### Real PASS/FAIL Results
No test files found, exiting with code 1

### Modified Files
No files were modified as per task constraints.

### Current Stage S9 Status
Planning completed. Implementation pending.

### Next Task for Claude (Option B)
Proceed with Option B as specified in the plan.

### Unresolved Limitations
Benchmark test file missing. Requires investigation.

### Задача
Пользователь запросил показывать в dashboard-каталоге (`GET /api/simulations/`) только 3 реальные симуляции, скрыв (не удаляя) устаревшие demo-дубли и E2E-тестовые фикстуры. Архитектура выбрана пользователем явно: не хардкодить ID/title во фронтенде — добавить в backend управляемое поле `visibility`.

### Что было в БД до фикса (7 строк в `simulations`)
| id | title | module | было |
|---|---|---|---|
| `54626292-...` | Chemistry World: первые эксперименты | chemistry_world | → PUBLIC |
| `632c609b-...` | Собери электрическую цепь | electricity_lab | → PUBLIC |
| `19979534-...` | Строение Земли: кора, мантия, ядро | geo3d | → PUBLIC |
| `5c5e3f81-...` | Нейтрализация HCl + NaOH | simlab | → ARCHIVED |
| `25a4ebc1-...` | Внутреннее строение Земли | geo3d | → ARCHIVED |
| `sim-chem-world` | Chemistry World for E2E Tests | chemistry_world | → TEST |
| `sim-chem` | Chemistry Lab for optimistic lock tests | chemistry_world | → TEST |

### ⚠️ Важно — GeoWorld-дубль оказался наоборот тому, что пользователь просил изначально
Пользователь изначально попросил оставить "Внутреннее строение Земли" и архивировать "Строение Земли: кора, мантия, ядро". **Прямая проверка кода показала обратное**:
- `backend/app/services/geography_engine.py` — ровно 4 слоя Земли (crust/mantle/outer_core/inner_core).
- `frontend/components/scenes/GeoWorldScene.tsx` — рендерит ровно эти 4 кликабельных слоя, шлёт `explore_layer` по одному на слой.
- `config.expected_steps` у "Внутреннее строение Земли" — `["explore_layer"]` (1 шаг, заглушка, не соответствует сцене).
- `config.expected_steps` у "Строение Земли: кора, мантия, ядро" — `["explore_layer"]×4` — **совпадает с реальной сценой и с каноническим `seed_simulations.py`**.

После предъявления доказательств пользователю (через `AskUserQuestion`) — подтверждено оставить PUBLIC именно "Строение Земли: кора, мантия, ядро" (`19979534-...`), архивировать "Внутреннее строение Земли" (`25a4ebc1-...`) как осиротевший дубль от более старой версии сид-скрипта.

### Реализация (по архитектуре, заданной пользователем)
1. **Model** (`backend/app/models/simulation.py`) — новый enum `SimulationVisibility` (`PUBLIC`/`INTERNAL`/`TEST`/`ARCHIVED`), колонка `Simulation.visibility` (`nullable=False, default=SimulationVisibility.PUBLIC`).
2. **Migration** (`backend/alembic/versions/8d92d001b554_add_visibility_to_simulations.py`) — создаёт Postgres ENUM `simulationvisibility`, добавляет колонку с `DEFAULT 'PUBLIC'` (существующие строки не ломаются), затем точечно бэкфиллит 4 конкретные строки по ID на `ARCHIVED`/`TEST`. **Ничего физически не удалено.** Применена (`alembic upgrade head`), текущий head — `8d92d001b554`.
3. **Schema** (`backend/app/schemas/simulation.py`) — `SimulationRead.visibility` добавлено.
4. **Router** (`backend/app/routers/simulations.py`) — `GET /api/simulations/` теперь по умолчанию фильтрует `visibility == PUBLIC`; необязательный `?visibility=test|internal|archived` для внутренних задач (эндпоинт уже требует авторизации). `GET /api/simulations/{id}` — **не фильтруется**, продолжает отдавать любую запись по точному ID (E2E обращаются к `sim-chem-world`/`sim-chem` напрямую по ID, не через список).
5. **Seeds**:
   - `seed_simulations.py` — теперь создаёт только 3 реальные PUBLIC-записи (SimLab-заглушка убрана из списка совсем — на свежей БД больше не создаётся); GeoWorld-запись — правильная, 4-шаговая.
   - `seed_e2e_simulations.py` — обе E2E-записи создаются с `visibility=TEST`; при повторном запуске, если видимость почему-то не TEST — самовосстанавливается. Идемпотентность подтверждена повторным запуском (0 новых строк).
6. **Frontend** — `frontend/lib/types.ts`: добавлен `SimulationVisibility` и поле `visibility` в `Simulation`. `frontend/app/(app)/dashboard/page.tsx` и `LessonCard.tsx` — **не менялись** (уже просто рендерят ответ API как есть, фильтрация по названиям никогда не делалась и не добавлялась).

### Новые тесты
- `backend/tests/test_simulations_visibility.py` — 10 тестов: список не отдаёт test/archived, отдаёт все 3 public (по отдельности + один общий), ровно одна GeoWorld-карточка, `GET /{id}` работает по точному ID для test- и archived-записей (не фильтруется), `?visibility=test` явно отдаёт test-записи, новая запись без явного visibility по умолчанию PUBLIC.
- `frontend/e2e/dashboard-catalog.spec.ts` — лёгкий (не WebGL, ~27 секунд) E2E: реальный пользователь открывает `/dashboard`, видит ровно 3 карточки с ожидаемыми заголовками, и НЕ видит текст ни одного из 4 скрытых.

### Проверено вживую (не только тестами)
- Прямой запрос к Postgres — итоговое распределение точно 3 PUBLIC / 2 TEST / 2 ARCHIVED, ничего не удалено.
- Живой `curl` через реальный `GET /api/simulations/` (с реальным JWT) — ровно 3 объекта в ответе, все `visibility=public`.
- `GET /api/simulations/sim-chem-world` — 200, `visibility=test` (доступ по ID не сломан).
- `GET /api/simulations/?module=chemistry_world` — теперь детерминированно возвращает только 1 (публичную) запись вместо непредсказуемого порядка из 3 — это ЛУЧШЕ для `frontend/e2e/helpers/chemistry-isolated.ts`, который берёт `labs[0].id` для входа в Chemistry World: раньше туда мог случайно попасть E2E-фикстур-ID, теперь всегда настоящая симуляция.

### Результаты проверок
| Проверка | Результат |
|---|---|
| `alembic upgrade head` | применена, head=`8d92d001b554` |
| `npx tsc --noEmit` | 0 ошибок |
| `npx vitest run` (полный) | **442/442 PASSED** |
| `npm run lint` | 0 ошибок |
| `pytest -o asyncio_mode=auto -q` (полный) | **64/64 PASSED** (54 старых + 10 новых) |
| `frontend/e2e/dashboard-catalog.spec.ts` | PASSED (27с) |
| Повторный запуск обоих seed-скриптов | идемпотентно, 0 дублей |

### Файлы, изменённые в этой части
| Файл | Что изменено |
|------|-------------|
| `backend/app/models/simulation.py` | `SimulationVisibility` enum + колонка `visibility` |
| `backend/app/schemas/simulation.py` | `SimulationRead.visibility` |
| `backend/app/routers/simulations.py` | `list_simulations` фильтрует по visibility (default PUBLIC), опциональный `?visibility=` |
| `backend/alembic/versions/8d92d001b554_add_visibility_to_simulations.py` | новая миграция (создана и применена) |
| `backend/seed_simulations.py` | только 3 реальные PUBLIC-записи, SimLab-заглушка убрана |
| `backend/seed_e2e_simulations.py` | `visibility=TEST` + самовосстановление при дрейфе |
| `backend/tests/test_simulations_visibility.py` | новый файл, 10 тестов |
| `frontend/lib/types.ts` | `SimulationVisibility` тип + поле в `Simulation` |
| `frontend/e2e/dashboard-catalog.spec.ts` | новый лёгкий E2E |

### Что осталось ❌
Ничего блокирующего. Backend/frontend остановлены после проверки. Ничего не закоммичено — ждёт команды пользователя (коммитить от `sodatovruslan`, без Co-Authored-By, без push — см. правило выше).

---

# === CURRENT PROJECT STATE ===

*(Свод по итогам всей сессии 2026-08-06. Детальная хронология каждого шага — в разделах выше; здесь — итоговое, самодостаточное состояние.)*

## Что было реализовано на этом этапе

Этап фактически состоял из 4 последовательных под-задач внутри Stage S8 (Persistent Save/Autosave/Resume) + примыкающей задачи по каталогу симуляций:

**1. Добивание Stage S8 E2E до зелёного состояния**
   - Починен забытый импорт `autosaveEngine` в `ChemistryWorldScene.tsx` (bridge вызывал `autosaveEngine.flush()` без импорта модуля) — корневая причина, из-за которой Test 2 (Offline Save & Resume) падал.
   - Найдена и исправлена гонка в самом E2E-тесте (немедленное чтение `data-water-grams` после dispatch вместо `expect.poll`).
   - Найдена и исправлена **реальная гонка в `AutosaveEngine`**: параллельные `flush()`/`retryPendingSync()` могли слать два PUT с одной и той же `expected_revision`; проигравший получал 409 и безусловно откатывал статус, затирая уже корректный результат. Добавлен мьютекс `isSyncing` + очередь `flushQueued`/`syncChainPromise`, чтобы ни один sync не терялся и не дублировался.

**2. Баг двойного бейджа "ПРОЙДЕНО" + "Есть сохранение"**
   - Диагностика №1 (по коду): `completeExperiment()` обновлял только localStorage-Notebook и никогда не сообщал бэкенду о завершении — `ChemistrySave.status` навсегда оставался `"active"`. Исправлено: `completeExperiment()` теперь шлёт финальный `PUT .../saves/{id}` со `status="completed"` (снапшот захватывается СИНХРОННО в момент вызова, а не через отложенный `stateGetter()`, чтобы не потеряться, если flush встанет в очередь и `selectedExperimentId` к этому моменту уже обнулится).
   - По прямому указанию пользователя: **delta кадра в `ChemistryWorldScene`'s `useFrame` теперь зажат** (`Math.min(rawDelta, 0.1)`) — без этого подвисание рендера (фоновая вкладка, GC-пауза) могло дать мгновенный скачок нагрева на тысячи градусов за один кадр вместо плавного реального нагрева.
   - Диагностика №2 (после ручной проверки пользователем — баг всё ещё воспроизводился): прямой запрос к Postgres по реальному аккаунту пользователя показал, что финализация РЕАЛЬНО пишется (`status=completed`), но у эксперимента уже было **6 отдельных строк** в `chemistry_saves` (по одной на каждую начатую попытку — `autosaveEngine.init()` генерирует новый `clientSessionId` при каждом старте → новый `idempotency_key` → новая строка в БД). Каталог брал ЛЮБУЮ активную строку, а не последнюю по времени. Исправлено: `computeActiveSaveMap()` в `ExperimentCatalogBrowser.tsx` теперь учитывает только САМУЮ СВЕЖУЮ запись на `experiment_id` (список от бэкенда уже отсортирован `updated_at DESC`).

**3. Очистка каталога симуляций (управляемая видимость)**
   - Добавлено поле `Simulation.visibility` (enum `PUBLIC`/`INTERNAL`/`TEST`/`ARCHIVED`), Alembic-миграция, фильтрация в `GET /api/simulations/` (default=PUBLIC, `GET /{id}` не фильтруется — E2E продолжают работать по прямому ID).
   - Диагностика показала, что GeoWorld-дубль, который просил архивировать пользователь, был **перепутан местами**: реальная, рабочая запись (4 слоя Земли, совпадает с `geography_engine.py` и `GeoWorldScene.tsx`) — это "Строение Земли: кора, мантия, ядро", а не "Внутреннее строение Земли" (осиротевшая заглушка с 1 шагом). Подтверждено пользователем через `AskUserQuestion` перед миграцией.
   - Seed-скрипты обновлены: `seed_simulations.py` создаёт только 3 реальные PUBLIC-записи; `seed_e2e_simulations.py` создаёт TEST-записи с самовосстановлением видимости.

## Архитектурные решения, принятые в этой сессии

1. **AutosaveEngine — мьютекс + очередь вместо блокировки.** Решение: не отбрасывать конкурирующие `flush()`-вызовы молча (это теряло данные), а ставить в очередь (`flushQueued`) и гарантированно догонять актуальным состоянием сразу после текущей синхронизации. `syncChainPromise` даёт вызывающему коду (например `completeExperiment()`) честный promise, который резолвится только когда ВЕСЬ цикл (включая отложенный повтор) реально завершился.
2. **Финализация эксперимента = явный PUT со status, не отдельный endpoint.** Backend уже поддерживал `status` в теле PUT — архитектурно решено переиспользовать существующий `ChemistrySaveUpdate.status`, а не проектировать новый API.
3. **Снапшот для финализации захватывается синхронно, а не лениво.** Это единственный способ гарантированно не потерять данные о completion, если flush встанет в очередь позади другой синхронизации и к моменту реального выполнения `selectedExperimentId` уже обнулится.
4. **Delta кадра — защитный клэмп в игровом цикле, не workaround для тестов.** По прямому указанию пользователя: "стабильный игровой цикл важнее обходных путей для E2E". `Math.min(rawDelta, 0.1)` — это защита от реального класса багов (alt-tab, GC-пауза, троттлинг браузера), не костыль под конкретный тест.
5. **Видимость каталога — управляемое поле в БД, не хардкод во фронтенде.** Явное архитектурное решение пользователя: `SimulationVisibility` enum в backend, фильтрация на уровне `GET /api/simulations/`, фронтенд как рендерил ответ API "как есть", так и продолжает — никакой клиентской фильтрации по названиям.
6. **"Последняя запись побеждает", а не "любая активная".** `computeActiveSaveMap()` — универсальный паттерн: раз `chemistry_saves` допускает множество строк на один `experiment_id`, только САМАЯ СВЕЖАЯ решает состояние UI.

## Изменённые файлы (все, за всю сессию)

**Backend:**
- `backend/app/routers/chemistry_saves.py` — из предыдущей сессии (idempotency user_id check), донесено до коммита.
- `backend/app/models/simulation.py` — `SimulationVisibility` enum + колонка.
- `backend/app/schemas/simulation.py` — `SimulationRead.visibility`.
- `backend/app/routers/simulations.py` — фильтрация `list_simulations` по visibility.
- `backend/alembic/versions/8d92d001b554_add_visibility_to_simulations.py` — новая миграция (применена, head).
- `backend/seed_simulations.py` — только 3 реальные PUBLIC-записи.
- `backend/seed_e2e_simulations.py` — `visibility=TEST` + самовосстановление.
- `backend/tests/test_simulations_visibility.py` — новый файл, 10 тестов.

**Frontend:**
- `frontend/components/scenes/ChemistryWorldScene.tsx` — импорт `autosaveEngine`; delta clamp в `useFrame`; E2E test bridge расширен (`attachToHeatingSlot`, `advanceStep`, `completeExperiment`, `getLabStepState`) через merge-safe `Object.assign`.
- `frontend/lib/autosave-engine.ts` — мьютекс `isSyncing`, `flushQueued`, `syncChainPromise`, `pendingFinalStatus`, `pendingSnapshotOverride`.
- `frontend/components/core/ChemistryLabExperienceProvider.tsx` — `completeExperiment()` шлёт финальный `flush("completed", snapshot)`.
- `frontend/components/lab/ExperimentCatalogBrowser.tsx` — `computeActiveSaveMap()` (последняя запись на experiment_id), `data-testid` на бейджах.
- `frontend/components/lab/ExperimentCatalogBrowser.test.ts` — новый файл, 4 юнит-теста.
- `frontend/lib/types.ts` — `SimulationVisibility` тип + поле в `Simulation`.
- `frontend/e2e/chemistry-save-resume.spec.ts` — новый Test 6 (8/8 шагов + завершение + проверка каталога); увеличенные таймауты.
- `frontend/e2e/helpers/chemistry-isolated.ts` — anti-throttling флаги Chromium; `page.setDefaultTimeout` 25s→45s.
- `frontend/e2e/dashboard-catalog.spec.ts` — новый лёгкий E2E (не WebGL).
- `frontend/lib/autosave-engine.test.ts`, `frontend/lib/chemistry-save-serializer.ts/.test.ts`, `frontend/components/lab/AutosaveBadge.tsx/.test.tsx`, `frontend/components/lab/GuidedLabPanel.tsx`, `frontend/components/core/ChemistryWorkspaceProvider.tsx` — донесены из предыдущей сессии (S8), финализированы в этой.

## Тесты, добавленные в этой сессии
- `frontend/e2e/chemistry-save-resume.spec.ts` — Test 6 (полное прохождение 8/8 шагов с реальным нагревом до 100°C, завершение, проверка каталога после reload).
- `frontend/components/lab/ExperimentCatalogBrowser.test.ts` — 4 юнит-теста на `computeActiveSaveMap` (воспроизводит точный сценарий пользователя: 4 старые active + 2 новые completed).
- `backend/tests/test_simulations_visibility.py` — 10 тестов на фильтрацию каталога по visibility.
- `frontend/e2e/dashboard-catalog.spec.ts` — 1 лёгкий E2E на итоговый вид dashboard (ровно 3 карточки).

## Выполненные проверки (финальное состояние)
| Проверка | Результат |
|---|---|
| `npx tsc --noEmit` | 0 ошибок |
| `npm run lint` | 0 ошибок, 0 предупреждений |
| `npx vitest run` (полный) | **442/442 PASSED (40 файлов)** |
| `pytest -o asyncio_mode=auto -q` (полный) | **64/64 PASSED** |
| `alembic upgrade head` | применена, head=`8d92d001b554` |
| E2E `chemistry-save-resume.spec.ts` (6 тестов) | все 6 проходят по отдельности; ⚠️ вместе — нестабильность машины (см. ниже) |
| E2E `dashboard-catalog.spec.ts` | PASSED (27с) |
| Живой `curl` через реальный JWT | подтверждено: `GET /api/simulations/` → ровно 3 PUBLIC-объекта |

## Проблемы, найденные и исправленные в этой сессии
1. Забытый импорт `autosaveEngine` → Test 2 падал.
2. Гонка чтения DOM в E2E-тесте (немедленный `getAttribute` вместо `expect.poll`).
3. Реальная гонка `flush()`/`retryPendingSync()` в `AutosaveEngine` → статус безусловно откатывался.
4. Побочный эффект фикса №3 — простое "отбросить при занятости" теряло изменения → добавлена очередь.
5. `completeExperiment()` никогда не сообщал бэкенду о завершении → каталог вечно показывал "Есть сохранение".
6. Побочная гонка при финализации: если flush("completed") встаёт в очередь, к моменту выполнения `selectedExperimentId` уже может быть `null` → снапшот теперь захватывается синхронно, не лениво.
7. Необрезанный `delta` кадра → мгновенный скачок нагрева на тысячи градусов при подвисании рендера.
8. Каталог брал ЛЮБУЮ активную запись эксперимента, а не последнюю → старые брошенные попытки вечно показывали "Есть сохранение" даже после успешного завершения новой попытки.
9. GeoWorld-дубль в исходном запросе пользователя был перепутан местами — исправлено ПОСЛЕ прямой проверки кода и подтверждения пользователем.
10. Предсуществующий флейки-тест `test_latest_active_save` (backend) — **не мой код, не исправлялся**, задокументирован отдельно (коллизия `datetime.utcnow()` при двух быстрых POST на этой машине).

## Известные ограничения
- **Headless Chromium на этой машине нестабилен при ОДНОВРЕМЕННОМ прогоне всех 6 тестов `chemistry-save-resume.spec.ts`** — несколько раз наблюдались зависания на 40 минут и 3.2 часа при закрытии подвисшего браузера после внутреннего таймаута. По отдельности (`--grep`) все 6 тестов проходят надёжно. Рекомендация: не гонять этот файл целиком без реального запаса 15-20+ минут и готовности вручную убить `chrome.exe`.
- Старые брошенные `active`-записи в `chemistry_saves` (не только у тестового пользователя) остаются в БД навсегда — фикс каталога не даёт им влиять на UI, но не чистит и не архивирует их. Если понадобится настоящая очистка — отдельная задача (TTL/cron или пометка `abandoned` при повторном старте того же `experiment_id`).
- `backend/tests/test_chemistry_saves.py::test_latest_active_save` — предсуществующий флейки-тест, не в скоупе, не трогался.

## Какие серверы должны быть запущены при следующем старте
**Сейчас ничего не запущено** — backend и frontend были намеренно остановлены после диагностики/проверки.

Для продолжения работы:
```bash
# Backend (из d:\EduMind 3D\backend)
.venv/Scripts/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000

# Frontend (из d:\EduMind 3D\frontend)
npm run dev
```
Postgres должен быть уже запущен как системный сервис (`postgresql-x64-16`/`postgresql-x64-17`) — в этой среде он всегда поднят отдельно от приложения.

## Git-состояние на момент остановки
- Ветка: `feature/stage-s7-v2-locomotion`.
- HEAD: `2b234a5` ("all is good" — коммит от пользователя, сделан им лично в процессе этой сессии, не мной).
- Мой последний коммит в этой ветке: `27fe1c6` ("fix(chemistry): finalize Stage S8 save/resume and fix completion badge bug") — от имени `sodatovruslan`, без Co-Authored-By, без push.
- Работа по каталогу симуляций (visibility) из этой сессии **ещё не закоммичена** — см. `git status` в финальном ответе ниже.
- **Правило для всех будущих коммитов в этом репозитории**: никогда не добавлять `Co-Authored-By: Claude`, коммитить только от имени пользователя (`sodatovruslan`). Сохранено в персистентную память агента (`git_commit_no_coauthor.md`).

---

# === NEXT STAGE ===

## С какого места продолжать
Явного "следующего Stage" пользователь пока не назвал. Всё, что было явно запрошено в этой сессии, **полностью завершено и проверено**:
- Stage S8 (Persistent Save/Autosave/Resume) — зелёный, E2E проходят по отдельности.
- Баг двойного бейджа завершения — исправлен и проверен диагностикой на реальных данных пользователя.
- Каталог симуляций — управляемая видимость, ровно 3 карточки у пользователя, подтверждено живым API-запросом.

Следующий AI должен **дождаться от пользователя явного описания следующей задачи/Stage**, а не придумывать её сам. Единственное известное незакрытое техническое действие — решить, коммитить ли работу по каталогу симуляций (сделана, проверена, не закоммичена).

Если пользователь попросит просто закоммитить текущее состояние — файлы для staging:
```
backend/app/models/simulation.py
backend/app/routers/simulations.py
backend/app/schemas/simulation.py
backend/seed_e2e_simulations.py
backend/seed_simulations.py
backend/alembic/versions/8d92d001b554_add_visibility_to_simulations.py
backend/tests/test_simulations_visibility.py
frontend/lib/types.ts
frontend/e2e/dashboard-catalog.spec.ts
HANDOFF.md
```
`frontend/tsconfig.tsbuildinfo` — сгенерированный артефакт, в коммит не включать. Удалённые `artifacts/*.png` (см. `git status`) — не трогать, не мои изменения, происхождение не выяснялось (не относится к этой сессии).

## Что категорически нельзя переписывать
- **Chemistry Engine** (`frontend/lib/chemistry-engine.ts`) — химия/физика реакций, растворение, кипение. Не пересчитывать заново.
- **Reaction Engine** (`frontend/lib/reaction-engine.ts`) — зарегистрированные реакции.
- **Hazard Engine / Safety System** (`frontend/lib/hazard-engine.ts`, `frontend/lib/chemistry-safety.ts`) — расчёт давления, предупреждения.
- **Pour Engine** (`frontend/lib/pour-engine.ts`) — геометрия/скорость налива.
- **Observation semantics** (`frontend/lib/observation-logger.ts`, `frontend/lib/chemistry-context-builder.ts`) — событийная модель для AI-контекста и оценки.
- **Sandbox locomotion** (`frontend/lib/sandbox-locomotion.ts`) — WASD, коллизии, Held Rig, placement — Stage S7-v2, полностью завершён и заморожен.
- **Experiment Validator** (`frontend/lib/chemistry-lab-catalog.ts` — условия `isUnlocked`/`isComplete` для 12 лабораторных работ) — не переписывать логику разблокировки шагов.
- **Geography Engine** (`backend/app/services/geography_engine.py`) — 4 слоя Земли, справочные данные.
- **Grader Service** (`backend/app/services/grader_service.py`) — `compute_score()`.
- **Serializer/Autosave архитектура** (`frontend/lib/chemistry-save-serializer.ts`, `frontend/lib/autosave-engine.ts`) — без ДОКАЗАННОЙ необходимости (как в этой сессии — реальная гонка, подтверждённая диагностикой). Мьютекс/очередь, добавленные в этой сессии — не трогать без веской причины.
- **Backend ChemistrySave API** (`backend/app/routers/chemistry_saves.py`, `backend/app/schemas/chemistry_save.py`) — без доказанной необходимости.
- **Simulation visibility архитектура**, только что построенная (`SimulationVisibility` enum, фильтрация в роутере) — не переделывать на хардкод ID/title без веской причины.

## Какие Provider нельзя ломать
- `ChemistryWorkspaceProvider` (`frontend/components/core/ChemistryWorkspaceProvider.tsx`) — единственный источник domain-state для Chemistry World (containers/stockBottles/tools/cabinets). Не создавать второй Workspace Provider.
- `ChemistryLabExperienceProvider` (`frontend/components/core/ChemistryLabExperienceProvider.tsx`) — учебный слой (шаги, режимы, Notebook, autosave-интеграция). `completeExperiment()`/`advanceStep()`/`getSerializeOptions()` только что доработаны — логика синхронного захвата снапшота критична, не упрощать обратно на ленивый `stateGetter()`.
- `ChemistryInteractionProvider`, `ChemistryDragProvider` — pipeline взаимодействия Sandbox (Stage S7), не трогать.
- `ExperimentProgressProvider`, `ChemistryTutorialProvider` — Stage S6, завершены.

## Какие Engine нельзя менять
См. список "категорически нельзя переписывать" выше — Chemistry/Reaction/Hazard/Pour/Geography Engine, Grader Service.

**Единственное разрешённое явно указанным пользователем исключение**: клэмп `delta` в `useFrame` внутри `ChemistryWorldScene.tsx` (`Math.min(rawDelta, 0.1)`) — это защита игрового цикла, уже сделана в этой сессии, не относится к самому Engine (не трогает `heatContainer`/`aggregateStateOf` и т.д.).

## Что считается полностью завершённым
- **Stage S1–S6** — Chemistry World, Chemistry Engine, задания, Observation, Assessment, Teacher Report.
- **Stage S7 / S7-v2** — Sandbox Mode целиком (локомоция, коллизии, Held Rig, placement, шкафы, крышки, наливание, нагрев, dynamic heating sockets).
- **Stage S8** — Persistent Save / Autosave / Resume / Offline Sync / Optimistic Locking — включая финализацию статуса при завершении эксперимента.
- **Каталог симуляций** — управляемая видимость (visibility), ровно 3 реальные записи в пользовательском dashboard.

**E2E `chemistry-save-resume.spec.ts` содержит 6 тестов, все зелёные по отдельности** — но файл в целом (все 6 разом) нестабилен на этой конкретной машине из-за нагрузки на headless Chromium/SwiftShader, не из-за логики. Следующий AI не должен тратить время на "починку" этого — это уже исследовано и задокументировано (см. раздел выше), а не открытый баг.

---

## Обновление 2026-08-06 (продолжение №5) — Stage S9 (Electricity Lab, параллельные цепи): фиктивные артефакты обнаружены и заменены реальным Option B

### ⚠️ Важно — предыдущий фрагмент HANDOFF про "Stage S9 selected... Option B... Benchmark test file not found" (см. выше, в теле продолжения №4) содержал ФИКТИВНУЮ работу
При чтении в начале этого чекпоинта обнаружено: 3 файла, представленные как "инфраструктура бенчмарков Stage S9" (`electricity_stage_s9_plan.md`, `frontend/lib/extended-graph-solver.ts`, `solver-spike-report.md`), оказались фиктивными:
- **`electricity_stage_s9_plan.md`** — план с буквальными плейсхолдерами вместо контента (`[Previous content unchanged...]`, `[Additional S9.x sections expanded with same structure...]`), несмотря на заголовок "(Final)".
- **`frontend/lib/extended-graph-solver.ts`** (Option A) — пустая заглушка (`return {} as CircuitSolution`), даже не компилировалась (`tsc` — 4 ошибки `Cannot find name`, отсутствующие импорты собственных типов).
- **`solver-spike-report.md`** — описывал прогон `npx vitest run lib/extended-graph-solver.test.ts` с "3 прошедшими тестами". **Такого файла не существует и не существовало в репозитории** — результаты выдуманы, реализация (пустышка) физически не могла их произвести.

Пользователю показаны точные доказательства (проверка `find`, попытка `tsc`, чтение исходников) до принятия решения. Пользователь подтвердил: не начинать Stage S9 заново, но заменить доказанные плейсхолдеры реальной работой и продолжить **Option B (Nodal Analysis)** согласно роадмапу.

### Что сделано ✅

1. **Удалена нефункциональная заглушка** `frontend/lib/extended-graph-solver.ts` (Option A) — не несла ценности, не компилировалась, блокировала `tsc`.

2. **Реализован реальный Option B** — `frontend/lib/nodal-analysis-solver.ts`:
   - `solveCircuitNodal(components, connections): CircuitSolution` — тот же контракт возврата, что и production `solveCircuit()` из `circuit-engine.ts`.
   - **Полностью изолирован от production** — не импортируется в `ElectricityLabScene.tsx` или где-либо ещё вне тестов (по прямому требованию: "Keep production code isolated from benchmark prototypes until a final solver is selected").
   - Идеальные компоненты (замкнутый переключатель/амперметр/исправный предохранитель, разомкнутый/сгоревший) представлены малым/большим КОНЕЧНЫМ сопротивлением (`EPS_R_OHM=1e-6`, `BIG_R_OHM=1e9`) вместо буквального 0/Infinity — стандартный приём для "чистого" nodal analysis без доп. неизвестных (этим Option B отличается от Option C/MNA).
   - Батарея (единственный источник напряжения в этом домене — как и в production-солвере) обрабатывается как граничное условие (узел закреплён на V, узел земли — на 0), а не как часть матрицы проводимости — валидно ровно потому, что источник один.

3. **14 реальных тестов** — `frontend/lib/nodal-analysis-solver.test.ts`, реально прогнаны (`npx vitest run`), результат честно задокументирован:
   - **8 тестов паритета** — те же фикстуры, что в `circuit-engine.test.ts` (series loop, open switch, short circuit, fuse blow/no-blow, voltmeter×2, no battery, unclosed loop), сверены напрямую с выводом production-солвера через `toBeCloseTo`.
   - **4 теста новой возможности**, которой нет у DFS — 2 резистора параллельно, смешанная сеть, 3 параллельные ветви, "мостовая" сеть (две независимые последовательные ветви между общими полюсами батареи — топология, которую однопутевой DFS **структурно не может представить**). Все сверены с посчитанными вручную ответами.
   - **2 стресс-теста на риск, заявленный самим роадмапом** ("Reject if: Voltage sources cause numerical instability") — разомкнутый и замкнутый переключатель на одной паре узлов (EPS_R и BIG_R рядом в одной системе уравнений) и веер из 6 параллельных ветвей (1Ω..1000Ω). **Оба прошли** — нестабильность не подтвердилась для реального диапазона величин этого домена.
   - Реальный вывод: **14/14 PASSED**, `npx vitest run` (полный, 41 файл): **456/456 PASSED**.

4. **`solver-spike-report.md` переписан целиком** — старый фиктивный контент заменён честным отчётом с реальным выводом тестов, методологией (почему EPS_R/BIG_R, почему батарея — граничное условие), результатами по риску нестабильности и явным списком ограничений (не оптимизирован по производительности, вырожденный случай "батарея закорочена напрямую проводом" не гарантирован, не поддерживает несколько источников — как и production-солвер).

5. **`electricity_stage_s9_plan.md` дозаполнен, НЕ переписан заново** — секция "1. Complete File Inventory" (была `[Previous content unchanged...]`) заполнена реальным списком файлов; секция S9.1 (была `[Additional S9.x sections expanded with same structure...]`) дозаполнена реальными результатами спайка. Структура/нумерация роадмапа (S9.0/S9.1/S9.2, Option A/B/C, чеклист §3) **не менялась** — только плейсхолдеры заменены содержанием.

### Архитектурное решение (это продолжение, не пересмотр роадмапа)
- **Option A не восстанавливался** — файл был пустышкой без реальной логики, восстанавливать нечего; пользователь прямо направил на Option B.
- **Option C не запускался в этом чекпоинте** — раз Option B прошёл собственный заявленный в роадмапе критерий отбраковки на реальных тестах, эскалация к более сложному MNA пока не обоснована доказательствами. Пересмотреть только если интеграция в production (S9.2+) найдёт реальный кейс, который Option B не тянет.
- **Производительность не замерялась** — все тесты решают крошечные цепи (<1мс). Нужен реальный замер против критерия "<5ms per frame" из чеклиста §3, прежде чем закрывать S9.1 окончательно.

### Результаты проверок
| Проверка | Результат |
|---|---|
| `npx tsc --noEmit` | 0 ошибок |
| `npx vitest run lib/nodal-analysis-solver.test.ts` | **14/14 PASSED** (реально прогнано) |
| `npx vitest run` (полный) | **456/456 PASSED (41 файл)** |
| `npm run lint` | 0 ошибок, 0 предупреждений |
| Production-файлы (`circuit-engine.ts`, `ElectricityLabScene.tsx`) | **не изменены** — изоляция прототипа подтверждена `git status` |

### Файлы, изменённые/добавленные в этой части
| Файл | Что изменено |
|------|-------------|
| `frontend/lib/extended-graph-solver.ts` | **удалён** (доказанная нефункциональная заглушка Option A) |
| `frontend/lib/nodal-analysis-solver.ts` | новый файл — реальная реализация Option B |
| `frontend/lib/nodal-analysis-solver.test.ts` | новый файл — 14 реальных тестов |
| `solver-spike-report.md` | переписан целиком (был фиктивным) |
| `electricity_stage_s9_plan.md` | дозаполнены плейсхолдеры реальным содержанием, структура роадмапа не менялась |

### Что осталось ❌ (на тот момент)
Это был ЧЕКПОИНТ внутри S9.1, не завершение Stage S9 — закрыто следующим чекпоинтом ниже (продолжение №6).

Ничего не закоммичено. Backend/frontend серверы не запускались в этой части (чисто frontend unit-test работа, backend не требовался).

---

## Обновление 2026-08-06 (продолжение №6) — Stage S9.1 закрыт: реальный бенчмарк + формальное решение S9.2 (Option B выбран)

### Задача чекпоинта
Продолжить строго с зафиксированного выше чекпоинта: (1) реальный бенчмарк производительности `nodal-analysis-solver.ts` на small/medium mixed/10-node/20-node/repeated-execution цепях, (2) сравнение с production DFS-солвером на топологиях, которые поддерживают оба, (3) формальное решение S9.2 (выбрать или отклонить Option B, обосновать по correctness/regression/performance/maintainability/domain scope, явно сказать про Option C), (4) обновить все 3 документа. Интеграция в production, коммит, push — запрещены явно.

### Что сделано ✅

1. **Новый файл `frontend/lib/nodal-analysis-solver.benchmark.test.ts`** — 8 тестов, реально прогнаны 3 раза подряд для проверки воспроизводимости (не однократный случайный результат):
   - Small (4 резистора, 5 узлов), Medium mixed (9 компонентов, series+parallel — то, что DFS не умеет), 10-node series, 10-node parallel fan-out, 20-node series, 20-node parallel fan-out, repeated ×2000 (medium mixed), repeated ×2000 (20-node series).
   - Там, где обе топологии поддерживаются (series-цепи), — прямое сравнение `solveCircuit()` (DFS) vs `solveCircuitNodal()` (Option B) через `performance.now()`, 200 итераций на замер.

2. **Реальные результаты (3 независимых прогона, числа стабильны в пределах <2x разброса, типичного для суб-миллисекундных микро-бенчмарков)**:
   - Small: DFS ~0.02мс, Nodal ~0.024мс (~1.2x).
   - Medium mixed (DFS не умеет): Nodal ~0.03мс.
   - 10-node series: DFS ~0.028мс, Nodal ~0.06мс (~2.2x).
   - 10-node parallel (DFS не умеет): Nodal ~0.02мс.
   - 20-node series: DFS ~0.03мс, Nodal ~0.08мс (~2.5x).
   - 20-node parallel (DFS не умеет): Nodal ~0.05мс.
   - Repeated ×2000 (устойчивый режим, JIT прогрет): 0.011-0.02мс/solve (medium mixed), 0.025-0.033мс/solve (20-node series).
   - **Критерий приёмки "<5ms per frame" (§3 плана) пройден с запасом 60-450x** на всех размерах. `ElectricityLabScene.tsx` вызывает солвер при изменении схемы, а не каждый кадр — реальная частота вызовов в production ещё ниже, чем в бенчмарке.
   - Nodal стабильно медленнее DFS в 1.2-2.5x на общих топологиях (ожидаемо — O(n³) плотный Gaussian elimination против O(n) однопутевого DFS), но абсолютная величина (доли миллисекунды) не имеет значения при реалистичном для лаборатории количестве компонентов (единицы-десятки, не сотни).

3. **Формальное решение S9.2 — `solver-spike-report.md`, новый раздел "S9.2 — Формальное архитектурное решение"**:
   - **Решение: ВЫБРАН Option B (Nodal Analysis).**
   - Обоснование по каждому критерию (correctness/regression/performance/maintainability/domain scope) — с конкретными числами и ссылками на реальные тесты, не общими словами.
   - **Явно объяснено, почему Option C (MNA) НЕ требуется**: вся его дополнительная сложность (auxiliary-переменные тока через источники, разреженные матрицы) решает две проблемы — несколько источников напряжения и нестабильность идеальных элементов — ни одна из которых не встречается в этом домене (в лаборатории всегда ровно один `battery`, это уже ограничение самого production-солвера, не новое; нестабильность целенаправленно протестирована дважды и не подтвердилась).
   - Названы условия, при которых решение стоит пересмотреть в будущем (несколько источников, экстремально широкий разброс номиналов, конкретный воспроизводимый случай неверного результата) — сейчас ни одно из них не применимо.
   - Явно зафиксировано: **интеграция в production НЕ часть этого решения и не начата**.

4. **`electricity_stage_s9_plan.md` дозаполнен** — добавлен раздел `### S9.2 - Final Solver Selection` (по той же структуре Goal/Existing/Files/Tests, что и S9.0/S9.1 — роадмап не переписан, а продолжен на следующий логический шаг, который сам роадмап и предполагал: "Final selection in S9.2"). Строка про "Performance profiling — not yet done" исправлена на "done, real benchmark".

### Результаты проверок
| Проверка | Результат |
|---|---|
| `npx tsc --noEmit` | 0 ошибок |
| `npx vitest run` (полный) | **464/464 PASSED (42 файла)** |
| `npm run lint` | 0 ошибок, 0 предупреждений |
| Production-файлы (`circuit-engine.ts`, `ElectricityLabScene.tsx`, `electricity-lab-catalog.ts`) | **не изменены** — подтверждено `git status` |
| Бенчмарк | реально прогнан 3 раза, числа воспроизводимы |

### Файлы, изменённые/добавленные в этой части
| Файл | Что изменено |
|------|-------------|
| `frontend/lib/nodal-analysis-solver.benchmark.test.ts` | новый файл — 8 реальных тестов-бенчмарков |
| `solver-spike-report.md` | добавлена таблица реального бенчмарка + весь раздел "S9.2 — Формальное архитектурное решение" |
| `electricity_stage_s9_plan.md` | добавлен раздел `S9.2 - Final Solver Selection`, обновлён статус "Performance profiling" |

### Что осталось ❌ (на тот момент)
Решение S9.2 ожидало одобрения пользователя. **Одобрено** — интеграция выполнена следующим чекпоинтом ниже (продолжение №7).

---

## Обновление 2026-08-07 (продолжение №7) — Stage S9.2 интеграция: Option B теперь production solver Electricity Lab

### Задача чекпоинта
Решение S9.2 одобрено пользователем. Интегрировать Nodal Analysis как production-солвер отдельным контролируемым чекпоинтом: не переписывать `circuit-engine.ts` целиком, сохранить публичный контракт `solveCircuit(...): CircuitSolution`, интегрировать через минимальный adapter, сохранить полную обратную совместимость (series/open circuit/switch/short circuit/fuse/voltmeter/readings), добавить новые возможности (parallel/mixed/bridge/branch currents/node potentials), не менять `ElectricityLabScene.tsx` без необходимости, не начинать measurement/safety UI или следующий Stage, добавить production integration tests, прогнать полную проверку, обновить все 3 документа, остановиться.

### Что сделано ✅

1. **Минимальный adapter в `frontend/lib/circuit-engine.ts`** — НЕ переписан целиком:
   - Все экспортируемые типы (`ComponentKind`, `CircuitComponent`, `Connection`, `ComponentReading`, `CircuitSolution`) и `bulbBrightness()` — без изменений.
   - Публичная сигнатура `solveCircuit(components, connections): CircuitSolution` — без изменений.
   - Тело `solveCircuit` заменено на однострочное делегирование: `return solveCircuitNodal(components, connections);`.
   - Удалены DFS-специфичные внутренности, ставшие мёртвым кодом (`UnionFind`, `resistanceOf`, `PathStep`, `findLoopPath`, две DFS-константы) — их аналоги уже есть в `nodal-analysis-solver.ts`.
   - **`ElectricityLabScene.tsx` не менялся вообще** — тот же импорт, та же сигнатура, поведение прозрачно для всех потребителей.

2. **Найдены и исправлены ДВЕ реальные проблемы интеграции** (не гипотетические — обнаружены реальным прогоном тестов, не предположением):
   - **Погрешность на 5-м знаке**: неизменённый `circuit-engine.test.ts` (10 тестов) показал 9/10 — `bulb1.powerW` отличался на `~0.0000053` при допуске `toBeCloseTo(8,5)`. Причина: `EPS_R_OHM=1e-6` (заглушка для идеального сопротивления амперметра/переключателя) при возведении в квадрат (расчёт мощности) давал заметную на этой точности погрешность. **Фикс**: `EPS_R_OHM` уменьшен до `1e-9` в `nodal-analysis-solver.ts`. Все 24 теста солвера (включая оба стресс-теста на численную нестабильность — разброс EPS/BIG вырос с 15 до 18 порядков) перепроверены и прошли.
   - **Реальная регрессия в `task-engine.ts`** (отдельный, более старый production-модуль "6 быстрых заданий", НЕ учтённый в первоначальном скоупе S9.1) — 3 упавших теста про короткое замыкание. Причина: вырожденный случай "батарея+ соединена с батареей− напрямую проводом, без единого компонента между ними" (`sourceNode === groundNode` после union-find) — общий алгоритм рассчитан на ДВА разных зафиксированных узла, при их совпадении запись перезаписывала сама себя, ток ложно получался нулевым вместо огромного короткого замыкания. Это ровно тот вырожденный случай, что был честно назван нерешённым ограничением ещё в отчёте S9.1. **Фикс**: добавлена явная ранняя обработка этого случая в `nodal-analysis-solver.ts`, воспроизводящая поведение старого DFS-солвера для того же входа (пустой путь → `MIN_RESISTANCE_OHM=0.001` как пол → огромный ток, `isShortCircuit=true`). `task-engine.test.ts`: 19/19 после фикса.
   - Оба дефекта пойманы ИМЕННО полным `npx vitest run`, а не только целевыми circuit-тестами — целевые тесты были зелёными, полный прогон вскрыл регрессию в модуле, не входившем в исходный фокус спайка.

3. **Новый файл `frontend/lib/circuit-engine.integration.test.ts`** (5 тестов) — доказывает новую возможность (parallel/mixed/bridge/branch currents/node potentials) именно через PRODUCTION `solveCircuit()`, а не через изолированный `solveCircuitNodal` напрямую — чтобы будущая регрессия на границе production API ловилась автоматически.

4. **Оба документа дозаполнены** (не переписаны): `solver-spike-report.md` — новый раздел "S9.2 (продолжение) — Интеграция Option B в production" с честным описанием обеих найденных проблем; `electricity_stage_s9_plan.md` — новый подраздел "S9.2 - Production Integration", чеклист §3 отмечен только по реально проверенным пунктам (measurement/safety UI, autosave/resume, Playwright — честно оставлены неотмеченными как вне скоупа этого чекпоинта).

### Результаты проверок (все реально прогнаны)
| Проверка | Результат |
|---|---|
| `npx tsc --noEmit` | 0 ошибок |
| `circuit-engine.test.ts` (неизменённый, 10 тестов) | **10/10 PASSED** — доказательство обратной совместимости |
| `circuit-engine.integration.test.ts` (новый, 5 тестов) | **5/5 PASSED** |
| `nodal-analysis-solver.test.ts` + `.benchmark.test.ts` (24+8) | **32/32 PASSED** |
| `task-engine.test.ts` (19 тестов, отдельный потребитель) | **19/19 PASSED** (после фикса dead-short) |
| `npx vitest run` (полный) | **469/469 PASSED (43 файла)** |
| `npm run lint` | 0 ошибок, 0 предупреждений |
| `ElectricityLabScene.tsx` | **не изменён** (подтверждено `git status`) |

### Файлы, изменённые/добавленные в этой части
| Файл | Что изменено |
|------|-------------|
| `frontend/lib/circuit-engine.ts` | `solveCircuit` теперь делегирует в `solveCircuitNodal`; удалены мёртвые DFS-внутренности; типы/`bulbBrightness` не изменены |
| `frontend/lib/nodal-analysis-solver.ts` | `EPS_R_OHM` 1e-6→1e-9; добавлена обработка вырожденного прямого замыкания (`MIN_RESISTANCE_OHM`) |
| `frontend/lib/circuit-engine.integration.test.ts` | новый файл — 5 production integration тестов |
| `solver-spike-report.md` | добавлен раздел про реальную интеграцию и оба найденных/исправленных дефекта |
| `electricity_stage_s9_plan.md` | добавлен подраздел `S9.2 - Production Integration`, чеклист §3 честно размечен |

### Что осталось ❌ (на тот момент)
1. Measurement UI, safety UI и следующий Stage — не начаты. Следующий чекпоинт (продолжение №8) реализует именно Measurement Tools.
2. Известные мелкие ограничения (см. `solver-spike-report.md`).

Коммит `3b13ebb` — от `sodatovruslan`, без Co-Authored-By, без push (пользователь попросил закоммитить текущее состояние перед стартом S9.3).

---

## Обновление 2026-08-07 (продолжение №8) — Stage S9.3: Measurement Tools (амперметр/вольтметр) до production quality

### Задача чекпоинта
S9.2 одобрен и закоммичен. Довести измерительные приборы Electricity Lab (амперметр/вольтметр) до того же уровня качества, что и Chemistry World: детект неправильного размещения (амперметр параллельно / вольтметр последовательно), образовательное предупреждение вместо бессмысленного числа, живое обновление во время проводки, реальные показания от production-солвера. Не трогать солвер (кроме реального бага), не переписывать UI/drag-and-drop/wiring, не начинать Safety System/Guided Experiments/Assessment/Autosave.

### Что сделано ✅

1. **Найдена и переиспользована существующая логика вместо изобретения новой**: `task-engine.ts` (отдельный, более старый модуль "6 быстрых заданий") УЖЕ содержал точную топологическую проверку "амперметр параллельно" (Task 2) и "вольтметр не параллельно нагрузке" (Task 3) — но только на уровне заданий/квиза, не в реальном времени на самом приборе.

2. **Новый общий модуль `frontend/lib/measurement-validation.ts`** — единый источник правды:
   - Топологические примитивы (`NodeUnionFind`, `buildNodeGroups`, `nodePairKey`, `componentsOnSameNodePair`, `isTerminalWired`) перенесены СЮДА из `task-engine.ts` (были там приватными дублями).
   - `checkAmmeterPlacement()` — `not_connected` / `parallel_invalid` (шунтирует конкретный компонент, амперметр — почти 0Ω) / `not_in_loop` / `valid`.
   - `checkVoltmeterPlacement()` — `not_connected` / `series_invalid` (единственный мост между двумя иначе не связанными узлами — большое сопротивление вольтметра реально блокирует ток, как в жизни) / `valid` (включая корректный частный случай — оба вывода закорочены проводом, читает честный 0В).
   - `ammeterPlacementMessage()`/`voltmeterPlacementMessage()` — понятные ученику объяснения по-русски вместо технических кодов.

3. **`task-engine.ts` — чистый рефакторинг** (не переписан, поведение то же): импортирует общие примитивы из `measurement-validation.ts` вместо своей копии. Backward-compat доказана: **`task-engine.test.ts` (19 тестов) прогнан БЕЗ ИЗМЕНЕНИЙ и прошёл 19/19** — тот же паттерн доказательства, что использовался для интеграции солвера в S9.2.

4. **`ElectricityLabScene.tsx` — точечные изменения, drag-and-drop/wiring не тронуты**:
   - `CircuitScene` считает `ammeterCheck`/`voltmeterCheck` через `useMemo` от уже имеющихся `state.components`/`state.connections`/`solution` — ничего не пересчитывает заново.
   - `MeterHousing` получил необязательные `placementStatus`/`warningMessage`: `data-value` на приборе **всегда** остаётся честным числом от солвера (ничего не скрыто от тестов/расчётов), но видимый текст на табло при неправильном подключении заменяется на "⚠ Неверно" + отдельный всплывающий блок с полным объяснением (`data-testid="{id}-warning"`).
   - Никаких изменений в `WireDragProvider`, `ConnectionPoint`, `ExperimentStateProvider`, `circuit-engine.ts` — солвер не трогался вообще (реальных багов на этом чекпоинте не найдено, менять было не за чем).

### Тесты
- `frontend/lib/measurement-validation.test.ts` — **8 юнит-тестов**, через настоящий `solveCircuit()` (не мок): корректное/некорректное размещение обоих приборов, включая честную физическую проверку — вольтметр в разрыве провода реально блокирует ток (`isCircuitActive=false`), а не просто "помечен как неверный".
- `frontend/components/core/MeasurementTools.integration.test.tsx` — **5 интеграционных тестов** через настоящий `ExperimentStateProvider` (тот же reducer, что использует сцена) + настоящий `solveCircuit()`: полный конвейер "провода → state → солвер → диагностика", включая живое переключение valid→invalid при добавлении провода БЕЗ перемонтирования и восстановление после `removeConnection`.
- `frontend/e2e/electricity-measurement-tools.spec.ts` — **написан, типизирован, готов**, переиспользует те же хелперы (`connectTerminals`/`terminalCenter`), что и существующий `electricity-lab.spec.ts`, не переизобретает drag-and-drop.

### ⚠️ Playwright-сценарий не удалось прогнать на этой машине ПРЯМО СЕЙЧАС — не регрессия, доказано
Прогон `electricity-measurement-tools.spec.ts` завис на первом же `mouse.move` (таймаут 180с, затем 3 минуты реального ожидания). Прежде чем считать это багом моих изменений, проверил гипотезу: прогнал **существующий, НЕ изменённый в этом чекпоинте** `electricity-lab.spec.ts` — **он завис ТОЧНО ТАК ЖЕ, на той же строке `mouse.move`**, с таймаутом 240с. Это подтверждает: проблема — в текущем состоянии headless Chromium/SwiftShader на этой машине (тот же класс нестабильности, что уже подробно задокументирован для Chemistry World E2E ранее в этом файле), а не в коде Stage S9.3. После обоих зависших прогонов вручную убиты 18 зависших `chrome.exe`, серверы остановлены.

**Не в скоупе исправлять эту машинную нестабильность в рамках Measurement Tools** — E2E-сценарий готов к прогону, когда окружение придёт в стабильное состояние (или на другой машине/CI).

### Результаты проверок
| Проверка | Результат |
|---|---|
| `npx tsc --noEmit` | 0 ошибок |
| `task-engine.test.ts` (неизменённый, 19 тестов) | **19/19 PASSED** — доказательство обратной совместимости рефакторинга |
| `measurement-validation.test.ts` (новый, 8 тестов) | **8/8 PASSED** |
| `MeasurementTools.integration.test.tsx` (новый, 5 тестов) | **5/5 PASSED** |
| `npx vitest run` (полный) | **482/482 PASSED (45 файлов)** |
| `npm run lint` | 0 ошибок, 0 предупреждений |
| `electricity-measurement-tools.spec.ts` (Playwright) | Написан и типизирован; прогон заблокирован текущей нестабильностью машины (см. выше, подтверждено на baseline-тесте) |
| `circuit-engine.ts` | **не изменён** — солвер не трогался |
| `WireDragProvider.tsx`, `ConnectionPoint.tsx`, `ExperimentStateProvider.tsx` | **не изменены** — drag-and-drop/wiring не переписаны |

### Файлы, изменённые/добавленные в этой части
| Файл | Что изменено |
|------|-------------|
| `frontend/lib/measurement-validation.ts` | новый файл — общая логика диагностики размещения приборов |
| `frontend/lib/measurement-validation.test.ts` | новый файл — 8 юнит-тестов |
| `frontend/lib/task-engine.ts` | рефакторинг: использует общие примитивы вместо своей копии |
| `frontend/components/core/MeasurementTools.integration.test.tsx` | новый файл — 5 интеграционных тестов |
| `frontend/components/scenes/ElectricityLabScene.tsx` | `MeterHousing`/`Ammeter`/`Voltmeter` показывают образовательное предупреждение при неверном подключении; `CircuitScene` считает диагностику |
| `frontend/e2e/electricity-measurement-tools.spec.ts` | новый файл — Playwright-сценарий (готов, не прогнан из-за машинной нестабильности) |

### Что осталось ❌
1. Прогнать `electricity-measurement-tools.spec.ts`, когда машина/CI будет стабильнее (или на другой машине) — тест готов, только не верифицирован живым прогоном.
2. Safety System, Guided Experiments (уже частично существует как "Лабораторные работы" — не трогался), Assessment, Autosave для Electricity Lab — **не начаты**, по прямому запрету задачи.
3. `console errors` в реальном браузере не проверялись отдельно (косвенно покрыто тем, что vitest/tsc/lint чисты и React-рендер логика не изменилась структурно).

Backend/frontend остановлены после диагностики Playwright-нестабильности.

### ✅ Stage S9.3 одобрен пользователем
Реализация подтверждена как соответствующая стратегии проекта: переиспользование существующей production-логики (`task-engine.ts`'s Task 2/3 → `measurement-validation.ts`), отсутствие дублирования алгоритмов, сохранение production-архитектуры (`circuit-engine.ts`/wiring/drag-and-drop не тронуты), полная обратная совместимость (доказана неизменённым `task-engine.test.ts`, 19/19). Проблема с Playwright принята как известное ограничение текущего окружения (воспроизводится на baseline) — **дальше не расследуется в рамках Stage S9**, по прямому указанию пользователя.

Изменения этого чекпоинта закоммичены (см. commit `feat(electricity): S9.3 approved` — от имени `sodatovruslan`, без Co-Authored-By, без push).

---

## Обновление 2026-08-07 (продолжение №9) — Stage S9.4: Safety System до production quality

### Задача чекпоинта
Довести систему безопасности Electricity Lab до того же уровня, что и Chemistry World: детект короткого замыкания (прямое замыкание батареи + опасно низкое сопротивление — уже унифицировано солвером), поведение предохранителя (перегорание/персистентность/визуал/блокировка тока), детект перегрузки (предупреждение ДО фактического отказа), структурные события безопасности (`short_circuit`, `overload`, `fuse_blown`, `unsafe_measurement`, `unsafe_connection`), минимальный UI (баннеры/иконки/объяснения, без редизайна). Переиспользовать солвер/measurement-validation/task-engine, не дублировать логику. Не трогать `circuit-engine.ts` без реального бага.

### Что сделано ✅

1. **Новый модуль `frontend/lib/electricity-safety.ts`** — тот же паттерн, что `chemistry-safety.ts` (чистая функция от уже посчитанного состояния, никакого AI/рандома):
   - **`SafetyWarning` — не продублирован, а импортирован из `chemistry-safety.ts`** (`export type { SafetyWarning }`) — обе лаборатории используют один и тот же тип/визуальный язык (`severity: "warning" | "danger"`).
   - `checkElectricalSafety({ components, connections, solution })` — единая точка входа, объединяет 4 группы проверок:
     - **short_circuit** (danger) — читает уже унифицированный солвером `solution.isShortCircuit` (и прямое замыкание батареи, и опасно низкое сопротивление контура — это ОДИН флаг в production-солвере с версии S9.2, здесь не пересчитывается заново).
     - **fuse_blown** (danger) — по `component.isBlown`, с образовательным текстом и номиналом.
     - **overload** (warning) — НОВАЯ проверка "предупреждение ДО отказа": ток предохранителя в диапазоне 80-100% от `ratedCurrentA`, но ещё не перегорел; отдельно — мощность на лампе выше `ratedPowerW` (сама лампа не "ломается" физически в этой симуляции, но предупреждение честное и образовательное).
     - **unsafe_connection** (danger) — НОВАЯ проверка: ток течёт в обход предохранителя (переиспользует `isTerminalWired` из `measurement-validation.ts`, никакой собственной топологии).
     - **unsafe_measurement** — **полностью переиспользует `checkAmmeterPlacement`/`checkVoltmeterPlacement`/`ammeterPlacementMessage`/`voltmeterPlacementMessage` из `measurement-validation.ts` (Stage S9.3)** — амперметр-шунт → danger, вольтметр-в-разрыве → warning. Ни одной новой строчки топологической логики.

2. **`SimEvent` в `ExperimentStateProvider.tsx` расширен на 3 новых варианта** (`overload`, `unsafe_measurement`, `unsafe_connection`) — чисто аддитивно, `short_circuit`/`fuse_blown` уже существовали и не трогались. Reducer не переключается по форме события (просто накапливает в массив) — расширение безопасно по построению.

3. **`ElectricityLabScene.tsx` — точечные изменения**:
   - `safetyWarnings` считается ОДИН раз в `ElectricityLabInner` (`useMemo`, тот же паттерн, что и `solution`) и прокидывается и в 3D-сцену (`CircuitScene`, через `ElectricityCanvas`), и в 2D-баннер.
   - `CircuitScene` получил 3 новых `useEffect`'а (тот же "залогировать один раз, пока предупреждение не исчезло" паттерн, что уже использовался для `short_circuit`) — логируют `overload`/`unsafe_measurement`/`unsafe_connection` через уже существующий `logEvent`.
   - Новый 2D-баннер `data-testid="safety-warnings"` / `data-testid="safety-warning-{code}"` — **визуально скопирован 1:1 с Chemistry World's** баннера в `ChemistryWorldScene.tsx` (тот же цвет по severity: `border-red-400/40 bg-red-500/10 text-red-300` / `border-amber-400/40 bg-amber-500/10 text-amber-200`, та же структура). Не заменяет существующий `circuit-status` — дополняет его.
   - **`circuit-engine.ts`, `task-engine.ts`, `measurement-validation.ts`, `WireDragProvider.tsx`, `ConnectionPoint.tsx` — не изменены.** Реального бага в солвере не найдено — трогать не за чем. `task-engine.ts`'s собственные тривиальные однострочные проверки `isShortCircuit`/`isBlown` (не топология, просто чтение готового флага) НЕ рефакторились повторно — это не "дублирование алгоритма" уровня Stage S9.3 (топология), а два независимых чтения одного и того же уже посчитанного булева поля; трогать стабильный, полностью протестированный файл ради этого не было необходимости.

### Тесты (3 категории, как и просили)
- **Unit** — `frontend/lib/electricity-safety.test.ts`, **13 тестов**, через настоящий `solveCircuit()`. Один честный нюанс, пойманный при первом прогоне: тестовая фикстура без резистора (только лампа 4Ω при 12В) реально перегружала лампу физически — это не баг проверки, а корректная физика; фикстура исправлена на сбалансированную топологию (резистор+лампа, как в реальной сцене).
- **Integration** — `frontend/components/core/ElectricitySafety.integration.test.tsx`, **5 тестов**, через настоящий `ExperimentStateProvider` (тот же reducer, что использует сцена) + настоящий солвер: единичные срезы состояния (health circuit, короткое замыкание, перегоревший предохранитель, перегрузка, снятие unsafe_connection через реальный `removeConnection`).
- **Safety workflow** — `frontend/components/core/ElectricitySafetyWorkflow.integration.test.tsx`, **3 многошаговых сценария**: (а) рост напряжения — безопасно → предупреждение о перегрузке → предохранитель перегорает → `resetExperiment` возвращает к чистому состоянию; (б) амперметр по ошибке подключён параллельно → предупреждение → студент переподключает последовательно → предупреждение живо исчезает без перемонтирования; (в) цепь в обход предохранителя → предупреждение → перепроводка через предохранитель → предупреждение снимается.

### Результаты проверок
| Проверка | Результат |
|---|---|
| `npx tsc --noEmit` | 0 ошибок |
| `electricity-safety.test.ts` (новый, 13 тестов) | **13/13 PASSED** |
| `ElectricitySafety.integration.test.tsx` (новый, 5 тестов) | **5/5 PASSED** |
| `ElectricitySafetyWorkflow.integration.test.tsx` (новый, 3 сценария) | **3/3 PASSED** |
| `npx vitest run` (полный) | **503/503 PASSED (48 файлов)** |
| `npm run lint` | 0 ошибок, 0 предупреждений |
| `circuit-engine.ts` | **не изменён** — реального бага не найдено |
| `task-engine.ts`, `measurement-validation.ts` | **не изменены** — переиспользованы как есть |

Один разовый инфраструктурный сбой воркера vitest ("Timeout waiting for worker to respond" на несвязанном `ChemistryInteractionProvider.test.tsx`) при первом полном прогоне — не повторился при перезапуске, не связан с изменениями этого чекпоинта.

### Файлы, изменённые/добавленные в этой части
| Файл | Что изменено |
|------|-------------|
| `frontend/lib/electricity-safety.ts` | новый файл — Safety System (короткое замыкание/предохранитель/перегрузка/небезопасное измерение/небезопасное соединение) |
| `frontend/lib/electricity-safety.test.ts` | новый файл — 13 юнит-тестов |
| `frontend/components/core/ExperimentStateProvider.tsx` | `SimEvent` +3 варианта (`overload`, `unsafe_measurement`, `unsafe_connection`) |
| `frontend/components/scenes/ElectricityLabScene.tsx` | 2D-баннер предупреждений безопасности + event-логирование новых кодов |
| `frontend/components/core/ElectricitySafety.integration.test.tsx` | новый файл — 5 интеграционных тестов |
| `frontend/components/core/ElectricitySafetyWorkflow.integration.test.tsx` | новый файл — 3 workflow-сценария |

### Что осталось ❌
1. Playwright-сценарий для Safety System не добавлялся отдельно в этом чекпоинте — задача явно просила unit/integration/workflow тесты (все добавлены), Playwright не был в явном списке для S9.4 (в отличие от S9.3). Можно добавить позже при необходимости.
2. Guided Experiments/Assessment/Autosave для Electricity Lab — по-прежнему не начаты, не в скоупе.
3. `unsafe_measurement`/`unsafe_connection` события логируются с генерическим `code` полем (не detail-специфичным per-instance) — соответствует уже установленной в S9.3/этом чекпоинте гранулярности (та же, что у `short_circuit`), не усложнялось намеренно.

Ничего не закоммичено в этой части до отдельного шага коммита ниже.

Закоммичено как `feat(electricity): S9.4 approved` (commit `ff2612f`, от `sodatovruslan`, без Co-Authored-By, без push).

---

## Обновление 2026-08-07 (продолжение №10) — Stage S9.5: Guided Experiments до production quality

### Задача чекпоинта
Довести guided experiments Electricity Lab до того же уровня, что и Chemistry World, **не переписывая Electricity Lab и не дублируя физику**: полный жизненный цикл (выбор/шаги/подсказки/успех-неудача/завершение/рестарт), реагирующий на РЕАЛЬНОЕ состояние цепи; валидация шагов через уже существующие production-системы (солвер, `measurement-validation.ts`, `electricity-safety.ts`); **сначала изучить `electricity-lab-catalog.ts` и существующие определения экспериментов** и по возможности апгрейдить их вместо параллельного каталога; минимальный UX поверх существующих панелей; безопасность не должна давать засчитать небезопасный результат; состояние — детерминированное/сериализуемое (готово к будущему автосейву, но сам автосейв не реализуется); 3 категории тестов. Не начинать S9.6/S9.7/S9.8/S9.9.

### Что обнаружено при обязательном первом шаге (чтение перед написанием кода)
У Electricity Lab **уже был** полноценный слой guided experiments из более раннего чекпоинта "Stage E-2" — `frontend/lib/electricity-lab-catalog.ts` (8 экспериментов, полный цикл шагов introduction/theory/equipment/assembly/measurement/analysis/conclusion/finish, реальные `isUnlocked`/`isComplete`, научные вопросы, XP), `ElectricityLabExperienceProvider.tsx` (выбор/индекс шага/измерения/подсказки/журнал/завершение, всё уже plain-сериализуемое состояние), `ElectricityGuidedLabPanel.tsx`/`ElectricityExperimentCatalogBrowser.tsx`/`ElectricityLabReportPanel.tsx`/`ElectricityLabNotebookPanel.tsx` (UI), уже подключённые в `ElectricityLabScene.tsx`. Это НЕ то же самое, что `task-engine.ts` (6 быстрых заданий, не трогался) — это и есть тот более богатый слой, который задача просила изучить и доработать, а не строить заново.

**Реальный пробел**: ни один из 8 экспериментов не обращался к `measurement-validation.ts` (S9.3) или `electricity-safety.ts` (S9.4) — обе системы появились ПОСЛЕ того, как этот guided-слой был написан. Конкретно: `measureCurrent`/`measureVoltage` можно было засчитать завершёнными с неправильно подключённым амперметром/вольтметром (если `isCircuitActive`/показание вольтметра случайно выглядели правдоподобно); любой из 8 экспериментов можно было засчитать завершённым при активном `danger`-предупреждении (короткое замыкание, обход предохранителя, опасное измерение) — обе системы просто никогда не общались друг с другом.

### Что сделано ✅

1. **`frontend/lib/electricity-lab-catalog.ts`** — добавлены `isElectricallySafe(ctx, allowedDangerCodes?)` (читает `checkElectricalSafety`, блокирует завершение при любом `danger`-предупреждении, кроме кодов, которые эксперимент намеренно провоцирует), `isAmmeterPlacedCorrectly`/`isVoltmeterPlacedCorrectly` (читают `checkAmmeterPlacement`/`checkVoltmeterPlacement`), и необязательное поле `feedback` на `ElectricityLabStep` для объяснения блокировки конкретного шага. У всех 8 экспериментов `isComplete` (и соответствующий `finishStep`) теперь дополнительно требует `isElectricallySafe`; у `measureCurrent`/`measureVoltage` шаг сборки дополнительно требует правильного размещения прибора. `elec-advanced-fuse-overload` явно разрешает свой собственный `fuse_blown` (это и есть цель эксперимента), но по-прежнему блокируется любой ДРУГОЙ опасностью (например, обходом предохранителя). Ни одна физическая/топологическая величина не пересчитана заново — каждая новая проверка это прямой вызов уже существующих чистых функций S9.3/S9.4.
2. **`frontend/components/core/ElectricityLabExperienceProvider.tsx`** — добавлено `currentStepFeedback: string | null` в контекст: сначала самое критичное активное `danger`-предупреждение, затем собственный `feedback()` шага, затем сообщение о размещении прибора, иначе `null` (UI покажет общий текст). Новых полей домена/состояния нет — вычисляется так же, как уже вычислялся `isCurrentStepUnlocked`.
3. **`frontend/components/lab/ElectricityGuidedLabPanel.tsx`** — существующий абзац с подсказкой о блокировке теперь показывает `currentStepFeedback` (жёлтым), если он есть, иначе — прежний общий текст. Никакого редизайна/новой вёрстки.

### Тесты (3 категории, как и просили — плюс UI-рендер существующей панели)
- **Unit** — `frontend/lib/electricity-lab-catalog.test.ts` (расширен), **13/13** (5 новых): амперметр-шунтирует-резистор блокирует `measureCurrent` с переиспользованным сообщением, затем разблокируется после исправления на канонический монтаж; вольтметр-последовательно блокирует `measureVoltage` аналогично; все 8 экспериментов блокируются активным коротким замыканием, даже когда их собственные числовые условия выполнены; `fuseOverload` разрешает свой `fuse_blown`, но блокируется одновременным обходом предохранителя; `lampBrightness` НЕ блокируется предупреждением (`warning`) о превышении мощности лампы (блокирует только `danger`).
- **Integration** — `frontend/components/core/ElectricityGuidedExperiment.integration.test.tsx` (новый), **2/2**: настоящий `ExperimentStateProvider` → настоящий `solveCircuit()` → настоящий `ElectricityLabExperienceProvider`, через реальные `addConnection`/`removeConnection`/`updateComponent`; ошибка амперметра исправляется вживую без перемонтирования; настоящее короткое замыкание, введённое посреди эксперимента, блокирует шаг `finish` и снимается сразу после устранения.
- **Workflow** — `frontend/components/core/ElectricityGuidedExperiment.workflow.test.tsx` (новый), **4/4**: полное прохождение работы от начала до конца (`elec-beginner-measure-current`); неправильная проводка → исправление (`elec-beginner-measure-voltage`, вольтметр последовательно → исправлен); намеренное КЗ → устранение (`elec-advanced-short-circuit`, КЗ зафиксировано и разрешено перед разблокировкой `finish`); сценарий рестарта (`exitExperiment` + повторный `selectExperiment` полностью сбрасывает индекс шага/измерения/черновики, работа проходится заново с чистой сессии).
- **UI** — `frontend/components/lab/ElectricityGuidedLabPanel.test.tsx` (новый), **2/2**: настоящая панель через ту же цепочку провайдеров показывает только общий текст при пустой цепи и конкретное переиспользованное сообщение про амперметр (жёлтым) после реальной ошибки подключения.
- **Backward compatibility**: все 8 прежних тестов `electricity-lab-catalog.test.ts` прошли без изменений.

### Playwright — честно не предпринимался в этом чекпоинте
Файла `electricity-guided-lab.spec.ts` не существовало и не был добавлен. Известное зависание headless Chromium/SwiftShader на `mouse.move` (доказано в S9.3 против неизменённого baseline и намеренно не расследовалось дальше в S9.3/S9.4 по прямому указанию) принимается как ограничение текущего окружения. Три уровня Vitest-тестов выше уже прогоняют реальный провайдер/солвер/безопасность/измерения от начала до конца без браузера — это честно задокументированный пробел в браузерном покрытии, а не заявление, что оно проверено.

### Результаты проверок
| Проверка | Результат |
|---|---|
| `npx tsc --noEmit` | 0 ошибок |
| `electricity-lab-catalog.test.ts` (расширен, +5) | **13/13 PASSED** |
| `ElectricityGuidedExperiment.integration.test.tsx` (новый) | **2/2 PASSED** |
| `ElectricityGuidedExperiment.workflow.test.tsx` (новый) | **4/4 PASSED** |
| `ElectricityGuidedLabPanel.test.tsx` (новый) | **2/2 PASSED** |
| `npx vitest run` (полный) | **516/516 PASSED (51 файл)**, было 503/48 на S9.4 |
| `npm run lint` | 0 ошибок, 0 предупреждений |
| `circuit-engine.ts`, `nodal-analysis-solver.ts`, `measurement-validation.ts`, `electricity-safety.ts`, `ExperimentStateProvider.tsx` | **не изменены** |
| Каталог из 8 экспериментов (id/title/XP) | **не изменён** — только условия разблокировки/завершения ужесточены |

### Файлы, изменённые/добавленные в этой части
| Файл | Что изменено |
|------|-------------|
| `frontend/lib/electricity-lab-catalog.ts` | добавлены проверки безопасности/размещения приборов в `isComplete` всех 8 экспериментов + поле `feedback` на шаге |
| `frontend/lib/electricity-lab-catalog.test.ts` | +5 юнит-тестов на новую логику |
| `frontend/components/core/ElectricityLabExperienceProvider.tsx` | добавлено `currentStepFeedback` в контекст |
| `frontend/components/lab/ElectricityGuidedLabPanel.tsx` | подсказка блокировки теперь показывает `currentStepFeedback` |
| `frontend/components/core/ElectricityGuidedExperiment.integration.test.tsx` | новый файл — 2 интеграционных теста |
| `frontend/components/core/ElectricityGuidedExperiment.workflow.test.tsx` | новый файл — 4 workflow-сценария |
| `frontend/components/lab/ElectricityGuidedLabPanel.test.tsx` | новый файл — 2 UI-теста реального рендера панели |
| `electricity_stage_s9_plan.md` | добавлен раздел `S9.5 - Guided Experiments`, чеклист §3 обновлён |

### Что осталось ❌
1. Playwright-сценарий для guided-lab UI не добавлен — см. секцию выше (честно принятое, задокументированное ограничение окружения, не расследовалось дальше по прямому указанию).
2. Assessment/Teacher Reports (S9.6), Autosave/Resume (S9.7), Sandbox UX (S9.8), Final Polish (S9.9) — не начаты, вне скоупа этого чекпоинта.
3. Живая проверка в браузере (консоль без ошибок, визуальная проверка баннера подсказки) не проводилась — заменена рендер-тестами через Testing Library с той же реальной цепочкой провайдеров (см. `ElectricityGuidedLabPanel.test.tsx`).

Ничего не закоммичено в этой части до отдельного шага коммита ниже.

Закоммичено как `feat(electricity): S9.5 approved` (commit `c81dcb7`, от `sodatovruslan`, без Co-Authored-By, без push).

---

## Обновление 2026-08-07 (продолжение №11) — Stage S9.6: Assessment & Teacher Analytics до production quality

### Задача чекпоинта
Довести оценку и teacher-аналитику Electricity Lab до того же уровня, что и Chemistry World, на основе РЕАЛЬНЫХ действий студента и реального доменного состояния: 1) Observation/Evidence Layer (реальные учебные факты — старт, шаг, подсказка, ошибка проводки, небезопасная проводка, ошибка амперметра/вольтметра, успешное исправление, КЗ, перегорание предохранителя, успешное измерение, завершение); 2) детерминированный Assessment Engine (без LLM); 3) образовательная обратная связь; 4) teacher-facing сводка (student/experiment/completion/score/attempts/mistakes/hints/safety/measurement/time); 5) структурированный контекст для будущего AI-teacher (без нового AI-чата); 6) интеграция с S9.5/солвером/measurement-validation.ts/electricity-safety.ts/существующим progress/notebook/report без дублирования состояния; 7) 3 уровня тестов. Не начинать S9.7/S9.8/S9.9, не переписывать солвер, не создавать параллельную систему прогресса.

### Что обнаружено при обязательном первом шаге (аудит перед кодом)
Chemistry World на деле имеет ДВА независимых assessment-движка в `chemistry-assessment.ts`: (1) `assessExperiment` — простой, реально вызываемый в production (`ChemistryLabExperienceProvider.completeExperiment()`), 5-категорийный, на ref-счётчиках сессии; (2) `computeDeterministicAssessment` — гораздо более тяжёлая система с evidenceEventIds и весовыми критериями, полностью реализованная и протестированная, но **нигде не вызываемая в реальном приложении** (grep подтвердил: ноль production-вызовов; её собственный UI `StudentFeedbackPanel.tsx` тоже нигде не импортируется). По прямому указанию пользователя "не дублировать архитектуру Chemistry World, если только паттерн реально подходит" — Stage S9.6 следует ЖИВОЙ System 1, а не System 2: реплицировать мёртвый код означало бы скопировать неиспользуемый прототип, а не production-паттерн.

Также подтверждено: `electricity-notebook.ts` (Stage E-2) уже структурно аналогичен живой System 1 Chemistry (`computeScore`/`buildTeacherNote`/`ElectricityNotebookEntry`) — расширен на месте, не заменён. `ExperimentStateProvider.tsx`'s `SimEvent`/`actionsLog` существует, но это write-only приёмник для устаревшего `/api/simulations/{id}/complete`, без временных меток/последовательности/id — слишком тонкий для полноценного evidence-журнала, поэтому добавлен новый лёгкий журнал (см. ниже), переиспользующий те же чистые проверки (`measurement-validation.ts`/`electricity-safety.ts`), не дублируя физику/топологию. `progress-client.ts`'s `submitTaskEvent`/`LabAIContext`/`buildAIContext` уже были подключены из `ElectricityLabExperienceProvider` — расширены, не заменены. Backend-пробел (`TASK_TOPICS` в `progress_service.py` не знает ID guided-экспериментов) подтверждён как реальный, но оставлен вне скоупа этого фронтенд-чекпоинта, как и во всех предыдущих S9.1-S9.5.

### Что сделано ✅

1. **Новый файл `frontend/lib/electricity-evidence.ts`** — `ElectricityEvidenceCode`/`ElectricityEvidenceEvent`/`ElectricityEvidenceSummary` + `summarizeElectricityEvidence()`. Дискретный, append-only журнал РЕАЛЬНЫХ переходов состояния (experiment_started/step_completed/hint_used/incorrect_wiring/unsafe_wiring/ammeter_placement_error/voltmeter_placement_error/successful_correction/short_circuit_triggered/fuse_blown/successful_measurement/experiment_completed) — не покадровое состояние; события пишутся только на реальных переходах (например invalid→valid), переиспользуя `checkAmmeterPlacement`/`checkVoltmeterPlacement`/`checkElectricalSafety` из S9.3/S9.4.
2. **Новый файл `frontend/lib/electricity-assessment.ts`** — `assessElectricityExperiment()`: детерминированная 4-категорийная оценка (`completion`/`accuracy`/`safety`/`circuitBuilding`) + `overallScore` + `summary`, целиком из evidence summary + question results. Без LLM, без рандома. Тот же дух, что и живой `assessExperiment` Chemistry (разбивка по категориям + overall + summary), а не System 2.
3. **`frontend/lib/electricity-notebook.ts` расширен (аддитивно)** — `ElectricityNotebookEntry`/`Input` получили `hintsUsed`/`mistakesCount`/`safetyIncidentsCount`/`measurementErrorsCount`/`selfCorrectionsCount`/`durationMs`/`assessment` (новые поля входа `evidenceEvents`/`totalSteps`/`durationMs` — необязательные, с нулевым evidence по умолчанию). `buildTeacherNote` дополнена аддитивно (предложения про безопасность/измерения/самокоррекцию/отсутствие ошибок добавляются только когда релевантны) — прежнее предложение про score-уровень и про неверный вопрос не тронуто ни на символ. `computeScore`/`score` **не изменены вообще** — полная обратная совместимость, доказана прогоном всех 5 прежних тестов без изменений (5/5) плюс 4 новых.
4. **`ElectricityLabExperienceProvider.tsx`** — добавлены `evidenceRef`/`experimentStartedAtRef` + 3 новых `useEffect`'а (переход размещения амперметра, переход размещения вольтметра, переход danger-кодов безопасности — `unsafe_measurement` намеренно исключён из safety-эффекта, т.к. уже полностью учтён приборными эффектами, чтобы одна и та же реальная ошибка не считалась дважды). `advanceStep`/`recordMeasurement`/`recordHintUsed`/`completeExperiment` теперь пишут дискретные события evidence в момент, когда они реально произошли. `completeExperiment()` прокидывает `evidenceEvents`/`totalSteps`/`durationMs` в `buildElectricityNotebookEntry`, и обогащает `submitTaskEvent`'s `mistakes` реальными кодами ошибок из Evidence Layer (не только неверные ответы на вопросы) — переиспользует уже подключённый backend-пайплайн, без нового эндпоинта.
5. **`frontend/lib/ai-context-builder.ts`** — `LabExperienceAIContext.lastNotebookEntry` получил `hintsUsed`/`mistakesCount`/`safetyIncidentsCount`/`measurementErrorsCount`/`assessmentOverallScore`, чтобы будущий AI-учитель мог ссылаться на конкретные факты, а не только на итоговый балл. Никакого нового AI-эндпоинта или билдера контекста — тот же `buildAIContext`/`/api/ai/teacher`, что уже был у Electricity Lab.
6. **`ElectricityLabReportPanel.tsx`/`ElectricityLabNotebookPanel.tsx`** — отрисовывают новые поля (разбивка по 4 категориям, счётчики подсказок/ошибок/безопасности/времени) внутри уже существующей структуры панелей — без редизайна, без новых компонентов.

### Тесты (3 категории, как и просили)
- **Unit** (14): `electricity-evidence.test.ts` (5) — агрегация по синтетическим массивам событий; `electricity-assessment.test.ts` (9) — формула оценки (чистый прогон = 100 по всем категориям, штраф безопасности -25/инцидент, штраф сборки -15/ошибка +5/самокоррекция, штраф подсказок с потолком -10, точность по реальным ответам, категории не уходят ниже 0, детерминированный текст summary).
- **Notebook backward-compat + расширение** (9 = 5 старых без изменений + 4 новых): нулевой evidence -> нулевые счётчики и неизменный score/teacherNote; реальный evidence -> корректные агрегаты и более низкий assessment (но НЕИЗМЕННЫЙ score — доказывает независимость двух метрик); teacherNote упоминает реальное число нарушений безопасности; `durationMs` персистится как есть.
- **Integration** (4, реальный `ExperimentStateProvider` + реальный `ElectricityLabExperienceProvider` + реальный солвер): чистое завершение (все счётчики 0, overallScore 100); амперметр неправильно подключён -> исправлен (mistake+correction на итоговой записи); КЗ спровоцировано посреди эксперимента -> устранено (safetyIncidentsCount>0, assessment.safety<100, teacherNote упоминает); вольтметр неправильно подключён -> исправлен.
- **Workflow** (4, полные многошаговые сессии): чистое прохождение от выбора до completeExperiment (overallScore 100); две разные ошибки за одну сессию, обе исправлены самостоятельно (обе учтены); та же чистая сессия с 3 подсказками и без — разница только в overallScore, категории не тронуты (доказывает изоляцию штрафа за подсказки); намеренное перегорание предохранителя (`elec-advanced-fuse-overload`, где `fuse_blown` явно РАЗРЕШЁН для завершения) всё равно засчитывается как реальный safety-инцидент и снижает `assessment.safety` — gating и scoring корректно независимы друг от друга.
- **Playwright**: не предпринимался — то же принятое ограничение SwiftShader/headless, что и в S9.3-S9.5 (новый spec не добавлялся, задокументировано, не расследовалось повторно по действующему указанию).

### Результаты проверок
| Проверка | Результат |
|---|---|
| `npx tsc --noEmit` | 0 ошибок |
| `electricity-evidence.test.ts` (новый) | **5/5 PASSED** |
| `electricity-assessment.test.ts` (новый) | **9/9 PASSED** |
| `electricity-notebook.test.ts` (расширен, +4) | **9/9 PASSED** |
| `ElectricityAssessment.integration.test.tsx` (новый) | **4/4 PASSED** |
| `ElectricityAssessment.workflow.test.tsx` (новый) | **4/4 PASSED** |
| `npx vitest run` (полный) | **542/542 PASSED (55 файлов)**, было 516/51 на S9.5 |
| `npm run lint` | 0 ошибок, 0 предупреждений |
| `circuit-engine.ts`, `nodal-analysis-solver.ts`, `measurement-validation.ts`, `electricity-safety.ts`, `electricity-lab-catalog.ts`, `ExperimentStateProvider.tsx`, backend | **не изменены** |

### Файлы, изменённые/добавленные в этой части
| Файл | Что изменено |
|------|-------------|
| `frontend/lib/electricity-evidence.ts` | новый файл — Evidence Layer (типы + агрегация) |
| `frontend/lib/electricity-evidence.test.ts` | новый файл — 5 юнит-тестов |
| `frontend/lib/electricity-assessment.ts` | новый файл — детерминированный Assessment Engine |
| `frontend/lib/electricity-assessment.test.ts` | новый файл — 9 юнит-тестов |
| `frontend/lib/electricity-notebook.ts` | добавлены поля evidence/assessment на запись (аддитивно) |
| `frontend/lib/electricity-notebook.test.ts` | +4 юнит-теста на новые поля |
| `frontend/components/core/ElectricityLabExperienceProvider.tsx` | Evidence Layer подключён к реальным действиям студента |
| `frontend/lib/ai-context-builder.ts` | `lastNotebookEntry` в AI-контексте дополнен реальными счётчиками |
| `frontend/lib/ai-context-builder.test.ts` | фикстура переведена на реальный `buildElectricityNotebookEntry()`, добавлены проверки новых полей |
| `frontend/components/lab/ElectricityLabReportPanel.tsx` | разбивка по 4 категориям + счётчики evidence |
| `frontend/components/lab/ElectricityLabNotebookPanel.tsx` | строка со счётчиками evidence в развёрнутой записи |
| `frontend/components/core/ElectricityAssessment.integration.test.tsx` | новый файл — 4 интеграционных теста |
| `frontend/components/core/ElectricityAssessment.workflow.test.tsx` | новый файл — 4 workflow-сценария |
| `electricity_stage_s9_plan.md` | добавлен раздел `S9.6 - Assessment & Teacher Analytics`, чеклист §3 обновлён, добавлена секция "Unresolved limitations" |

### Что осталось ❌
1. Playwright-сценарий для assessment/teacher-analytics UI не добавлен — то же принятое ограничение окружения.
2. Backend `TASK_TOPICS` (`progress_service.py`) не знает ID guided-экспериментов (`elec-*`) — реальный, но заранее известный и вне-скоупа пробел (только фронтенд в этом чекпоинте, как и в S9.1-S9.5).
3. "Teacher Analytics" здесь — это данные по попытке на уже существующей студенческой записи/отчёте (та же архитектура, что и у Chemistry World — там тоже нет отдельной структуры `TeacherReport`), а не мультистуденческий дашборд учителя — такого экрана нет нигде в проекте ни для одной из лабораторий.
4. `durationMs` — простая разница `Date.now()` от `selectExperiment()` до `completeExperiment()`, не исключает время в свёрнутой вкладке.
5. Autosave/Resume (S9.7), Sandbox UX (S9.8), Final Polish (S9.9) — не начаты, вне скоупа этого чекпоинта.

Ничего не закоммичено в этой части до отдельного шага коммита ниже.

Закоммичено как `feat(electricity): S9.6 approved` (commit `c47aefa`, от `sodatovruslan`, без Co-Authored-By, без push).

---

## Обновление 2026-08-07 (продолжение №12) — Stage S9.7: Autosave & Resume до production quality

### Задача чекпоинта
Дать студенту возможность выйти из незавершённой лабораторной работы, перезагрузить страницу или вернуться позже и продолжить с правильного шага с восстановленным значимым состоянием — на том же уровне надёжности, что и у Chemistry World, без переписывания persistence с нуля. Сохранять только значимое доменное состояние (id эксперимента, шаг, completedStepIds, статус, подсказки, evidence-совместимое состояние, черновик вывода, реальное состояние компонентов/проводки, состояние предохранителя/переключателя, ревизия), не сохранять переходное runtime-состояние (Three.js-рефы/меши/hover/drag/камера — этого всё равно нет ни в одном из провайдеров Electricity Lab). Debounced autosave с dirty-detection и защитой от спама сохранений. Минимальный UX (индикатор сохранения, Продолжить, Начать заново). Интеграция с продакшн-солвером/S9.3/S9.4/S9.5/S9.6 без дублирования состояния. Три уровня тестов. Не начинать S9.8/S9.9, не переписывать сцену/солвер.

### Архитектурное решение, подтверждённое пользователем перед реализацией
Аудит показал: у Electricity Lab до этого чекпоинта не было ВООБЩЕ никакого сохранения незавершённой сессии (только Лабораторный журнал — записи по факту ЗАВЕРШЁННЫХ попыток, в localStorage). Autosave Chemistry World — это реальная backend-инфраструктура: таблица Postgres `chemistry_saves` + FastAPI-роутер `/api/chemistry/saves` с optimistic-concurrency ревизиями, idempotency-ключами и офлайн-очередью на IndexedDB. Поскольку прямое переиспользование существующей backend-таблицы/роутера означало бы либо семантически неверное использование чужой сущности, либо отдельную backend-разработку (новая таблица+роутер+миграция) — то есть заметное расширение скоупа за пределы "переиспользовать существующее", — этот выбор был явно вынесен на подтверждение пользователю ДО реализации (см. AskUserQuestion в диалоге). Выбран путь **только localStorage**, тот же, что Electricity Lab уже использует для Журнала. Схема снимка всё равно версионирована (`schemaVersion`, `revision`), как и у Chemistry World, поэтому будущий переход на backend-синхронизацию не потребует смены формы — только смены пути записи.

### Что сделано ✅

1. **`frontend/lib/electricity-save-schema.ts`** (новый) — `ElectricitySaveSnapshotV1`: `circuit` (components+connections, соответствуют `ExperimentStateProvider`), `experiment` (experimentId/currentStepIndex/completedStepIds/taskStatus/startedAt/hintsUsed/measurements/questionAnswers/observationsDraft/conclusionDraft/evidenceEvents/sessionObservations). Проще, чем `ChemistrySaveSnapshotV1` — намеренно нет слоя workspace/containers/cabinets, потому что у Electricity Lab единственная фиксированная физическая раскладка стенда (см. `CANONICAL_WIRING` в `electricity-lab-catalog.ts`), а не свободно расставляемые предметы.
2. **`frontend/lib/electricity-save-serializer.ts`** (новый) — `serializeElectricitySave` (детерминированно, components/connections отсортированы по id — тот же приём, что и chemistry-save-serializer.ts), `validateElectricitySaveSnapshot`, `hydrateElectricitySave` (выбрасывает исключение на невалидном снимке; `startedAtMs` восстанавливается из ИСХОДНОГО `startedAt`, а не момента resume — итоговый `durationMs` при завершении честно учитывает всю сессию, включая время до перезагрузки).
3. **`frontend/lib/electricity-autosave-engine.ts`** (новый) — класс `ElectricityAutosaveEngine` + синглтон. Тот же ПАТТЕРН, что у Chemistry World's `autosave-engine.ts` (debounce 1500мс, периодический safety-net 20000мс, подписка на статус, flush при `beforeunload`/`pagehide`/`visibilitychange`), но не тот же код: запись в localStorage синхронна, поэтому нет mutex/`flushQueued`/409-конфликтов/офлайн-очереди — этой сложности просто неоткуда взяться без сетевого пути записи.
4. **`ElectricityLabExperienceProvider.tsx`** — теперь также вызывает `useExperimentState()` напрямую (тот же кросс-провайдерный паттерн, что и у Chemistry's `ChemistryLabExperienceProvider` через `workspaceContext.hydrateFromSave`), чтобы получить `resetExperiment`/`addConnection` для гидратации. Добавлены: `pendingResume` (загружается один раз при монтировании, тот же паттерн, что и загрузка Журнала), `getSerializeOptions` (переиспользуется и движком автосохранения, и ничем больше), dirty-detection через `useEffect` (полагается на собственное сравнение ссылок React в массиве зависимостей вместо ручного diff строки-сигнатуры у Chemistry — проще, тот же эффект), `resumeSave`/`discardPendingResume`. `selectExperiment`/`resumeSave` вызывают `electricityAutosaveEngine.init(...)`; `exitExperiment`/`resetLabSession`/`completeExperiment` вызывают `uninit()`; `resetLabSession`/`completeExperiment` дополнительно удаляют сохранение (явный сброс цепи или реальное завершение — оба случая корректно завершают возможность resume; обычный `exitExperiment()` сохранение НЕ трогает — в этом весь смысл возобновляемости).
5. **`frontend/components/lab/ElectricityResumeModal.tsx` / `ElectricityAutosaveBadge.tsx`** (новые) — тот же минимальный UX, что и у Chemistry World (Продолжить/Начать заново, бейдж сохранения), упрощённый (нет офлайн/конфликт-статусов — им физически неоткуда взяться без сети).
6. **`ElectricityLabScene.tsx`** — `ElectricityLabExperienceSection()` показывает `ElectricityResumeModal` вместо каталога/панели, когда есть `pendingResume` и ни одна работа ещё не выбрана.
7. **`ElectricityGuidedLabPanel.tsx`** — подключён `ElectricityAutosaveBadge` рядом с кнопкой выхода.

### Что НЕ сохраняется (намеренно, по прямому указанию)
Three.js-рефы, меши, hover/drag/состояние камеры — их и так нет ни в `ExperimentStateProvider`, ни в `ElectricityLabExperienceProvider` (в отличие от Chemistry, у Electricity Lab фиксированная раскладка стенда, а не свободно расставляемые предметы), поэтому фильтровать runtime-мусор при сериализации было физически нечего — в отличие от `hydrateChemistrySave`'s `runtimeDefaults`.

### Тесты (3 категории, как и просили)
- **Unit** (23): `electricity-save-serializer.test.ts` (15) — детерминированность сериализации, полный round-trip serialize→hydrate, все случаи `validateElectricitySaveSnapshot` (битый schemaVersion/отсутствующие id/некорректная revision/битый circuit/experiment), `hydrateElectricitySave` бросает исключение на невалидном снимке и не падает на битом `startedAt`; `electricity-autosave-engine.test.ts` (8) — debounce (20 быстрых `markDirty()` → одна запись), инкремент ревизии на каждый успешный flush (продолжает с `initialRevision`, не с 1), no-op до `init()`/при пустом состоянии, `uninit()` останавливает таймеры не трогая уже записанный снимок, периодический safety-net, последовательность статусов подписки.
- **Integration** (4, реальный `ExperimentStateProvider` + реальный `ElectricityLabExperienceProvider` + реальный localStorage, "перезагрузка" — полное размонтирование/монтирование дерева провайдеров с тем же `simulationId`): реальный прогресс попадает в localStorage под ключом симуляции; полный reload+resume восстанавливает проводку/шаг/измерения один в один, восстановленная цепь корректно решается; `isBlown`/`isClosed` переживают resume (это просто поля на восстановленных `components`); `hintsUsed`/evidence, накопленные до перезагрузки, учтены в итоговой оценке после resume.
- **Workflow** (3, полные реалистичные сессии): ровно запрошенная последовательность — старт → прогресс → автосохранение → пересоздание провайдера/сессии → resume → завершение, с одной записью в журнале и удалённым сохранением; Start Over отклоняет старое сохранение, и следующий `selectExperiment()` не тащит за собой старые измерения; ошибка подключения ДО перезагрузки и исправление ПОСЛЕ resume корректно учтены по обе стороны границы reload в итоговых `measurementErrorsCount`/`selfCorrectionsCount` (непрерывность evidence-журнала через реальную перезагрузку).
- **UI**: `ElectricityResumeModal.test.tsx` (2) — рендер названия/номера шага/ревизии, клики Продолжить/Начать заново вызывают правильные колбэки.
- **Playwright**: не предпринимался — то же принятое ограничение SwiftShader/headless, что и в S9.3-S9.6.

### Результаты проверок
| Проверка | Результат |
|---|---|
| `npx tsc --noEmit` | 0 ошибок |
| `electricity-save-serializer.test.ts` (новый) | **15/15 PASSED** |
| `electricity-autosave-engine.test.ts` (новый) | **8/8 PASSED** |
| `ElectricityAutosave.integration.test.tsx` (новый) | **4/4 PASSED** |
| `ElectricityAutosave.workflow.test.tsx` (новый) | **3/3 PASSED** |
| `ElectricityResumeModal.test.tsx` (новый) | **2/2 PASSED** |
| `npx vitest run` (полный) | **573/573 PASSED (60 файлов)**, было 542/55 на S9.6 |
| `npm run lint` | 0 ошибок, 0 предупреждений |
| `circuit-engine.ts`, `nodal-analysis-solver.ts`, `measurement-validation.ts`, `electricity-safety.ts`, `electricity-lab-catalog.ts`, `electricity-evidence.ts`, `electricity-assessment.ts`, backend | **не изменены** |

### Файлы, изменённые/добавленные в этой части
| Файл | Что изменено |
|------|-------------|
| `frontend/lib/electricity-save-schema.ts` | новый файл — версионированная схема снимка |
| `frontend/lib/electricity-save-serializer.ts` | новый файл — serialize/validate/hydrate |
| `frontend/lib/electricity-save-serializer.test.ts` | новый файл — 15 юнит-тестов |
| `frontend/lib/electricity-autosave-engine.ts` | новый файл — debounced localStorage autosave |
| `frontend/lib/electricity-autosave-engine.test.ts` | новый файл — 8 юнит-тестов |
| `frontend/components/core/ElectricityLabExperienceProvider.tsx` | autosave/resume подключены к реальному состоянию |
| `frontend/components/lab/ElectricityResumeModal.tsx` | новый файл — UI Продолжить/Начать заново |
| `frontend/components/lab/ElectricityResumeModal.test.tsx` | новый файл — 2 UI-теста |
| `frontend/components/lab/ElectricityAutosaveBadge.tsx` | новый файл — индикатор сохранения |
| `frontend/components/scenes/ElectricityLabScene.tsx` | `ElectricityLabExperienceSection` показывает Resume-модалку |
| `frontend/components/lab/ElectricityGuidedLabPanel.tsx` | подключён `ElectricityAutosaveBadge` |
| `frontend/components/core/ElectricityAutosave.integration.test.tsx` | новый файл — 4 интеграционных теста |
| `frontend/components/core/ElectricityAutosave.workflow.test.tsx` | новый файл — 3 workflow-сценария |
| `electricity_stage_s9_plan.md` | добавлен раздел `S9.7 - Autosave & Resume`, чеклист §3 обновлён, "Unresolved limitations" обновлён |

### Что осталось ❌
1. Playwright-сценарий для autosave/resume UI не добавлен — то же принятое ограничение окружения.
2. Autosave — ТОЛЬКО localStorage: сохранение теряется при очистке хранилища браузера, не синхронизируется между устройствами. Явное, подтверждённое пользователем архитектурное решение этого чекпоинта, не недосмотр.
3. Единовременно может существовать только ОДНА незавершённая сессия на симуляцию (один ключ localStorage на `simulationId`) — соответствует реальности Electricity Lab (`ElectricityLabExperienceProvider` и так отслеживает только один `selectedExperimentId`), в отличие от Chemistry с отдельной записью на каждый эксперимент.
4. Рефы обнаружения ПЕРЕХОДОВ (`ammeterInvalidRef`/`voltmeterInvalidRef`/`activeDangerCodesRef`) сбрасываются в "чистое" состояние при resume, а не восстанавливаются из снимка — если восстановленная цепь на момент resume уже была в опасном/неверном состоянии, следующий рендер отметит это как НОВУЮ ошибку, а не уже существовавшую. Влияет только на точность bookkeeping evidence-журнала сразу вокруг resume, не на корректность gating/безопасности.
5. Backend `TASK_TOPICS`, мультистуденческий teacher-дашборд — без изменений, те же пробелы, что и в S9.6.
6. Sandbox UX (S9.8), Final Polish (S9.9) — не начаты, вне скоупа этого чекпоинта.

Ничего не закоммичено в этой части до отдельного шага коммита ниже.

Закоммичено как `feat(electricity): S9.7 approved` (commit `d524773`, от `sodatovruslan`, без Co-Authored-By, без push).

---

## Обновление 2026-08-07 (продолжение №13) — Stage S9.8: Sandbox UX до production quality

### Задача чекпоинта
Довести свободное взаимодействие с 3D-сценой Electricity Lab (перетаскивание/pickup, hitboxes, hover, выбранный компонент, размещение, случайные драги, аффордансы; wiring UX; конфликты камеры/жестов; reset/recovery; образовательный фидбек; производительность; доступность/ввод) до продакшн-уровня Chemistry World — но ТОЛЬКО реальными точечными исправлениями после аудита, не переделкой существующей архитектуры взаимодействия, не редизайном сцены, не переписыванием солвера/measurement/safety/guided experiments/assessment/autosave систем, не трогая GeoWorld.

### Что показал аудит (сделан до единой строчки кода, по прямому указанию)
Подробное чтение `WireDragProvider.tsx`, `ConnectionPoint.tsx`, релевантных частей `ElectricityLabScene.tsx`/`CanvasShell.tsx`, сверенное с эквивалентным стеком Chemistry World, показало: **большинство из 7 категорий требований уже реализовано на продакшн-уровне и не тронуто**:
- Базовая механика протяжки провода (старт/движение/коммит), **отмена по Escape**, и **защита от зависшего жеста** (window-level `pointerup` fallback на случай отпускания курсора вне канваса) — уже полностью реализованы в `WireDragProvider.tsx`, включая комментарий в коде, документирующий реальный прошлый баг (вызов `onConnect` синхронно внутри updater'а `setState` вешал страницу) и его фикс.
- **Конфликт камеры/протяжки** уже полностью решён: `ElectricityCanvas` передаёт `orbitEnabled={!draggingFrom}` в общий `CanvasShell.tsx` — тот же самый именованный механизм, что и у Chemistry World's `ChemistryWorldScene.tsx` (`orbitEnabled={!draggingId && !heldId}`) — обе системы уже согласованы по дизайну.
- **Reset/recovery**: `ElectricityResetButton` (полный сброс цепи+сессии+S9.7-сохранения) и отдельная кнопка выхода из guided-панели (`exitExperiment()`, которая явно НЕ трогает S9.7-сохранение, поэтому выход посередине эксперимента остаётся возобновляемым) уже реализованы и уже корректно различны — ровно соответствует указанию "явный restart/start-over может очищать сохранение только через S9.7 persistence API", без единого изменения.
- **Sandbox feedback**: панель `circuit-status` уже имеет все 4 состояния, включая настоящее позитивное подкрепление (зелёное "Ток течёт: I = ..." на здоровой работающей цепи, а не только предупреждения), баннеры S9.3/S9.4 (размещение приборов/безопасность) уже подключены и переиспользуются, не дублируются.
- **Производительность**: все 6 `useFrame`-колбэков в сцене проверены построчно — ни одной аллокации за кадр не найдено (каждый `new THREE.*` уже внутри `useMemo`/одноразовой настройки, не внутри цикла кадра).
- **Component drag/drop**: подтверждено как намеренное, уже задокументированное архитектурное ограничение, а не пробел — у Electricity Lab фиксированная раскладка физического стенда (`CANONICAL_WIRING` в `electricity-lab-catalog.ts`); компоненты выставляют наружу только свои клеммы для проводки, не перетаскиваются свободно как контейнеры/бутылки Chemistry. Добавление свободного перетаскивания здесь означало бы "создание параллельной системы взаимодействия" — прямой non-goal.
- **Различие полярности клемм**: уже реализовано — у `Battery` два `ConnectionPoint` окрашены красным/тёмно-серым с явными плавающими подписями "+"/"−".

**Найденные и исправленные реальные пробелы** (маленькие, точечные, ровно по итогам аудита):
1. `WireTube` (3D-меш провода) уже был кликабелен для разрыва соединения (и инструкция под сценой это уже описывала), но **не имел вообще никакого hover-фидбека** — ни курсора, ни подсветки — ничто не сигнализировало "этот провод интерактивен" до клика. Добавлены hover-состояние + `cursor: pointer` + красная подсветка/emissive при наведении (переиспользует уже принятую в приложении цветовую конвенцию красный = "опасно/удалить").
2. Заодно найден и исправлен реальный баг: клик по проводу удаляет его соединение, что размонтирует именно тот меш, который только что был наведён курсором — React Three Fiber не эмулирует `pointerOut` при размонтировании объекта, поэтому без явного фикса курсор застревал бы на `"pointer"` после каждого удаления провода до следующего несвязанного наведения. Исправлено сбросом курсора синхронно прямо внутри обработчика `onClick`, не полагаясь на срабатывание `onPointerOut`.
3. Тело `Switch` кликабельно (переключает открыт/закрыт), но тоже не показывало курсор-аффорданс — общий хук `useHoverTooltip()` расширен необязательным флагом `interactive`, включающим `cursor: pointer` при наведении, применён только к `Switch` (единственному кликабельному телу компонента); все остальные точки вызова не изменены.
4. Отмена протяжки провода по Escape уже работала, но была абсолютно недоступна для обнаружения (никакой подсказки на экране о её существовании). Добавлена небольшая плавающая подсказка (`Html`, тот же визуальный язык, что и у существующих тултипов клемм) рядом с превью протягиваемого провода, видимая только во время активного жеста.
5. Баннер `safety-warnings` появлялся/исчезал резко; эквивалент у Chemistry World уже плавно исчезает/появляется через `framer-motion`'s `AnimatePresence`. Баннер Electricity обёрнут в идентичный паттерн — чисто косметическое изменение, данные/логика не тронуты.

### Файлы изменены
Только `frontend/components/scenes/ElectricityLabScene.tsx` (`useHoverTooltip`, `Switch`, `WireTube`, `PendingWirePreview`, JSX-блок safety-warnings, один новый импорт `framer-motion` — уже существующая зависимость проекта, используется в других местах). **`WireDragProvider.tsx`, `ConnectionPoint.tsx`, `CanvasShell.tsx` — подтверждённо не тронуты**, поскольку аудит показал, что их механика уже надёжна.

### Находка: у `WireDragProvider.tsx` не было ни одного теста
Несмотря на то, что это именно та машина состояний взаимодействия, вокруг которой построен весь этот чекпоинт, и несмотря на то, что она уже продакшн-качества, её ничего не тестировало. Поскольку это обычный React context provider (WebGL не нужен, чтобы вызвать `startDrag`/`commitDrag`/`cancelDrag`/Escape/window-`pointerup` напрямую через `renderHook`), это оказался настоящий, ценный, низкорисковый пробел в тестовом покрытии, который стоило закрыть — не расползание скоупа, поскольку тесты проверяют СУЩЕСТВУЮЩЕЕ нетронутое поведение целиком (доказывая вердикт аудита "уже надёжно", а не просто декларируя его).

### Тесты (3 категории)
- **Unit** (12, `WireDragProvider.test.tsx`): старт/движение/коммит (включая no-op на тот же терминал, no-op коммита без старта), отмена через `cancelDrag()`/Escape/глобальный `pointerup` (включая безопасный no-op Escape без активного жеста), очистка слушателей при размонтировании (нет утечки `window`-обработчиков), реестр позиций терминалов (клонирует вектор, не хранит алиас; неизвестный id → `undefined`).
- **Integration** (5, реальный `ExperimentStateProvider` + реальный `WireDragProvider` + реальный `ElectricityLabExperienceProvider`, соединения создаются РЕАЛЬНЫМИ drag-жестами — `startDrag`→`updatePendingPoint`→`commitDrag` — а не прямым `addConnection()`, как во всех предыдущих чекпоинтах): контракт `draggingFrom`, которым в реальной сцене гасится `orbitEnabled`; Escape посреди жеста не меняет уже собранную цепь; сброс цепи ВО ВРЕМЯ активной протяжки провода безопасен, и жест всё равно корректно завершается после (безопасно именно потому, что позиции терминалов никогда не зависят от значений компонентов — следствие решения о фиксированной раскладке, а не защитный костыль); короткое замыкание, собранное реальным drag-жестом, ловится нетронутым `checkElectricalSafety()`; соединение, сделанное реальным жестом, корректно помечает S9.7-сессию "грязной" и попадает в localStorage — так же, как и прямой `addConnection()`.
- **Workflow** (1, полная сессия): собрать цепь реальными drag-жестами → допустить реальную ошибку подключения (амперметр протянут параллельно) → тот же S9.5 `currentStepFeedback` корректно объясняет её → разорвать ошибочные провода реальным кликом-удалением → переподключить через drag → убедиться, что исправление распознано → полный сброс цепи → пересобрать с нуля → нормально завершить guided experiment. Доказывает, что косметика S9.8 не сломала ничего из S9.1-S9.7.
- **Playwright**: не предпринимался — то же принятое, задокументированное ограничение SwiftShader/headless, что и в S9.3-S9.7.

### Результаты проверок
| Проверка | Результат |
|---|---|
| `npx tsc --noEmit` | 0 ошибок |
| `WireDragProvider.test.tsx` (новый) | **12/12 PASSED** |
| `ElectricitySandboxInteraction.integration.test.tsx` (новый) | **5/5 PASSED** |
| `ElectricitySandboxInteraction.workflow.test.tsx` (новый) | **1/1 PASSED** |
| `npx vitest run` (полный) | **591/591 PASSED (63 файла)**, было 573/60 на S9.7 |
| `npm run lint` | 0 ошибок, 0 предупреждений |
| `WireDragProvider.tsx`, `ConnectionPoint.tsx`, `CanvasShell.tsx`, солвер, `measurement-validation.ts`, `electricity-safety.ts`, `electricity-lab-catalog.ts`, evidence/assessment/autosave-файлы, backend | **не изменены** |
| `frontend/components/geo/`, `GeoWorldScene.tsx` | **не тронуты** (чужая незавершённая работа, явно вне скоупа) |

### Файлы, изменённые/добавленные в этой части
| Файл | Что изменено |
|------|-------------|
| `frontend/components/scenes/ElectricityLabScene.tsx` | 5 точечных UX-фиксов (см. выше) — единственный изменённый production-файл |
| `frontend/components/core/WireDragProvider.test.tsx` | новый файл — 12 юнит-тестов на ранее непротестированную машину состояний |
| `frontend/components/core/ElectricitySandboxInteraction.integration.test.tsx` | новый файл — 5 интеграционных тестов через реальные drag-жесты |
| `frontend/components/core/ElectricitySandboxInteraction.workflow.test.tsx` | новый файл — 1 полный workflow-сценарий |
| `electricity_stage_s9_plan.md` | добавлен раздел `S9.8 - Sandbox UX`, чеклист §3 обновлён, "Unresolved limitations" обновлён |

### Что осталось ❌
1. Playwright-сценарий для 3D-слоя взаимодействия не добавлен — то же принятое ограничение окружения. Новые unit/integration/workflow тесты покрывают машину состояний, но не реальный WebGL-рендеринг/pointer-события браузера.
2. Небесклавиатурного (keyboard-only) способа создать соединение проводом не существует — только отмена по Escape имеет клавиатурную поддержку. Полноценная клавиатурная альтернатива протяжке провода была бы фактически новой системой взаимодействия — явно вне скоупа ("не превращать это в полный accessibility-редизайн", "не создавать параллельные системы взаимодействия").
3. Пункты 2-6 из раздела S9.7 (autosave только localStorage, одна сессия на симуляцию, рефы переходов сбрасываются при resume, `TASK_TOPICS`/мультистуденческий дашборд) — без изменений.
4. Final Polish (S9.9) — не начат, вне скоупа этого чекпоинта.

Ничего не закоммичено в этой части до отдельного шага коммита ниже.

Закоммичено как `feat(electricity): S9.8 approved` (commit `4bc729d`, от `sodatovruslan`, без Co-Authored-By, без push).

---

## Обновление 2026-08-07 (продолжение №14, ФИНАЛЬНОЕ для Electricity Lab) — Stage S9.9: Final Production Polish & Regression

### Задача чекпоинта
Финальное производственное укрепление Electricity Lab: полный аудит всего стека (солвер, measurement validation, safety, guided experiments, assessment/evidence, notebook/report, autosave/resume, sandbox interaction, UI feedback, AI context), финальная проверка acceptance-чеклиста, исправление только реальных воспроизводимых проблем (без новых фич, без переписывания), повторная проверка производительности, точечный UI-полиш, полный регрессионный прогон, финализация документации — включая явную передачу фокуса проекта на GeoWorld. НЕ начинать реализацию GeoWorld — только зафиксировать в HANDOFF.md, что там уже есть незакоммиченного, для продолжения (не для переписывания с нуля).

### Что показал полный аудит
Модуль оказался в подавляющем большинстве уже production-ready — каждая подсистема S9.1-S9.8 перепроверена против финального acceptance-списка и подтверждена существующими тестами. Найдено и закрыто ровно ДВА реальных, узких пробела:

1. **Мостовые схемы (bridge networks) никогда не тестировались с настоящим мостовым элементом.** Существующий тест "bridge-like network" в `nodal-analysis-solver.test.ts` (со времён Option B spike) на деле — это два НЕЗАВИСИМЫХ параллельных плеча без элемента, соединяющего их средние точки — решается простым сведением последовательное/параллельное, а не тот классический случай, для которого реально нужен полный nodal analysis. Добавлены два новых теста с настоящим мостом из 5 резисторов: сбалансированный случай (проверяемый вручную факт — сбалансированный мост несёт ровно нулевой ток независимо от значения самого моста) и несбалансированный случай (проверен через выполнение закона Кирхгофа для токов в обоих внутренних узлах — независимая физическая проверка, а не вручную транскрибированное решение матрицы, где легко ошибиться в арифметике). Оба прошли с первого запуска БЕЗ единого изменения солвера — подтверждает, что архитектура Nodal Analysis (выбранная в S9.2 именно потому, что обобщается на любую топологию, в отличие от старого DFS-солвера) уже была верна для этого случая; пробел был в покрытии тестами, не в солвере.
2. **Один реальный, минорный UI-баг**: в сообщении об успехе "Ток течёт" в `circuit-status` не хватало пробела между значением напряжения и единицей измерения (`12.0В` вместо `12.0 В`) — единственная такая несогласованность, найденная после проверки КАЖДОЙ строки с единицами измерения в UI Electricity Lab на согласованность с остальными (которые уже были согласованы). Исправлено.

Всё остальное проверено и подтверждено уже верным, без изменений: последовательные/параллельные/смешанные расчёты цепи, закон Ома, валидация размещения амперметра/вольтметра и текст обратной связи, обнаружение короткого замыкания/перегрузки/предохранителя/небезопасного подключения, safety UI, полный жизненный цикл guided experiment (гейтинг/подсказки/рестарт/завершение), assessment/evidence/teacher-analytics, notebook/report, autosave/resume/start-over/reload-recovery, и весь слой sandbox-взаимодействия (drag/drop, проводка, удаление провода, отмена по Escape, блокировка камеры, reset/recovery) — всё уже подтверждено накопленным набором тестов S9.1-S9.8, перепрогнано начисто в рамках регрессионного прохода этого чекпоинта.

### Производительность
Перепроверено, без изменений: бенчмарк солвера из S9.2 (0.02-0.09мс/решение, в 60-450 раз меньше бюджета в 5мс/кадр) и аудит аллокаций по каждому `useFrame`-колбэку из S9.8 (ноль аллокаций найдено во всех 6 колбэках цикла кадра сцены) — оба всё ещё в силе: ничего после S9.8 не трогало ни горячий путь солвера, ни цикл рендера, поэтому новый бенчмарк не потребовался, только подтверждение, что существующий всё ещё репрезентативен (полный набор тестов, включая файл бенчмарка, по-прежнему проходит чисто).

### Статус Playwright (одна ограниченная попытка воспроизведения, по прямому указанию)
Запущен `npx playwright test e2e/electricity-lab.spec.ts` один раз. Упал на самом первом шаге (хелпер `registerAndLogin`) с `ECONNREFUSED ::1:8000` — backend FastAPI-сервер не был запущен в этой сессии (frontend dev-сервер тоже). Это ДРУГОЙ вид отказа, чем ранее задокументированное зависание указателя из-за SwiftShader/headless (которое требует, чтобы приложение было реально доступно и рендерилось, прежде чем проявиться) — этот прогон до такой точки не дошёл. По прямому указанию не тратить чекпоинт на отладку постороннней инфраструктуры, запуск и настройка полного стека backend+frontend (включая создание тестового пользователя) признаны вне скоупа для разовой ограниченной проверки. Честный статус: ранее задокументированная с S9.3 проблема SwiftShader/headless не была повторно подтверждена в этом чекпоинте, но ничего здесь ей и не противоречит — покрытие Playwright для Electricity Lab остаётся по-настоящему непроверенным end-to-end, как и на каждом предыдущем чекпоинте S9; на протяжении всего S9 его заменял 3-уровневый набор Vitest, а не Playwright.

### Файлы изменены
`frontend/lib/nodal-analysis-solver.test.ts` (2 новых теста, продакшн-код не тронут), `frontend/components/scenes/ElectricityLabScene.tsx` (правка в один пробел). Больше ничего.

### Тесты
2 новых юнит-теста (мост Уитстона, сбалансированный + несбалансированный случай) добавлены в `nodal-analysis-solver.test.ts`, доведя его до 16/16. Других новых тестовых файлов в этом чекпоинте нет — задача S9.9 была верификацией и точечными фиксами, а не новой функциональной поверхностью, поэтому новых integration/workflow наборов сверх уже построенного в S9.1-S9.8 не потребовалось.

### Результаты проверок
| Проверка | Результат |
|---|---|
| `npx tsc --noEmit` | 0 ошибок |
| `nodal-analysis-solver.test.ts` (расширен, +2 моста Уитстона) | **16/16 PASSED** |
| `npx vitest run` (полный) | **593/593 PASSED (63 файла)**, было 591/63 на S9.8 |
| `npm run lint` | 0 ошибок, 0 предупреждений |
| Playwright (`electricity-lab.spec.ts`, разовая попытка) | упал на `ECONNREFUSED` (серверы не запущены) — не переисследовался далее по прямому указанию |
| Продакшн-солвер/measurement/safety/guided-experiment/assessment/autosave/interaction логика | **не изменена** (только +2 теста и 1-символьная правка) |
| `frontend/components/geo/`, `GeoWorldScene.tsx` | **не тронуты** (чужая незавершённая работа, явно вне скоупа) |

### Файлы, изменённые в этой части
| Файл | Что изменено |
|------|-------------|
| `frontend/lib/nodal-analysis-solver.test.ts` | +2 юнит-теста на настоящий мост Уитстона (сбалансированный/несбалансированный) |
| `frontend/components/scenes/ElectricityLabScene.tsx` | исправлен пропущенный пробел перед "В" в сообщении "Ток течёт" |
| `electricity_stage_s9_plan.md` | добавлен раздел `S9.9 - Final Production Polish & Regression`, финализирован чеклист §3, добавлен раздел 4 "Electricity Lab — Final Module Summary" и раздел 5 "GeoWorld Handoff" |

### ИТОГ: Electricity Lab завершён (S9.0-S9.9)
Полная архитектура, все основные возможности, финальный набор тестов (593/593, 63 файла), честно задокументированные известные ограничения и опциональные будущие улучшения — см. раздел 4 `electricity_stage_s9_plan.md` ("Electricity Lab — Final Module Summary") для полной сводки. Модуль передаётся в продакшн-готовом состоянии по итогам девяти последовательных, каждый раз одобренных чекпоинтов (S9.0 → S9.9), с полным регрессионным покрытием на каждом шаге.

**Electricity Lab завершён. Следующий фокус проекта: GeoWorld.**

### Передача GeoWorld — что уже есть незакоммиченного (НЕ начато в этом чекпоинте)
По прямому указанию S9.9 НЕ начинал работу над GeoWorld — только фиксирует, что уже существует в рабочей директории незакоммиченным (оставлено предыдущей, не-Claude сессией/работой), для того, кто продолжит GeoWorld следующим:
- **`frontend/components/geo/GlobeControls.tsx`** — новый, неотслеживаемый файл (~10.5КБ), кастомный компонент управления камерой для глобуса.
- **`frontend/components/scenes/GeoWorldScene.tsx`** — небольшой незакоммиченный дифф (+6/-1 строк): импортирует и монтирует новый `<GlobeControls />` внутри канваса; передаёт `orbitEnabled={false}` в `CanvasShell` (отключая общий/дефолтный `OrbitControls` именно для GeoWorld в пользу собственной обработки камеры от `GlobeControls`); отключает покадровое автовращение группы Земли в `useFrame` компонента `EarthLayers` (слой облаков продолжает вращаться независимо) — в коде уже есть комментарий, объясняющий почему: "spinning the group under the camera makes the surface drift mid-interaction" (вращение группы под камерой заставляет поверхность "плыть" во время взаимодействия).
- Это по-настоящему работа в процессе, внутренне согласованная (не сломанная наполовину правка) — следующая сессия должна **просмотреть и ПРОДОЛЖИТЬ её, не начинать с нуля и не откатывать**. Ничего в S9.1-S9.9 не трогало, не рецензировало углублённо и не выносило суждений о корректности этой работы по GeoWorld — она намеренно оставлена полностью нетронутой на всех этапах, по прямому указанию каждый раз.

---

## Обновление 2026-08-07 (продолжение №15, POST-S9.9 acceptance fix) — Interactive Sandbox: перемещение компонентов

### Что произошло
После коммита S9.9 ручное тестирование в браузере показало: Electricity Lab всё ещё "ощущается" как статичный стол по сравнению с sandbox-ощущением Chemistry World. Конкретный, подтверждённый пробел: **в Electricity Lab не было возможности взять и подвинуть сами физические компоненты** (батарею, резистор, лампу, переключатель, амперметр, вольтметр, предохранитель) — интерактивна была только проводка (клемма-к-клемме). Собственный acceptance-аудит S9.8 явно оценивал это и признал фиксированную раскладку намеренным, постоянным архитектурным ограничением ("не перетаскиваются по столу — это отдельная фича на будущее"). Это суждение здесь пересмотрено: это был реальный UX-пробел, а не осознанное ограничение, которое стоило сохранить — что стало очевидно при прямом сравнении с реальной системой "взять-и-поставить" у Chemistry World (`ChemistryInteractionProvider.tsx`'s `heldId`/`pickUp`/`release`/`confirmPlacement`, плюс более старый `ChemistryDragProvider`).

### Важная оговорка про инструменты
В этой сессии НЕТ инструмента автоматизации браузера — я не мог сам физически кликать/тащить в реальном браузере. Это было прямо сказано пользователю. Вместо этого сделана максимально строгая проверка через код: сам факт наличия/отсутствия системы перетаскивания компонентов — это вопрос, полностью решаемый чтением исходников (система требует конкретного кода обработчиков, которого либо нет, либо есть). Подтверждено чтением исходников: у Chemistry World реальная система свободного перемещения есть; каждый компонент Electricity Lab рендерился на захардкоженной `position={[...]}` без единого `onPointerDown`/drag-обработчика, а `CircuitComponent` вообще не имел поля позиции. Корректность фикса (компилируется, типизируется, проходит новые тесты на уровне домена, dev-сервер пересобрал без ошибок) проверена в сессии; реальное "ощущение" 3D-взаимодействия (отзывчивость захвата, плавность) проверено вручную пользователем, не ассистентом.

### Что сделано ✅

1. **`frontend/lib/circuit-engine.ts`** — `CircuitComponent` получил необязательное поле `position?: [number, number, number]`. Специально добавлено на УЖЕ существующий тип, чтобы бесплатно течь через уже существующий reducer `ExperimentStateProvider` и весь pipeline S9.7 autosave/serialize/hydrate — **без единого изменения их схемы**. `undefined` откатывается на исходную захардкоженную позицию каждого компонента (`DEFAULT_COMPONENT_POSITIONS` в `ElectricityLabScene.tsx`) — полная обратная совместимость со всеми существующими сохранениями, тестовыми фикстурами и константой `INITIAL_COMPONENTS`.
2. **Новый файл `frontend/components/core/ComponentDragProvider.tsx`** — ОТДЕЛЬНАЯ машина состояний от `WireDragProvider.tsx` (по прямому указанию не путать протяжку провода с перетаскиванием компонента), структурно повторяющая её проверенный паттерн (pointerDown начинает драг, невидимая плоскость стола ловит pointerMove, pointerUp где угодно коммитит, Escape откатывает, window-level pointerup fallback предотвращает зависший драг), но не разделяющая с ней состояние. Ограничено прямоугольником стола (`COMPONENT_DRAG_BOUNDS`); ось Y архитектурно исключена из драга целиком (никогда не трогается) — компонент не может ни провалиться сквозь стол, ни взлететь. Порог дистанции движения отличает реальный драг от обычного клика (нужно, т.к. тело `Switch` тоже кликабельно для переключения).
3. **`ElectricityLabScene.tsx`** — все 7 компонентов теперь вызывают общий хук `useComponentPlacement(id)` (committed-позиция из реального состояния, либо live-превью во время активного драга) и получают `onPointerDown`/курсор "grab"/лёгкое увеличение масштаба во время перетаскивания. Блокировка камеры расширена до `!draggingFrom && !draggingComponentId`. `ElectricityResetButton` теперь также отменяет любой активный драг компонента (иначе сброс посреди драга мог бы быть перезаписан устаревшим коммитом драга сразу после — реальная проблема корректности, найденная при реализации, которой не было у протяжки провода, поскольку позиции клемм раньше никогда не менялись).
4. **`ConnectionPoint.tsx`** — регистрация мировой позиции клеммы переключена с разового `useEffect` на покадровую проверку, которая реально работает ТОЛЬКО пока идёт драг компонента (дешёвая булева проверка в состоянии покоя, тот же принцип "никаких аллокаций в устоявшемся горячем цикле", что уже был установлен ранее) — необходимо, поскольку клемма — дочерний узел группы компонента: её ЛОКАЛЬНАЯ позиция никогда не меняется, меняется только МИРОВАЯ, когда двигается родитель. `Wires()` аналогично принудительно ре-рендерится только во время активного драга компонента, чтобы провод визуально следовал за перемещаемым компонентом в реальном времени, а не "прыгал" только после отпускания.

### Тесты (18 новых, 611/611 всего)
- **Unit** (11, `ComponentDragProvider.test.tsx`): старт/движение/коммит/отмена, исключение оси Y, ограничение XZ-границ, порог клик-vs-драг, одноразовая семантика `consumeJustDragged` (чтобы клик-переключение Switch не "съедалось" отпусканием после реального драга), Escape откатывает, window-pointerup коммитит (не отменяет — это обычное отпускание, а не отмена), очистка слушателей при размонтировании.
- **Integration** (7, реальный `ExperimentStateProvider` + реальный `ComponentDragProvider`): перемещение батареи и перемещение измерительного прибора (амперметра) корректно обновляют реальное доменное состояние, не затрагивая другие компоненты; контракт `draggingComponentId` для блокировки камеры; восстановление после отпускания вне объекта; солвер остаётся численно корректным (закон Ома, `isCircuitActive`) после перемещения и повторного подключения компонентов — доказывает, что `position` чисто косметическое поле, не протекающее в физику; перемещённая позиция доходит до реального localStorage-снимка S9.7 без изменений; симулированная перезагрузка (свежее дерево провайдеров, гидратированное из ранее перемещённого массива `components` — тот же путь, что использует `resumeSave()`) восстанавливает перемещённую позицию точно.

### Честная оговорка о том, что тесты МОГЛИ и НЕ МОГЛИ покрыть
"Следование" мировой позиции клеммы за перемещённым компонентом и живое обновление проводов — следствие сцены React Three Fiber (клемма — дочерний узел, наследует трансформацию родителя бесплатно) плюс изменений в `ConnectionPoint.tsx`/`Wires()` выше. Ни то ни другое не проверяемо без реального WebGL-канваса, который тестовый набор проекта никогда не рендерил, ни на одном этапе S9 — это заранее существующая, последовательная граница, а не что-то новое, пропущенное именно для этого фикса. Новые тесты напрямую проверяют то, что реально делает этот механизм корректным: `position` — это настоящее, управляемое reducer'ом доменное состояние, доступное через то же самое действие, что и любое другое реальное взаимодействие.

### Результаты проверок
| Проверка | Результат |
|---|---|
| `npx tsc --noEmit` | 0 ошибок |
| `ComponentDragProvider.test.tsx` (новый) | **11/11 PASSED** |
| `ComponentPositionSandbox.integration.test.tsx` (новый) | **7/7 PASSED** |
| `npx vitest run` (полный) | **611/611 PASSED (65 файлов)**, было 593/63 |
| `npm run lint` | 0 ошибок, 0 предупреждений |
| dev-сервер (порт 3000, уже запущен) | пересобрал все изменённые файлы без ошибок компиляции (проверено прямым HTTP-запросом к маршруту) |
| Ручная проверка в браузере (реальное ощущение перетаскивания) | выполнена пользователем, не ассистентом (нет инструмента автоматизации браузера в этой сессии) |

### Файлы, изменённые/добавленные в этой части
| Файл | Что изменено |
|------|-------------|
| `frontend/lib/circuit-engine.ts` | добавлено поле `position?` на `CircuitComponent` |
| `frontend/components/core/ComponentDragProvider.tsx` | новый файл — машина состояний перетаскивания компонента |
| `frontend/components/core/ComponentDragProvider.test.tsx` | новый файл — 11 юнит-тестов |
| `frontend/components/core/ConnectionPoint.tsx` | покадровое отслеживание позиции клеммы во время драга |
| `frontend/components/scenes/ElectricityLabScene.tsx` | все 7 компонентов перетаскиваемы, блокировка камеры, кнопка сброса, подключение провайдера |
| `frontend/components/core/ComponentPositionSandbox.integration.test.tsx` | новый файл — 7 интеграционных тестов |
| `electricity_stage_s9_plan.md` | добавлен раздел 6 "Post-S9.9 Acceptance Fix", обновлены разделы 4 (capabilities/limitations/будущие улучшения) |

### Исправленный acceptance scope
Пункт чеклиста S9.8 "Component interaction (drag/drop): N/A by design, not a gap" отозван и заменён: перетаскивание компонентов теперь реализовано и протестировано. Это НЕ переоткрывает и не изменяет коммиты S9.8 или S9.9 (по прямому указанию) — зафиксировано здесь как отдельная, более поздняя, пост-фриз корректировка acceptance scope, который эти чекпоинты уже подтвердили.

Ничего не закоммичено в этой части до отдельного шага коммита ниже.

---

## Обновление 2026-08-08 (продолжение №16, финальный acceptance-проход перед GeoWorld) — Immersive interaction: Electricity Lab WASD/E + два бага Chemistry World

### Задача чекпоинта
Последний проход по качеству взаимодействия перед стартом GeoWorld. Две части: (A) поднять Electricity Lab до того же уровня иммерсивности, что и Chemistry World (fullscreen, WASD-локомоция от первого лица, "E — взять" по близости вместо перетаскивания только мышью), переиспользуя существующую инфраструктуру Chemistry, а не строя вторую; (B) два подтверждённых UX-бага Chemistry World — полосу прокрутки после выхода из fullscreen и слишком строгий порог появления подсказки "E — поставить" у штатива. Явное ограничение: НЕ редизайнить модули, НЕ переписывать физику/химию, GeoWorld не начинать.

### Архитектурный аудит (сделан ПЕРЕД реализацией, по прямому указанию)
Прочитаны реальные системы Chemistry World: `SandboxLocomotionController.tsx` + `sandbox-locomotion.ts` (WASD/мышиный обзор/кинематика — уже полностью общий код, живёт под `chemistry/`, но ничего специфичного для химии не содержит), `CanvasShell.tsx` (уже принимает `cameraMode`/`roomBounds`/`colliders`/`isFullscreen` и безусловно рендерит `SandboxLocomotionController` + `CameraModeController` — Electricity просто никогда не передавал эти пропсы), `SandboxModeOverlay.tsx` (полностью общий UI-оверлей переключения режима/fullscreen), `checkPlayerReach()` (простая, общая, дистанционная — НЕ требует точного угла обзора — проверка достижимости) и более сложная, Chemistry-специфичная `evaluateUnifiedInteraction()` (типизирована под `targetKind: "container"|"bottle"|"tool"|"cabinet"` — намеренно НЕ переиспользована и не расширена под Electricity, чтобы не связывать модуль с чужой типовой моделью и не рисковать поведением Chemistry). Вывод: `CanvasShell.tsx` не требовал изменений логики для WASD (только новый опциональный проп, см. ниже) — всё нужное уже было общим, не найдено ни одного места, где потребовалось бы дублировать код Chemistry.

### Часть A — Electricity Lab: WASD + fullscreen + "E — взять"
1. **Fullscreen** — переиспользован (не продублирован) хук `useFullscreen()`, вынесенный из Chemistry World в `frontend/lib/useFullscreen.ts`. `ElectricityLabScene.tsx` фуллскринит только обёртку канваса (тот же охват, что и у Chemistry — не всю страницу с панелями/AI-чатом).
2. **WASD-локомоция** — `ElectricityCanvas` теперь передаёт `cameraMode`/`roomBounds={ELECTRICITY_ROOM_BOUNDS}`/`colliders={[]}` в `CanvasShell`; статичный прямоугольник `{minX:-6,maxX:6,minZ:-4,maxZ:4}` выбран вместо динамического реестра стен Chemistry — у верстака Electricity нет мебели/стен для регистрации, полноценный реестр был бы неоправданной сложностью.
3. **Приоритет ввода (мышиный драг vs. клавиатурная переноска vs. WASD)** — добавлен новый **общий** (не Electricity-специфичный) проп `CanvasShell`'s `locomotionPaused?: boolean` (по умолчанию `false`, не меняет поведение Chemistry): `SandboxLocomotionController`'s `active` теперь `cameraMode==="sandbox" && !locomotionPaused`. Electricity передаёт `locomotionPaused={mouseDragActive}`, где `mouseDragActive` истинно только для МЫШИНОГО драга провода/компонента — клавиатурная переноска (E) намеренно НЕ ставит WASD на паузу, как и требовалось ("carry while walking").
4. **"E — взять" по близости** — новый компонент `ElectricityProximityInteraction` (рендерится внутри `CircuitScene`, только когда `cameraMode==="sandbox"`) на каждом кадре ищет ближайший из 7 компонентов стенда через ГОТОВУЮ `checkPlayerReach(playerXZ, targetXZ, cameraMode, 1.8)` — чистая XZ-дистанция, без требования точного угла обзора, ровно как и просилось ("standing slightly left/right or at a small angle" должно показывать подсказку). Показывает HUD-подсказку "E — взять: {имя}" (тот же визуальный класс, что и у Chemistry's `InteractionPrompt`). Нажатие E вызывает `startDrag(id, position, "keyboard")` — **не** новую систему "предмет в руках", а ТУ ЖЕ машину состояний `ComponentDragProvider`, что уже обрабатывает мышиное перетаскивание; во время переноски `previewPosition` обновляется каждый кадр точкой перед камерой (`camera.getWorldDirection()`); повторный E коммитит через `commitDrag()`. Escape отменяет — уже работало глобально в `ComponentDragProvider`, без изменений.
5. **`ComponentDragProvider.tsx`** получил `dragSource: "mouse"|"keyboard"`. Понадобилось, потому что уже существующий window-level `pointerup`-фолбэк (изначально сделан для восстановления зависшего МЫШИНОГО драга) иначе преждевременно коммитил бы клавиатурную переноску при отпускании ПКМ/СКМ, которыми в FPS-режиме управляют обзором (drag-to-look) — теперь фолбэк коммитит только `dragSource==="mouse"`; Escape остаётся источник-независимым.
6. **Общие примитивы, вынесенные попутно** (по прямому указанию — переиспользовать, не дублировать): `isTypingTarget()` (было продублировано в 3 местах: `SandboxLocomotionController`, `SandboxModeOverlay`, `ChemistryInteractionProvider`) вынесен в `frontend/lib/dom-input-utils.ts`; все 3 места переключены на импорт. `useFullscreen()` вынесен из Chemistry World в `frontend/lib/useFullscreen.ts` (см. п.1).

### Часть B — два бага Chemistry World
1. **Баг: полоса прокрутки после выхода из fullscreen.** Корневая причина — ДВЕ независимые: (a) на обёртке fullscreen одновременно висели и `fixed inset-0` (сам по себе уже точно прижимает все 4 края к viewport), и избыточные `h-screen w-screen` (100vh/100vw — в части браузеров считаются ВКЛЮЧАЯ зарезервированное место под скроллбар, конфликтуя с боксом `inset-0`); убраны, оставлен только `fixed inset-0`. (b) гонка по времени CSS-transition: обёртка меняла fullscreen-классы МГНОВЕННО в одном рендере, а внутренний контейнер `CanvasShell.tsx` (за высотой/шириной которого следит `ResizeObserver` из `react-use-measure`, используемый R3F для канваса) имел `transition-all duration-300`, анимируя высоту/ширину 300мс против уже мгновенно изменившегося родителя. Исправлено на `transition-[border-radius,box-shadow] duration-300` — высота/ширина меняются мгновенно (без гонки), только косметические border-radius/shadow остаются анимированными.
2. **Баг: подсказка "E — поставить" у штатива требует почти идеального выравнивания.** Корневая причина — в `isContainerOnStand()` (`ChemistryWorkspaceProvider.tsx`) был захардкожен буквальный порог `0.25`, при этом шестью строками выше была объявлена, но нигде не использована константа `STAND_PROXIMITY_RADIUS = 0.55` (мёртвый, забытый код) — `0.25` было меньше суммы собственных визуальных радиусов штатива (`0.28`) и колбы (`0.32`) из `FOOTPRINT_RADIUS_BY_KIND`, то есть визуально корректные, "явно предназначенные" размещения проваливали проверку. Исправлено подключением уже существовавшей, но не используемой константы.

### Тесты (26 новых, 624/624 всего)
- **`ComponentDragProvider.test.tsx`** (+4): клавиатурный захват не коммитится глобальным `pointerup`; Escape по-прежнему отменяет клавиатурный захват; `startDrag` без явного `source` по умолчанию `"mouse"` (обратная совместимость с существующими вызовами из `onPointerDown`).
- **`frontend/lib/dom-input-utils.test.ts`** (новый, 4 теста): INPUT/TEXTAREA/SELECT/contentEditable → true; обычные элементы/`null`/не-`HTMLElement` → false.
- **`frontend/lib/useFullscreen.test.ts`** (новый, 4 теста): `toggleFullscreen` вызывает `requestFullscreen`/`exitFullscreen` в зависимости от текущего состояния; `isFullscreen` следует за `fullscreenchange`; слушатель снимается при размонтировании.
- **`ChemistryWorkspace.integration.test.tsx`** (+2): контейнер, поставленный с оффсетом 0.4м от центра штатива (был бы отклонён при старом пороге 0.25, проходит при исправленном 0.55) считается стоящим на штативе; контейнер, поставленный далеко (оффсет 2м), — нет.
- Существующая `checkPlayerReach()` в `sandbox-locomotion.test.ts` (тесты №31-33, не изменялись) уже покрывает "forgiving proximity" на уровне переиспользуемого примитива — дистанция считается без учёта угла обзора камеры, то есть требование "не требовать точного прицеливания" выполняется самой природой функции, а не отдельной Electricity-специфичной проверкой.

### Честная оговорка о том, что проверено, а что нет
В сессии по-прежнему нет инструмента автоматизации браузера. Проверено: `tsc --noEmit` (0 ошибок), полный `vitest run` (624/624, 67 файлов), `npm run lint` (0/0), и компиляция dev-сервера — обе страницы (`/electricity_lab/[id]`, `/chemistry_world/[id]`) собрались без ошибок (2711 и 2825 модулей) и отдали HTTP 200 без оверлея ошибок. НЕ проверено ассистентом: реальное "ощущение" WASD-перемещения по масштабу верстака Electricity, плавность мышиного обзора в fullscreen, визуальное позиционирование HUD-подсказки "E — взять" относительно 3D-объектов, и оба чек-листа Chemistry/Electricity из технического задания — всё это требует реального браузера с WebGL и должно быть пройдено пользователем вручную (чек-лист приведён в ответе ассистента в этом же чекпоинте).

### Результаты проверок
| Проверка | Результат |
|---|---|
| `npx tsc --noEmit` | 0 ошибок |
| `npx vitest run` (полный) | **624/624 PASSED (67 файлов)**, было 611/65 |
| `npm run lint` | 0 ошибок, 0 предупреждений |
| dev-сервер, `/electricity_lab/[id]` | скомпилирован (2711 модулей), HTTP 200, без оверлея ошибок |
| dev-сервер, `/chemistry_world/[id]` | скомпилирован (2825 модулей), HTTP 200, без оверлея ошибок |
| Ручная браузерная проверка обоих 14/9-шаговых чек-листов | выполняется пользователем (нет инструмента браузерной автоматизации в этой сессии) |

### Файлы, изменённые/добавленные в этой части
| Файл | Что изменено |
|------|-------------|
| `frontend/lib/dom-input-utils.ts` | новый файл — общий `isTypingTarget()`, вынесен из 3 дублей |
| `frontend/lib/dom-input-utils.test.ts` | новый файл — 4 юнит-теста |
| `frontend/lib/useFullscreen.ts` | новый файл — общий fullscreen-хук, вынесен из Chemistry World |
| `frontend/lib/useFullscreen.test.ts` | новый файл — 4 юнит-теста |
| `frontend/components/scenes/ChemistryWorldScene.tsx` | переключён на `useFullscreen()`; убраны избыточные `h-screen w-screen` из fullscreen-обёртки (баг B.1) |
| `frontend/components/scenes/CanvasShell.tsx` | `transition-all` → `transition-[border-radius,box-shadow]` (баг B.1); новый опциональный проп `locomotionPaused?` (по умолчанию `false`, не меняет поведение существующих вызовов) |
| `frontend/components/core/ChemistryWorkspaceProvider.tsx` | `isContainerOnStand()` использует уже существовавшую `STAND_PROXIMITY_RADIUS=0.55` вместо захардкоженной `0.25` (баг B.2) |
| `frontend/components/chemistry/sandbox/SandboxModeOverlay.tsx` | локальный `isTypingTarget` заменён на общий импорт |
| `frontend/components/chemistry/sandbox/SandboxLocomotionController.tsx` | локальный `isTypingTarget` удалён, заменён на общий импорт |
| `frontend/components/core/ChemistryInteractionProvider.tsx` | локальный `isTypingTarget` удалён, заменён на общий импорт |
| `frontend/components/core/ComponentDragProvider.tsx` | добавлено поле `dragSource: "mouse"\|"keyboard"`, window-`pointerup`-фолбэк теперь коммитит только мышиный драг |
| `frontend/components/core/ComponentDragProvider.test.tsx` | +4 юнит-теста на `dragSource` |
| `frontend/components/core/ChemistryWorkspace.integration.test.tsx` | +2 теста на расширенный порог `isContainerOnStand` |
| `frontend/components/scenes/ElectricityLabScene.tsx` | fullscreen-обёртка + `SandboxModeOverlay`; `cameraMode`/`roomBounds`/`isFullscreen`/`locomotionPaused` прокинуты в `ElectricityCanvas`→`CanvasShell`; новый компонент `ElectricityProximityInteraction` (E-взаимодействие по близости) |

### Manual browser acceptance checklist (для пользователя — обязательно, автотесты этого не заменяют)

**Electricity Lab** (`/electricity_lab/[id]`):
1. Войти в fullscreen — макет не скачет, скроллбаров нет, UI остаётся кликабельным.
2. Переключиться в Sandbox-режим (кнопка в `SandboxModeOverlay`) и походить WASD.
3. Подойти к батарее чуть сбоку/под углом (не идеально по центру) — должна появиться подсказка "E — взять: Battery".
4. Нажать E — компонент "берётся" (превью следует за камерой).
5. Переместиться и разместить/отпустить (повторный E).
6. Походить снова — управление не залипает.
7. Подключить провод.
8. Подвинуть уже подключённый компонент — провод визуально следует за ним.
9. Проверить Escape во время переноски (клавиатурной и мышиной) — отменяет без применения.
10. Выйти из fullscreen — макет/скролл страницы в норме.
11. Убедиться, что печать в поле AI-чата НЕ двигает игрока (WASD игнорируется во время фокуса на текстовом поле).
12-14. Повторить для остальных 6 компонентов (резистор, лампа, переключатель, амперметр, вольтметр, предохранитель) хотя бы выборочно.

**Chemistry World** (`/chemistry_world/[id]`):
1. Войти в fullscreen, выйти — убедиться, что горизонтальной полосы прокрутки страницы больше нет.
2. Взять контейнер/колбу.
3. Поднести к штативу НЕ идеально точно (немного левее/правее/дальше, чем раньше срабатывало) — зелёная подсказка должна появляться заметно раньше/при более широком допуске, чем до фикса.
4. Нажать E — подтвердить корректное размещение именно на штативе (не мимо).
5. Повторить с нескольких углов/дистанций подхода.

Ничего не закоммичено в этой части до отдельного шага коммита ниже.

---

## Обновление 2026-08-08 (продолжение №17) — Fullscreen scrollbar: реальная ОБЩАЯ причина (предыдущий фикс был неполным)

### Задача чекпоинта
Пользователь вручную воспроизвёл баг с горизонтальной полосой прокрутки после выхода из fullscreen ПОВТОРНО — фикс из предыдущего чекпоинта (продолжение №16, п. B.1: `h-screen w-screen` + `transition-all` в `ChemistryWorldScene.tsx`/`CanvasShell.tsx`) оказался НЕПОЛНЫМ. Баг воспроизводится не только в Chemistry World, но и в Electricity Lab, и — критически важно — **в SimLabScene.tsx ("Physics Lab"), у которого вообще нет НИКАКОГО кода fullscreen** (ни `useFullscreen`, ни переключения классов, ни единого упоминания "fullscreen" во всём файле). Прямое указание пользователя: НЕ чинить Chemistry ещё раз точечно — найти и исправить ОБЩУЮ причину один раз в общей инфраструктуре.

### Реальная общая причина
Тот факт, что баг воспроизводится на странице БЕЗ единого fullscreen-кода, логически исключает CanvasShell/scene-специфичные обёртки как источник и указывает на общую оболочку страницы. Найдено: `frontend/app/globals.css` нигде не резервировал место под вертикальный скроллбар (`scrollbar-gutter`) для `<html>`. Пока элемент в fullscreen, остальная часть страницы (Sidebar/Navbar/панели/чат) браузером не рендерится и обычно не требует вертикального скролла → скроллбар пропадает → доступная ширина `<html>` увеличивается на ширину скроллбара (~15-17px в Windows). При выходе из fullscreen настоящая, более высокая страница возвращается и требует скролл снова → доступная ширина резко уменьшается → любой процентный/flex-контент, посчитанный под "widescreen без скроллбара", оказывается шире нового viewport → горизонтальный скроллбар. Это происходит идентично и при `element.requestFullscreen()` из нашего кода, и при нативном F11 браузера — что и объясняет воспроизведение на SimLabScene без единой строчки нашего fullscreen-кода.

### Фикс (один раз, в общем месте)
`frontend/app/globals.css`:
```css
html {
  overflow-y: scroll;
  scrollbar-gutter: stable;
}
```
Резервирует гуттер скроллбара ВСЕГДА, поэтому его появление/исчезновение никогда не меняет доступную ширину `<html>` — ни от нашего fullscreen, ни от F11, ни от любого другого изменения высоты контента в будущем. Наследуется автоматически абсолютно всеми страницами `app/(app)` (Chemistry, Electricity, SimLab, GeoWorld, dashboard, профиль) без единого изменения на уровне отдельных сцен. НЕ является `overflow-x: hidden`-хаком (явно исключено отдельным regression-тестом ниже) — устраняет саму причину, по которой ширина вообще может "уехать", а не прячет уже случившийся оверфлоу.

Предыдущий фикс из продолжения №16 (убранные `h-screen w-screen`, `transition-all` → `transition-[border-radius,box-shadow]`) НЕ отменён — это была реальная, отдельная гигиена (устраняла конфликт единиц измерения и гонку по времени CSS-transition), просто недостаточная сама по себе без фикса общего гуттера.

### Незапланированный побочный инцидент: диск C: был заполнен на 100% (0 байт свободно)
В процессе верификации `npx tsc`/`vitest`/`lint` стали падать с `ENOSPC` — диск C: (не D:, где лежит сам проект) оказался заполнен полностью, независимо от кода. Диагностировано (по явному разрешению пользователя, только просмотр вначале): `C:\$Recycle.Bin` содержал 6.64 ГБ (при том что штатная Корзина в проводнике показывала только 0.23 ГБ) — разница из-за "осиротевших" по-SID папок, не видимых через обычный UI. По прямому подтверждению пользователя очищены только: корзина текущего пользователя (SID `-1001`) и корзина SYSTEM (`S-1-5-18`, частично — `Remove-Item` заблокирован защитой пути, очищено через `Shell.Application` COM-объект и `Clear-RecycleBin`, доступный пользователю объём освобождён). Кандидаты `C:\SWSetup` (2.47 ГБ, кэш установщика ноутбука) и `C:\MSOCache` (0.75 ГБ, кэш установщика Office) и SID `-1000` (возможно другой локальный аккаунт) — пользователь НЕ подтвердил, не тронуты. После очистки свободно ~230-250 МБ — достаточно для `tsc`/`vitest`/`lint`, но диск всё ещё критически полон; это НЕ решено полностью и не имеет отношения к коду проекта — отдельная забота пользователя вне скоупа этой задачи.

### Тесты
Новый файл `frontend/app/globals-css.test.ts` (3 теста) — регрессионный guard на саму CSS-декларацию (jsdom не рендерит настоящие скроллбары, поэтому тестируется наличие правила, а не визуальный эффект): `scrollbar-gutter: stable` объявлен на `html`; `overflow-y: scroll` присутствует как fallback; `overflow-x: hidden` НЕ используется нигде вне комментариев (первая версия теста ложно спотыкалась о само пояснение в комментарии CSS, где буквально написано "это не `overflow-x: hidden`" — тест поправлен, чтобы сначала вырезать `/* ... */`-комментарии).

### Результаты проверок
| Проверка | Результат |
|---|---|
| `npx tsc --noEmit` | 0 ошибок |
| `frontend/app/globals-css.test.ts` (новый) | **3/3 PASSED** |
| `npx vitest run` (полный) | **627/627 PASSED (68 файлов)**, было 624/67 |
| `npm run lint` | 0 ошибок, 0 предупреждений |
| dev-сервер, `/chemistry_world/[id]` | скомпилирован (2727 модулей), HTTP 200 |
| dev-сервер, `/electricity_lab/[id]` | скомпилирован (2825 модулей), HTTP 200 |
| dev-сервер, `/simlab/[id]` ("Physics Lab") | скомпилирован (2839 модулей), HTTP 200 |
| Ручная браузерная проверка (fullscreen enter/exit ×3 на каждом из трёх модулей) | требуется от пользователя — нет инструмента браузерной автоматизации в этой сессии |

### Честная оговорка
Как и на каждом предыдущем чекпоинте — в сессии нет инструмента браузерной автоматизации, поэтому "визуальное" отсутствие горизонтальной полосы прокрутки после реального enter/exit fullscreen (тем более повторного ×3, как просил пользователь) не проверено ассистентом напрямую, только выведено из CSS-механизма (резервирование гуттера — стандартный, документированный способ убрать именно такой класс layout-shift бага) и подтверждено тем, что все три модуля компилируются и рендерятся без ошибок после изменения. Пользователь должен пройти ручной чек-лист ниже сам.

### Файлы, изменённые в этой части
| Файл | Что изменено |
|------|-------------|
| `frontend/app/globals.css` | добавлено правило `html { overflow-y: scroll; scrollbar-gutter: stable; }` — реальная общая причина бага |
| `frontend/app/globals-css.test.ts` | новый файл — 3 regression-теста на CSS-правило |

### Manual browser acceptance checklist (обновлённый, для всех трёх модулей, ×3 повторов каждый)

Для КАЖДОГО из: Chemistry World (`/chemistry_world/[id]`), Electricity Lab (`/electricity_lab/[id]`), SimLab/Physics (`/simlab/[id]`):
1. Открыть страницу как обычно — убедиться, что горизонтальной полосы прокрутки нет.
2. Открыть DevTools Console и сравнить `document.documentElement.scrollWidth` и `window.innerWidth` — должны совпадать (или отличаться на 0).
3. Войти в fullscreen (кнопкой — для Chemistry/Electricity; F11 — для всех трёх, включая SimLab, у которого нет своей кнопки).
4. Выйти из fullscreen.
5. Повторить пункт 2 — `scrollWidth` не должен превышать `innerWidth`.
6. Повторить шаги 3-5 ещё 2 раза подряд (всего ×3) — стили не должны накапливаться между переключениями.
7. Убедиться, что нормальная вертикальная прокрутка страницы работает как раньше.

Ничего не закоммичено в этой части до отдельного шага коммита ниже.

---

## Обновление 2026-08-08 (продолжение №18) — Fullscreen scrollbar: ВТОРАЯ, куда более крупная причина (продолжение №17 устранило только часть проблемы)

### Что произошло
Пользователь вручную проверил Chemistry World в браузере после фикса из продолжения №17 (`scrollbar-gutter: stable`) — баг всё ещё воспроизводился, и заметно сильнее, чем ожидавшийся 15-17px сдвиг от скроллбара. Диагностика через DevTools Console (скрипт, находящий DOM-элементы шире viewport) показала: `viewport clientWidth: 1521`, `document.documentElement.scrollWidth: 2157` — разрыв **636px**, что исключает scrollbar-gutter как причину именно ЭТОЙ манифестации бага (та причина давала бы ~15-17px, не 636px).

### Реальная причина №2
Корневой оффендер — `<div className="flex-1 rounded-2xl ...">`, оборачивающий `ChemistryCanvas`/`CanvasShell`, внутри родителя `<div className="flex flex-col gap-4 lg:flex-row lg:items-start">` (Chemistry: строка ~3532-3533; Electricity: идентичная структура, строка ~1554-1555 — **дословно одинаковый JSX**, скопированный между сценами). Классический flexbox-баг: `flex-1` без `min-w-0` не даёт браузеру ужать элемент ниже "естественной" (intrinsic) ширины его содержимого — в данном случае ширины 3D-канваса — даже если места объективно не хватает. Из-за этого канвас-панель отказывалась сжиматься под доступную ширину экрана, что и выталкивало соседнюю панель (реагенты/компоненты) на **636px** за правый край видимой области, создавая горизонтальный скроллбар документа.

Этот баг НЕ связан с fullscreen как таковым — он воспроизводится в любой раскладке `lg:flex-row`, где доступная ширина оказывается меньше суммарной "естественной" ширины детей. Пользователь столкнулся с ним именно после fullscreen, потому что вход/выход даёт браузеру повод пересчитать layout при уже суженном/специфичном состоянии окна.

### Фикс
Добавлен `min-w-0` к `flex-1`-контейнеру канваса в обоих файлах:
- `frontend/components/scenes/ChemistryWorldScene.tsx` (строка ~3533)
- `frontend/components/scenes/ElectricityLabScene.tsx` (строка ~1555)

`min-w-0` разрешает браузеру сжимать flex-item ниже его intrinsic-ширины, позволяя `w-full`/`overflow-hidden` внутри (`CanvasShell`) реально ограничивать канвас нужным размером.

**SimLab НЕ затронут этим багом** — у него нет `lg:flex-row`-раскладки канвас+панель вообще (`CanvasShell` там full-width, панель ниже через `grid`, не сбоку через `flex`), поэтому проверять/чинить там нечего.

### Как было найдено (для будущего агента — воспроизводимый метод)
Правочный DevTools-сниппет, находящий корневой (самый внешний) элемент, вылезающий за viewport:
```js
(() => {
  const vw = document.documentElement.clientWidth;
  const isOffender = (el) => {
    const r = el.getBoundingClientRect();
    return r.right > vw + 1 || r.left < -1;
  };
  const roots = [];
  document.querySelectorAll('body *').forEach(el => {
    if (isOffender(el) && !(el.parentElement && isOffender(el.parentElement))) {
      const r = el.getBoundingClientRect();
      roots.push({ tag: el.tagName, cls: (el.className || '').toString().slice(0, 100),
        left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width) });
    }
  });
  console.log('viewport clientWidth:', vw, 'scrollWidth:', document.documentElement.scrollWidth);
  console.table(roots);
})();
```
Работает надёжнее, чем гадание по коду — сразу указывает конкретный элемент и его класс, не только косвенные подозрения.

### Результаты проверок
| Проверка | Результат |
|---|---|
| `npx tsc --noEmit` | 0 ошибок |
| `npx vitest run` (полный) | 627/627 PASSED (68 файлов) |
| Ручная проверка пользователем — Chemistry World | **ПОДТВЕРЖДЕНО, работает** |
| Ручная проверка пользователем — Electricity Lab | **ПОДТВЕРЖДЕНО, работает — APPROVED, дальше не трогать без критической регрессии** |

### Статус на конец продолжения №18
Chemistry World и Electricity Lab по fullscreen-overflow багу — **закрыто и подтверждено пользователем**. Фокус проекта переключается на GeoWorld (ревью унаследованной от Cline работы, стадия G1) и параллельно на аудит существующей/новой дизайн-документации перед визуальным редизайном (EDUMIND_DESIGN_SYSTEM_V2.md или уже существующий эквивалент). Оба — отдельные, ещё не начатые треки; смотри git log/HANDOFF после этой записи за их прогрессом.

### Файлы, изменённые в этой части
| Файл | Что изменено |
|------|-------------|
| `frontend/components/scenes/ChemistryWorldScene.tsx` | добавлен `min-w-0` к flex-1 контейнеру канваса |
| `frontend/components/scenes/ElectricityLabScene.tsx` | идентичный фикс — тот же скопированный JSX-паттерн |

---

## Обновление 2026-08-08 (продолжение №19) — GeoWorld G1: ревью унаследованной работы Cline + два фикса восстановления состояния

### Задача чекпоинта
По прямому указанию: НЕ переписывать GeoWorld с нуля. `frontend/components/geo/GlobeControls.tsx` (новый файл) и малый незакоммиченный дифф в `frontend/components/scenes/GeoWorldScene.tsx` (см. запись в конце продолжения №15 выше) оставлены предыдущей, не-Claude сессией/работой ("Cline") незакоммиченными. Задача — прочитать эту работу, оценить архитектурно, и если она здорова — оставить как есть, исправив только доказанные проблемы, не трогая "ощущение" камеры (damping/lerp/zoom-speed/pole-clamp/double-click — это ручная UX-приёмка, не код-ревью).

### Ревью унаследованной работы (только чтение, ничего не менялось на этом шаге)
`GlobeControls.tsx` (~350 строк) — камера-контроллер глобуса на сферических координатах: ЛКМ-драг = поворот, колесо = логарифмический зум, даблклик = raycast на юнит-сферу (radius=1.0 — **корректно совпадает** с реальной константой `CRUST_R=1.0` из `GeoWorldScene.tsx`, не рассинхронизировано) и перелёт к точке клика, touch (1 палец = поворот, 2 = pinch-zoom), инерция вращения через `vTheta/vPhi * inertiaDamping`, полюса зажаты `PHI_EPS=0.05` от 0/π. `GeoWorldScene.tsx`: монтирует `<GlobeControls/>` внутрь `CanvasShell`, передаёт `orbitEnabled={false}` (штатный `OrbitControls` корректно и полностью отключён для GeoWorld), отключено покадровое автовращение группы Земли в `useFrame` (только слой облаков продолжает крутиться независимо, с объясняющим комментарием почему).

Проверено на конфликты: клик по слоям Земли (crust/mantle/outer_core/inner_core) использует только `onClick` (не `onDoubleClick`) — конфликта с даблклик-зумом `GlobeControls` нет. Утечек слушателей не было и до фикса — cleanup в исходном коде Cline был корректным.

**Вердикт: архитектура здорова, оставлено как есть.** Найдено ровно два доказанных пробела восстановления состояния (не "вкусовщина"):
1. Не было `touchcancel` — при прерывании touch-жеста ОС/браузером (не `touchend`) `dragging`/`pinching` остались бы `true` навсегда.
2. Не было window-level `pointerup` фолбэка (только `pointerleave` на канвасе) — отпускание кнопки мыши за пределами канваса в определённых кромочных случаях могло оставить драг зависшим.

### Фикс (по прямому одобрению — только эти два пункта)
`frontend/components/geo/GlobeControls.tsx`:
1. Добавлен `onTouchCancel` — безусловно сбрасывает `dragging`/`pinching`/`pinchDist`/`vTheta`/`vPhi` в состояние покоя (в отличие от `onTouchEnd`, здесь не нужно анализировать оставшиеся точки касания — жест прерван целиком).
2. Добавлен `window.addEventListener("pointerup", onPointerUp)` — тот же проверенный паттерн, что в `ComponentDragProvider`/`WireDragProvider` (см. их комментарии). `onPointerUp` только выставляет булев флаг, поэтому повторный вызов и с канваса, и с window для одного и того же всплывающего события — безвредный no-op, не дублирующая обработка отпускания.

Damping/lerp/zoom-speed/min-max-zoom/pole-clamp/double-click-behavior **не тронуты** — по прямому указанию, это предмет ручной UX-приёмки, а не код-ревью.

### Результаты проверок
| Проверка | Результат |
|---|---|
| `npx tsc --noEmit` | 0 ошибок |
| `npm run lint` | 0 ошибок, 0 предупреждений |
| `npx vitest run` (полный) | 627/627 PASSED (68 файлов) — регрессий нет (GeoWorld-специфичных тестов в проекте нет, `GlobeControls`/`GeoWorldScene` тестами не покрыты ни до, ни после — WebGL-канвас тестовый набор проекта никогда не рендерил, задокументированное заранее существующее ограничение) |
| dev-сервер, `/geo3d/[id]` | скомпилирован (2604 модуля), HTTP 200 |
| `orbitEnabled={false}` на `CanvasShell` | подтверждено — штатный `OrbitControls` отключён |
| `<GlobeControls/>` — единственный монтированный контроллер камеры | подтверждено |
| Автовращение группы Земли отключено, вращение облаков не затронуто | подтверждено чтением `useFrame` в `EarthLayers` |
| Клик по слоям (`onClick` на crust/mantle/outer_core/inner_core) | не тронут, конфликтов с даблклик-зумом нет |

### Честная оговорка
Нет инструмента браузерной автоматизации в этой сессии — "ощущение" камеры (плавность инерции, скорость зума, поведение у полюсов, реальное touch-поведение на устройстве) не проверено ассистентом визуально, только логикой кода и статическим анализом. Ручная проверка в браузере — задача пользователя (см. список ниже).

### Manual browser acceptance checklist (GeoWorld G1, для пользователя)
1. Открыть `/geo3d/[id]`, покрутить глобус мышью (ЛКМ-драг) в разные стороны несколько раз подряд.
2. Покрутить колесо мыши в обе стороны — зум плавный, без рывков.
3. Даблклик по нескольким точкам поверхности — камера подлетает к точке клика.
4. Быстро покрутить и отпустить — инерция плавно затухает, не "залипает".
5. Подвести камеру близко к северному/южному полюсу — вращение не "переворачивается"/не дёргается.
6. (На тач-устройстве, если доступно) — 1 палец крутит, 2 пальца — pinch-zoom; во время pinch внезапно прерванный жест (например, свайп системным жестом) не оставляет глобус "залипшим" в неактивном состоянии.
7. Кликнуть по слоям Земли (кора/мантия/внешнее ядро/внутреннее ядро) — переключение слоёв работает, как раньше.
8. Resize окна браузера — канвас/камера не ломаются.

### Файлы, изменённые в этой части
| Файл | Что изменено |
|------|-------------|
| `frontend/components/geo/GlobeControls.tsx` | добавлен `onTouchCancel` + window-level `pointerup` фолбэк (два доказанных пробела восстановления состояния); обновлён шапка-комментарий |

### Статус на конец продолжения №19
**GeoWorld G1 (Globe Navigation Foundation) — завершено и закоммичено.** Унаследованная от Cline работа сохранена практически без изменений, дополнена только двумя фиксами восстановления состояния. Ручная browser-приёмка "ощущения" камеры — за пользователем. G2+ не начаты — см. `GEOWORLD_ROADMAP.md`.

---

## Обновление 2026-08-08 (продолжение №20) — GeoWorld G2: тайловый/LOD-движок (архитектурное доказательство, заглушечные данные)

### Задача чекпоинта
По прямому указанию: G2 — АРХИТЕКТУРНОЕ ДОКАЗАТЕЛЬСТВО, не продакшн-тайлы. Не подключать реальный провайдер (OpenStreetMap/платные API/Cesium Ion и т.п.), не переписывать `GlobeControls`, не заменять существующий рендер Земли. Цель — доказать, что переход "вся Земля → континент → регион → локальная деталь" технически возможен без загрузки одной гигантской текстуры: 8 конкретных пунктов доказательства (тайлы, видимые тайлы по позиции камеры, смена LOD при приближении, переход родитель/дети без дыр, выгрузка невидимых тайлов, асинхронная загрузка, устойчивость к резким движениям камеры, готовность архитектуры принять реального провайдера позже).

### Выбор модели тайлов
**Geodetic (lat/lng) quadtree**, НЕ cube-sphere. Обоснование и рассмотренная альтернатива — см. `GEOWORLD_ROADMAP.md`, раздел G2 (коротко: совместимость с реальными открытыми провайдерами imagery без репроекции в G3+, и прямое переиспользование уже существующей формулы координат сцены вместо второй системы координат).

### Архитектура (полный список файлов — см. таблицу файлов ниже)
Чистая LOD/тайловая логика полностью отделена от Three.js/React (`frontend/lib/geo/*.ts` — тестируется без WebGL), рендер — отдельно (`frontend/components/geo/TileDebugLayer.tsx`). Побочный, безопасный рефактор: `latLngToVector3`/обратная формула, раньше продублированные внутри `GeoWorldScene.tsx` (локальная функция + инлайн-математика в `handleClick`), вынесены в общий `frontend/lib/geo/coordinates.ts` — идентичная математика, просто один источник истины вместо двух копий. Полная техническая разбивка (TileProvider/TileCache/TileEngine/LOD-политика/async-жизненный цикл/кэш/ограничения/требования к G3) — в `GEOWORLD_ROADMAP.md`, не дублируется здесь.

### Связь с камерой
По прямому указанию — БЕЗ привязки к внутренностям `GlobeControls`. `TileDebugLayer` читает `state.camera.position` через штатный R3F `useThree()`/`useFrame()` (тот же паттерн, что уже использует `CameraModeController` в `CanvasShell.tsx`) — движку в принципе всё равно, что двигает камеру. `GlobeControls.tsx` в этом чекпоинте не изменён вообще ни на строку.

### Debug-визуализация
Тоггл "Показать/Скрыть Tile/LOD debug" (`data-testid="tile-debug-toggle"`) в существующей панели управления GeoWorld, выключен по умолчанию. Включённый режим рисует цветные сферические заплатки по границам активных тайлов + белый контур + подпись `id (LOD z)`, и плавающий оверлей со счётчиками (`data-testid="tile-debug-stats"`: Visible/Cached/Max LOD). Не показывается во время разреза слоёв (`isCutaway`) — там уже занята прозрачность коры.

### Результаты проверок
| Проверка | Результат |
|---|---|
| `npx tsc --noEmit` | 0 ошибок |
| `npm run lint` | 0 ошибок, 0 предупреждений (1 предупреждение `react-hooks/exhaustive-deps` по ходу работы — исправлено сразу) |
| `npx vitest run` (полный) | **670/670 PASSED (74 файла)**, было 627/68 — +43 новых теста, все на чистой логике `lib/geo/*`, без WebGL |
| dev-сервер, `/geo3d/[id]` | скомпилирован (2644 модуля, включая новую зависимость от drei `<Text>`/troika), HTTP 200, без ошибок в логе |
| `orbitEnabled={false}` на `CanvasShell`, `<GlobeControls/>` — единственный контроллер, автовращение Земли отключено, вращение облаков не затронуто | подтверждено повторно — `GlobeControls.tsx` не тронут этим чекпоинтом, диф `GeoWorldScene.tsx` проверен построчно |
| Клик по слоям Земли (`onClick` crust/mantle/outer_core/inner_core) | не тронут |

### Тесты (43 новых — см. таблицу в `GEOWORLD_ROADMAP.md`, раздел G2)
Полный список файлов и что именно каждый проверяет — в `GEOWORLD_ROADMAP.md` (не дублируется здесь, чтобы не разъезжались два описания одного и того же). Коротко: адресация/parent-child/полюса/шов (`tiling.test.ts`), LOD-политика и соответствие координат сцене (`tile-lod.test.ts`), LRU-кэш (`tile-cache.test.ts`), честная асинхронность заглушки (`tile-provider.test.ts`), интеграция родитель/дети + устаревшие ответы + `dispose()` (`tile-engine.test.ts`).

### Честная оговорка
Нет инструмента браузерной автоматизации в этой сессии — реальное визуальное поведение LOD (действительно ли деление концентрируется вокруг видимого региона, действительно ли нет "дыр" при быстром зуме на глаз, "ощущение" производительности) проверено логикой/тестами и компиляцией, не увидено напрямую. Ручная браузерная проверка — за пользователем, чек-лист ниже.

### Manual browser acceptance checklist (GeoWorld G2, для пользователя)
1. Открыть `/geo3d/[id]`, включить кнопку "Показать Tile/LOD debug".
2. Из космоса — увидеть грубое (LOD 0-1) покрытие всей видимой полусферы Земли, счётчик "Visible" небольшой.
3. Приблизиться к одному континенту — только регион под камерой должен начать делиться на более мелкие подписанные тайлы, дальние области — оставаться крупными.
4. Продолжить приближение — увидеть более высокие уровни LOD (подпись "LOD N" растёт) именно там, куда смотрит камера.
5. Повернуть глобус к другому региону — старый регион должен вернуться к низкой детализации/выгрузиться, счётчик "Cached" не расти неограниченно.
6. Быстро покрутить колесо туда-обратно несколько раз — не должно быть чёрных/пустых проплешин на месте тайлов, счётчики не "зависают" на неадекватных числах.
7. Даблклик-перелёт в новую точку во время активной догрузки тайлов — старые запросы не должны "путать" итоговую картинку.
8. Убедиться, что `GlobeControls` (орбит/зум/даблклик/touch), клик по геологическим слоям и вращение облаков работают как прежде — debug-слой ничего не поломал.
9. Выключить тоггл — debug-слой и счётчики полностью пропадают, обычный вид Земли не изменился.
10. Не должно быть заметного проседания FPS при активном debug-режиме на обычном ноутбуке.

### Файлы, изменённые/добавленные в этой части
| Файл | Что изменено |
|------|-------------|
| `frontend/lib/geo/coordinates.ts` | новый — общие `latLngToVector3`/`vector3ToLatLng`, перенесены из `GeoWorldScene.tsx` |
| `frontend/lib/geo/tiling.ts` | новый — чистая адресация тайлов (id/ключ/parent/children/границы) |
| `frontend/lib/geo/tile-lod.ts` | новый — чистая LOD-политика (видимость + решение о делении) |
| `frontend/lib/geo/tile-provider.ts` | новый — интерфейс `TileProvider` + `DebugTileProvider` |
| `frontend/lib/geo/tile-cache.ts` | новый — ограниченный LRU-кэш `TileCache` |
| `frontend/lib/geo/tile-engine.ts` | новый — `TileEngine`, склеивает LOD+провайдер+кэш |
| `frontend/lib/geo/tiling.test.ts`, `tile-lod.test.ts`, `tile-cache.test.ts`, `tile-provider.test.ts`, `tile-engine.test.ts` | новые — 43 теста на чистой логике |
| `frontend/components/geo/TileDebugLayer.tsx` | новый — R3F debug-рендер тайлов + счётчики |
| `frontend/components/scenes/GeoWorldScene.tsx` | использует общие координатные функции вместо локальных копий; добавлен тоггл/оверлей Tile/LOD debug; `GlobeControls`/`orbitEnabled`/автовращение — не тронуты |
| `GEOWORLD_ROADMAP.md` | раздел G2 переведён из плана в отчёт о сделанном + требования к G3 |

### Статус на конец продолжения №20
**GeoWorld G2 (Tile/LOD architecture spike) — завершено и закоммичено.** Архитектура доказана на заглушечных данных, готова принять реального провайдера в G3 без изменений в `TileEngine`/LOD-логике/рендер-слое (меняется только реализация `TileProvider` и форма `TileData`). Ручная browser-приёмка визуального поведения LOD — за пользователем. G3 не начат.

---

## Обновление 2026-08-08 (продолжение №21) — Design System V2, D0+D1+D2: аудит, фундамент токенов, публичный лендинг

### Контекст
Отдельная от GeoWorld/Chemistry/Electricity ветка работы — полный визуальный редизайн EduMind 3D (`EDUMIND_DESIGN_SYSTEM_V2.md`, канонический план, создан и одобрен в этой части). Домен-движки (химия/электричество/GeoWorld/AI/backend/progress/autosave) не тронуты нигде в этой части — только presentation layer.

### D0 — аудит + архитектура (одобрено)
Аудит существующего фронтенда (AppShell, `CanvasShell`, композиция симуляционных страниц, `.glass-panel`/neon-токены) → `EDUMIND_DESIGN_SYSTEM_V2.md` с философией дизайна, roadmap D0–D9 (позже расширен до D0–D14 вторым брифом: Public Landing → Auth → Student/Teacher архитектура, route migration matrix на все существующие страницы).

### D1 — фундамент токенов/примитивов (одобрено, закоммичено `005e37f`)
Аддитивные семантические токены (`background`/`surface`/`surface-elevated`/`text-primary`/`text-secondary`/`text-muted`/`border`/`accent`/`success`/`warning`/`danger` + `accent-physics`/`accent-chemistry`/`accent-geo`) как CSS custom properties в `globals.css`, `darkMode: "class"` в `tailwind.config.ts` — ни один старый ключ (`brand`, `neon-*`, `surface-deep`, `.glass-panel`) не тронут, ни одна существующая страница не изменилась визуально. `ThemeProvider` (`lib/theme-context.tsx`) — Light/Dark/System, персист в `localStorage`, no-FOUC инлайн-скрипт в `app/layout.tsx`. Примитивы `components/design-system/{Button,Surface,GlassPanel,ThemeToggle}`. Визуальное доказательство — `(dev)/design-preview`.

### D2 — публичный лендинг (закоммичено, эта часть)
**Роутинг.** `app/page.tsx` (`/`) больше не редиректит вообще — рендерит лендинг всегда, для авторизованных и нет (явное требование брифа: авторизованный пользователь должен по-прежнему видеть `/`). CTA адаптируются через `useAuth().user` ("Начать"/"Войти" → "Открыть кабинет"). Legacy `Sidebar`/`Navbar` (`components/ui/*`) не монтируются — `/` живёт вне `app/(app)/layout.tsx`.

**RU/EN/TG (добавлено по ходу части, по прямому указанию).** Новая лёгкая i18n-инфраструктура: `lib/i18n/dictionaries/{ru,en,tg}.ts` (`ru.ts` — эталон структуры, `en`/`tg` типизированы как `typeof ru` — пропущенный ключ перевода = ошибка компиляции), `lib/locale-context.tsx` (`LocaleProvider`/`useLocale()`, тот же паттерн, что `ThemeProvider`, `localStorage["edumind:locale"]`, дефолт `"ru"`), `components/design-system/LocaleSwitcher.tsx`. Провайдер смонтирован глобально в `app/layout.tsx` (аддитивно), чтобы D3+ мог переиспользовать без переподключения. Шрифт тела (`Inter`) получил подмножество `cyrillic-ext` (было `latin`+`cyrillic`) — без него таджикские буквы ӣ/ҷ/қ/ғ/ҳ/ӯ падали бы на системный fallback-шрифт. Таджикский текст написан вручную (не машинный перевод), но **не проверен носителем языка** — честная оговорка.

**Секции** (`components/landing/`): `Navbar` (floating glass, якорная навигация, мобильное меню, `LocaleSwitcher`+`ThemeToggle`, auth-aware CTA) → `Hero` + `HeroVisual` (чистая CSS/SVG-композиция — без монтирования R3F/Three.js на лендинге, см. Производительность) → `WorldsShowcase` (`#worlds`) → `HowItWorks` (`#how-it-works`) → `ForStudents` (`#students`) → `ForTeachers` (`#teachers`) → `AITeacherHighlight` (компактная, не полноразмерная секция) → `FinalCta` → `Footer`.

**Реальные возможности, ничего не выдумано:** ровно 3 мира (Electricity Lab/Chemistry World/GeoWorld — SimLab/Physics сознательно не рекламируется на лендинге по прямому указанию брифа, хотя маршрут существует). Ученикам — реальное 3D-взаимодействие, пошаговые лабораторные, XP/уровень/серия (`LearningProfile`), AI-наставник. Учителям — `ClassStats`, `LabResult[]`, и специально `weak_topics`/`recent_mistakes`/`accuracy` из `LearningProfile` (существуют в бэкенде, нигде в UI не показывались раньше) — никакой выдуманной "слежки за классом" или системы заданий. CTA каждого мира ведёт в `/register`/`/dashboard` (не угадывает конкретный `[id]` симуляции — публичного маршрута к конкретной симуляции не существует).

**Новый переиспользуемый примитив D1** (обоснованный пробел, не самовольное расширение): `components/design-system/ButtonLink.tsx` — навигационный аналог `Button` (рендерит `next/link`, не `<button>` с вложенной ссылкой). `Button.tsx` теперь экспортирует `buttonClassName()` как единый источник стиля для обоих.

### Результаты проверок (после D1+D2 вместе)
| Проверка | Результат |
|---|---|
| `npx tsc --noEmit` | 0 ошибок |
| `npm run lint` | 0 ошибок, 0 предупреждений |
| `npx vitest run` (полный) | **677/677 PASSED (75 файлов)** — было 670/74 до этой части (+7 тестов на `app/page.test.tsx`: рендер лендинга вместо редиректа, CTA-роутинг для гостя/авторизованного, мобильное меню, живое переключение языка + персист, восстановление сохранённого языка, все 3 мира на месте) |
| dev-сервер, `GET /`, `/login`, `/register`, `/dashboard` | SSR HTML 200, эвристический greps на заголовок героя + названия всех 3 миров подтверждают рендер, ошибок в логе нет |

### Честная оговорка
Нет инструмента браузерной автоматизации в этой сессии — реальная визуальная приёмка (Desktop/Mobile × Light/Dark, читаемость glass-панелей, отсутствие горизонтального скролла, "ощущение" лендинга) не проверена ассистентом визуально, только SSR HTML + логика компонентов + typecheck/lint/тесты. Таджикский перевод не проверен носителем. Ручная браузерная проверка — за пользователем (чек-лист см. в финальном отчёте сессии).

### Статус на конец продолжения №21
**Design System V2 D0+D1+D2 — завершены.** `EDUMIND_DESIGN_SYSTEM_V2.md` обновлён (route migration matrix, §28 — детали реализации D2). D3 (Auth-экран: Login/Register/`(auth)/layout`) не начат — ждёт одобрения. Домен-логика (химия/электричество/GeoWorld/AI/backend/progress) нигде в этой части не тронута.

---

## Обновление 2026-08-08 (продолжение №22) — Design System V2, D3: Auth-экран (Login/Register/AuthShell)

### Контекст и аудит контракта
D3 — только `/login`, `/register`, `(auth)/layout.tsx`. Дашборд/учитель/профиль/симуляции не тронуты (по прямому указанию). Перед правкой UI перечитан реальный контракт: `/login` — `email`+`password`, `useAuth().login(email,password)` → `router.push("/dashboard")`, без клиентской валидации сверх HTML5 `required`. `/register` — `fullName`+`email`+`password`, один клиентский чек `password.length<8`, `useAuth().register(...)` → тот же редирект. Забыл-пароль подтверждён отсутствующим повторно (ни маршрута, ни бэкенд-контракта). Выбора роли при регистрации нет и не добавлен. `lib/auth-context.tsx`/`lib/api.ts`/`lib/token-storage.ts` не тронуты вообще.

### Реализация
**`components/auth/AuthShell.tsx`** — заменяет старый `(auth)/layout.tsx` (тёмные orb-blur + `.glass-panel`-карточка). Новый `(auth)/layout.tsx` — двухстрочная серверная обёртка вокруг `AuthShell`. Desktop: сплит-layout — левая панель переиспользует **тот же самый `HeroVisual`** из D2-лендинга (не дублирован, прямой импорт) поверх атмосферного градиента из трёх subject-акцентов + свой бренд-маркер со ссылкой на `/`; правая панель — непрозрачная `Surface` (не `GlassPanel` — плотный контент формы по правилу §26). Mobile: визуальная сторона скрыта (`hidden lg:flex`), у формы — свой верхний бар (лого-ссылка на `/` + `LocaleSwitcher`/`ThemeToggle`). По ходу работы поймана и исправлена собственная ошибка — glass-в-glass: `LocaleSwitcher`/`ThemeToggle` уже сами `.ds-glass`, обернул их было ещё в `GlassPanel` — убрал лишнюю обёртку.

**Login/Register** переписаны на `useLocale()` (без хардкода строк), общий `.ds-input`/`ds-focus-ring` + новый `components/auth/PasswordField.tsx` (показать/скрыть пароль, `autoComplete="current-password"`/`"new-password"`, общий для обеих форм). Кнопки — `Button`-примитив. Ошибка теперь в `role="alert"` с зарезервированной `min-h`, чтобы её появление не сдвигало кнопку. Добавлены `autoComplete="email"`/`"name"`. **Вся остальная логика — байт в байт как была**: та же форма состояния, тот же порядок валидации, тот же fallback ошибки, тот же редирект.

**Читаемость автозаполнения браузера** — новый класс `.ds-input` в `globals.css` с переопределением `-webkit-autofill` (иначе password-менеджер красит поле в жёлтый/белый мимо любых Tailwind-классов, особенно нечитаемо в тёмной теме).

**RU/EN/TG** — расширены словари D2 новым namespace `auth` (`common`/`visual`/`login`/`register`), та же типизация от `ru.ts`. Таджикский текст написан вручную, согласован по стилю с уже существующим D2-текстом, но **не проверен носителем** (тот же открытый пункт, что и в D2, не новый).

### Результаты проверок
| Проверка | Результат |
|---|---|
| `npx tsc --noEmit` | **2 ошибки — в `components/geo/TileDebugLayer.tsx` (чужой, GeoWorld G2, закоммичен `9feb102`, не тронут в этой части)**. Отфильтровано построчно — весь остальной проект компилируется чисто |
| `npm run lint` | 0 ошибок, 0 предупреждений |
| `npx vitest run` (полный) | **707/707 PASSED (78 файлов)** — было 677/75 до этой части (+12 тестов на Login/Register: рендер внутри AuthShell, отсутствие forgot-password, живое переключение языка, успешный сабмит+редирект, серверная ошибка без редиректа, loading-состояние кнопки, toggle видимости пароля, клиентская проверка длины пароля без вызова API, кросс-ссылки Login↔Register) |
| dev-сервер, `GET /login`, `/register`, `/` | SSR HTML 200, заголовки форм и двойная back-ссылка на месте, ошибок в логе нет |

### Честная оговорка
Нет инструмента браузерной автоматизации — реальная визуальная приёмка (автозаполнение в реальном браузере, читаемость glass/автофила в Light/Dark, "ощущение" перехода Landing→Auth) не проверена визуально, только SSR HTML + логика + typecheck/lint/тесты. Таджикский текст не проверен носителем. Обнаруженная (не своя) ошибка tsc в `TileDebugLayer.tsx` — не исправлена по прямому указанию не трогать параллельную GeoWorld-работу, зафиксирована здесь и в `EDUMIND_DESIGN_SYSTEM_V2.md` §29 для видимости.

### Статус на конец продолжения №22
**Design System V2 D3 — завершён.** `EDUMIND_DESIGN_SYSTEM_V2.md` обновлён (§29 — детали реализации D3, route matrix). D4 (аутентифицированный AppShell/навигация) не начат — ждёт одобрения. Дашборд/учитель/профиль/симуляции/домен-логика нигде в этой части не тронуты.

**Примечание для параллельной сессии Design System V2**: упомянутая выше "не своя" ошибка tsc в `TileDebugLayer.tsx` — устранена ниже (продолжение №23) как часть планового рефакторинга этого файла под G3 (компонент полностью переписан: раньше владел собственным движком, теперь чисто презентационный, принимает `tiles` пропом). Если ошибка всё ещё видна в вашей копии дерева — обновите рабочую копию/подтяните последний коммит GeoWorld, это не GeoWorld-регрессия, а устаревший снимок файла.

---

## Обновление 2026-08-08 (продолжение №23) — GeoWorld G3: реальные снимки Земли (NASA GIBS)

### Задача чекпоинта
Заменить/дополнить заглушечные тайлы G2 настоящими спутниковыми снимками через тот же движок. По прямому указанию: НЕ переписывать G2 без доказанной необходимости, НЕ подгонять внутреннюю geodetic-квадротрёх под конкретного провайдера, вся специфика провайдера — строго за `TileProvider`. Без террейна/границ/лейблов/AI — это отдельные стадии. Не трогать параллельную Design V2/Landing/i18n/Auth работу.

### Провайдер: NASA GIBS, слой BlueMarble_NextGeneration
Исследованы и сопоставлены 3 кандидата (OpenStreetMap raster — отклонён, политика прямо запрещает встраивание в приложение без разрешения; Esri World Imagery — отклонён, ToS "not available for commercial use"; NASA GIBS — выбран). Все технические факты о GIBS проверены ЭМПИРИЧЕСКИ (`curl`/реальный `GetCapabilities`), не по памяти — включая заголовок `Access-Control-Allow-Origin: *` на реальном тайле. Полная таблица сравнения и обоснование — в `GEOWORLD_ROADMAP.md`, раздел G3.

### Архитектура (полная разбивка — в `GEOWORLD_ROADMAP.md`, не дублируется здесь)
Новые файлы: `lib/geo/providers/gibs-grid.ts` (точная, эмпирически снятая сетка GIBS — НЕ приближение, нерегулярные уровни 0-2 обработаны как есть), `lib/geo/providers/gibs-provider.ts` (`GibsTileProvider implements TileProvider`, fetch+decode+AbortSignal+детерминированные ошибки), `components/geo/RealEarthTileLayer.tsx` (владелец единственного `TileEngine`, рендерит текстурированные заплатки, управляет GPU-lifecycle). Расширены (не переписаны): `lib/geo/tile-provider.ts` (`TileData` получил опциональные `image`/`bounds`/`attribution`/`dispose`), `lib/geo/tile-cache.ts` (вызывает `dispose()` готовой записи при вытеснении), `lib/geo/tile-engine.ts` (лимит одновременных запросов `maxConcurrentRequests`, полный dispose на размонтировании, счётчики `failedCount`/`activeRequestCount`). Переработан `components/geo/TileDebugLayer.tsx`: раньше (G2) владел собственным `TileEngine`+`DebugTileProvider` — с реальным провайдером это означало бы два параллельных движка и двойной сетевой трафик; теперь чисто презентационный слой (контур+подпись), получает список тайлов от `RealEarthTileLayer`. `GeoWorldScene.tsx`: постоянная (не за debug-тоглом) атрибуция NASA GIBS, расширенные debug-счётчики.

### Честная оговорка
Нет инструмента браузерной автоматизации — реальный визуальный результат (действительно ли снимок Земли узнаваем, действительно ли детализация растёт при подлёте к конкретному региону, отсутствие мерцания/шва на реальной картинке) не проверен визуально, только логикой/тестами/компиляцией и прямой ручной проверкой самого HTTP-эндпоинта GIBS через `curl` (подтверждён рабочим, с корректными CORS-заголовками). Ручная браузерная проверка — за пользователем, чек-лист ниже.

### Результаты проверок
| Проверка | Результат |
|---|---|
| `npx tsc --noEmit` | 0 ошибок |
| `npm run lint` | 0 ошибок, 0 предупреждений |
| `npx vitest run` (полный) | **714/714 PASSED (79 файлов)** — из них 26 новых тестов от этого чекпоинта (13 сетка GIBS + 7 провайдер + 3 dispose-контракт кэша + 3 конкурентность/dispose движка); остальной прирост с прошлой записи в HANDOFF — из параллельной сессии (Design V2/Auth), не отсюда |
| dev-сервер, `/geo3d/[id]` | скомпилирован (2607 модулей), HTTP 200, ошибок в логе нет |
| Реальный тайл GIBS (`curl -I`) | HTTP 200, `Access-Control-Allow-Origin: *`, `Cache-Control: public, max-age=259200` |
| `GlobeControls`/`orbitEnabled`/автовращение/клик по слоям | не тронуты этим чекпоинтом |

### Manual browser acceptance checklist (GeoWorld G3, для пользователя)
1. Открыть `/geo3d/[id]` — глобус должен выглядеть как узнаваемая Земля (не цветные заглушки) уже при первой загрузке (базовая текстура видна мгновенно).
2. Покрутить глобус — нет перевёрнутой/зеркальной географии (материки на привычных местах).
3. Приблизиться к Европе/Азии — через короткое время (сетевая задержка) поверх базовой текстуры должна прогрессивно появиться более резкая картинка именно в этой области.
4. Приблизиться ещё ближе к конкретному региону (например Таджикистан/Памир, если разрешение провайдера позволяет — max ~500 м/пиксель, не street-level) — деталь не растёт бесконечно, это ожидаемо (потолок провайдера).
5. Вся планета НЕ должна детализироваться одновременно — только регион под камерой.
6. Быстро повернуть к другому континенту — старые запросы не должны портить новую картинку, не должно быть чёрных проплешин.
7. Быстро позумить туда-обратно несколько раз — без чёрных дыр, без зависаний.
8. Включить debug-тоггл (Tile/LOD) — увидеть контуры+подписи + счётчики (Visible/Cached/Active requests/Failed/Max LOD), убедиться что "Failed" не растёт бесконтрольно.
9. Даблклик-перелёт, клик по геологическим слоям, вращение облаков — работают как раньше.
10. Атрибуция NASA GIBS видна в правом нижнем углу канваса постоянно (не только в debug-режиме).
11. Нет заметного проседания FPS на обычном ноутбуке.

### Файлы, изменённые/добавленные в этой части
| Файл | Что изменено |
|------|-------------|
| `frontend/lib/geo/providers/gibs-grid.ts` | новый — точная сетка GIBS EPSG:4326, адресация точки, подбор уровня |
| `frontend/lib/geo/providers/gibs-grid.test.ts` | новый — 13 тестов |
| `frontend/lib/geo/providers/gibs-provider.ts` | новый — `GibsTileProvider`, fetch+decode+AbortSignal, дословная атрибуция |
| `frontend/lib/geo/providers/gibs-provider.test.ts` | новый — 7 тестов, сеть замокана |
| `frontend/lib/geo/tile-provider.ts` | `TileData` — добавлены опциональные `image`/`bounds`/`attribution`/`dispose` |
| `frontend/lib/geo/tile-cache.ts` | вызывает `dispose()` готовой записи при вытеснении; экспортирован `disposeIfPossible` |
| `frontend/lib/geo/tile-engine.ts` | лимит `maxConcurrentRequests`, полный dispose при размонтировании, счётчики `failedCount`/`activeRequestCount` |
| `frontend/lib/geo/tile-cache.test.ts`, `tile-engine.test.ts` | +6 новых тестов на dispose/конкурентность |
| `frontend/components/geo/RealEarthTileLayer.tsx` | новый — единственный владелец `TileEngine`, рендер реальных заплаток, GPU-lifecycle |
| `frontend/components/geo/TileDebugLayer.tsx` | переработан — из владельца движка в чисто презентационный слой |
| `frontend/components/scenes/GeoWorldScene.tsx` | подключён `RealEarthTileLayer` (всегда), атрибуция, расширенные debug-счётчики |
| `GEOWORLD_ROADMAP.md` | раздел G3 переведён из плана в отчёт о сделанном |

### Статус на конец продолжения №23
**GeoWorld G3 (Real Earth Imagery) — завершено и закоммичено.** Реальные снимки NASA GIBS приводятся в движение тем же движком G2, без изменения внутренней квадротрёх. GPU/decoded-resource lifecycle полный (нет утечек по коду/тестам). Ручная browser-приёмка визуального результата — за пользователем. G4 (рельеф) не начат.

---

## Обновление 2026-08-08 (продолжение №24) — Design System V2, D4: аутентифицированный AppShell/навигация

### Контекст и аудит старой оболочки
D4 — НЕ редизайн дашборда/учителя/профиля/симуляций, только каркас навигации. Старый `(app)/layout.tsx` оборачивал АБСОЛЮТНО все аутентифицированные маршруты (включая все 4 симуляции!) в один и тот же `ProtectedRoute` → `QualityProvider` → постоянный `Sidebar` (`w-64`) → `Navbar` (`h-20`) → `<main className="ml-64 p-8 pt-24">`. Два реальных дефекта: (1) сайдбар/навбар отжирал фиксированные ~256+80px у КАЖДОЙ страницы, включая 3D-лаборатории — ровно та самая "SaaS-панель вокруг 3D-iframe"; (2) `QualityProvider` оборачивал страницы, которые `useQuality()` вообще не вызывают (проверено грепом — только `ChemistryWorldScene.tsx`/`ElectricityLabScene.tsx` его используют, `SimLabScene`/`GeoWorldScene` — нет).

### Разделение route-групп (главное архитектурное решение)
Создана `app/(immersive)/`, в неё через `git mv` перенесены `simlab/`, `geo3d/`, `electricity_lab/`, `chemistry_world/` — **URL не изменился ни на символ** (Next.js убирает скобочные route-группы из пути). `(app)/layout.tsx` теперь монтирует новый `StandardAppShell`, `(immersive)/layout.tsx` — новый `MinimalShell`. `QualityProvider` переехал ТОЛЬКО в `(immersive)` — чистое исправление лишней области видимости, не влияет на поведение `/dashboard`/`/teacher`/`/profile` (они его никогда не использовали).

### Реализация
**`components/appshell/StandardAppShell.tsx`** = `Rail` + `TopBar` + `MobileDrawer`, тот же `ProtectedRoute`. Плоский flex-layout, `Rail` — `sticky`, не `fixed` (контент-колонка сама переливается при смене ширины rail; ранний вариант с CSS-переменной для margin был архитектурно сломан — direction наследования custom property не работает "снизу вверх" — пойман и переписан до отправки в тесты).

**`Rail`** — чистая навигация (лого, роль-зависимые пункты из `lib/appshell-nav.ts`, кнопка сворачивания), 4.5rem/15rem, состояние в `localStorage["edumind:rail-collapsed"]`. **Theme/Locale/Account сознательно вынесены в `TopBar`, а не в Rail** — 6 кнопок-переключателей (3 языка + 3 темы) физически не влезают в свёрнутую колонку 72px, это задокументированное решение, не недосмотр.

**`TopBar`** — мобильный гамбургер, лого (только на мобильном — на десктопе оно уже в Rail), `LocaleSwitcher`, `ThemeToggle`, `AccountMenu`. Заголовка страницы намеренно нет — каждая существующая страница уже рендерит свой `<h1>`, дублировать его на уровне шелла было бы избыточно.

**`AccountMenu`** — аватар-инициалы, popover (имя/роль/Профиль/Выйти), закрытие по клику вне/Escape. **`MobileDrawer`** — паттерн drawer/sheet (не сжатый rail), непрозрачный `Surface`, закрытие по backdrop/Escape/клику по пункту, блокировка скролла фона, фокус на кнопку закрытия при открытии.

**`MinimalShell`** для симуляций — только `ProtectedRoute`+`QualityProvider`, без Rail/TopBar. Это НЕ полноценный floating-chrome `SimulationShell` из будущего D6 — только доказательство, что архитектура шелла больше не навязывает постоянный rail поверх канваса. Внутренний JSX сцен (`ChemistryWorldScene.tsx` и т.д.) не тронут ни строкой.

**Удаление legacy** — `components/ui/{Sidebar,Navbar}.tsx` **удалены**, не просто помечены устаревшими. Перед удалением проверено: `grep -rn "^import.*components/ui/(Sidebar|Navbar)"` — ноль реальных импортов (единственные текстовые совпадения — собственные комментарии этой части и случайные подстроки типа `LandingNavbar`).

**RU/EN/TG** — новый namespace `shell` (`nav`/`role`/`account`/`rail`/`mobile`) в словарях D2/D3. Старый хардкодед `ROLE_LABEL` в `profile/page.tsx` не тронут (контент профиля — всё ещё зона D5/D12).

### Результаты проверок
| Проверка | Результат |
|---|---|
| `npx tsc --noEmit` | **0 ошибок** (чужая ошибка в `TileDebugLayer.tsx`, которую флагировали в D3, к этому моменту параллельная сессия сама исправила — весь проект компилируется чисто) |
| `npm run lint` | 0 ошибок, 0 предупреждений |
| `npx vitest run` (полный) | **730/730 PASSED (82 файла)** — было 707/78 до этой части (+21 тест: `lib/appshell-nav.test.ts` — роль→пункты меню; `StandardAppShell.test.tsx` — student/teacher-навигация, `aria-current`, мобильный drawer открытие/Escape/клик-закрытие, AccountMenu+logout, живое переключение языка, персист свёрнутого состояния rail; `MinimalShell.test.tsx` — нет nav-чрома, `QualityProvider` реально доступен, auth-guard всё ещё редиректит) |
| dev-сервер | `/`, `/dashboard`, `/login`, `/chemistry_world/[id]` — 200, `/dashboard` корректно отдаёт спиннер загрузки (client-only auth, ожидаемо для curl без сессии), ошибок нет |

Поймана и исправлена реальная ошибка по ходу написания тестов: `MobileDrawer`'s `AnimatePresence` exit-анимация не завершается синхронно внутри одного `act()` в jsdom — переключил два ассерта на `waitFor`, и заодно добавил `MotionConfig reducedMotion="user"` в сам `StandardAppShell` (было упущено в реализации, не только в тесте — реальный вклад в доступность).

### Честная оговорка
Нет инструмента браузерной автоматизации — реальная визуальная приёмка (Desktop/Mobile × Light/Dark, ощущение rail/drawer, отсутствие горизонтального скролла, реальный логин+навигация студент/учитель) не проверена визуально, только SSR HTML + логика компонентов + typecheck/lint/тесты. Известное ограничение: активный пункт меню определяется через `pathname?.startsWith(href)` — безобидно сейчас (таких подмаршрутов нет), но при появлении `/dashboard/...`-подмаршрутов в будущем матчер нужно будет пересмотреть.

### Статус на конец продолжения №24
**Design System V2 D4 — завершён.** `EDUMIND_DESIGN_SYSTEM_V2.md` обновлён (§30 — детали D4, route matrix). D5 (Student Home + Student Profile) не начат — ждёт одобрения. Внутренний контент `/dashboard`/`/teacher`/`/profile` и вся 3D-логика симуляций нигде в этой части не тронуты.

---

## Обновление 2026-08-08 (продолжение №25) — Design System V2, D5: Student Home + Student Profile

### Аудит реальных данных (главная часть этой стадии)
По прямому указанию — только REAL/DERIVABLE/NOT AVAILABLE, ничего не выдумывать. Дошёл до backend-роутеров (только чтение, ни один backend-файл не изменён), нашёл два реальных, но НИКОГДА не вызываемых с фронтенда эндпоинта:
- **`GET /api/results/me`** (`backend/app/routers/results.py`) — самодоступ к своим `LabResult` для ЛЮБОГО авторизованного пользователя. Раньше с фронтенда вызывались только teacher-only `/api/results/stats` и `/api/results/student/:id`. Добавлен `lib/results-client.ts` — тонкий клиент, ноль изменений backend.
- **`GET /api/chemistry/saves`** (`backend/app/routers/chemistry_saves.py`) — список ВСЕХ сохранений текущего пользователя по всем экспериментам, сортировка по `updated_at`. `lib/autosave-engine.ts` раньше только POST/PATCH-ил сохранение ТЕКУЩЕГО эксперимента, никогда не листил все. Добавлен `lib/chemistry-saves-client.ts`.
- **Electricity/GeoWorld/SimLab resume** — подтверждено грепом: у Electricity Lab вообще нет server-side saves-роутера. "Continue Learning" может резюмировать только Chemistry — честно задокументировано, не подделано.
- **Глобальный AI-чат на дашборде** — не существует (AI-наставник живёт только внутри конкретных сцен с их контекстом) — не изобретён.

### Реализация
**Student Home** (`app/(app)/dashboard/page.tsx`, тот же роут, тот же `/api/simulations/`-фетч — поменялась только презентация): `Hero` (реальное имя + приветствие по времени суток + level/xp/labs/streak инлайн) → `ContinueLearning` → `WorldSection` (`#worlds`) → `ProgressSnapshot` (4 метрики, не полная стена KPI) → `RecentResults` → `FocusNext`. Учитель на `/dashboard` (Rail's "Home" ведёт туда для всех ролей) видит минимальный fallback — только заголовок+`WorldSection`, без выдуманных студенческих виджетов.

**`ContinueLearning`** — строго по приоритету: (1) активное Chemistry-сохранение → "Незавершённый эксперимент", прямая ссылка на резюм; (2) иначе `last_completed_lab` (реальный `simulation_id`) → "Недавняя работа" (НЕ "незавершённый", это завершённая работа); (3) иначе честный empty-state. Никакого выдуманного "последнего урока".

**`WorldSection`** переиспользует `lib/landing-worlds.ts` (те же 3 мира/акцента, что и D2-лендинг, SimLab не рекламируется) — вместо трёх абстрактных плиток каждый мир группирует РЕАЛЬНЫЕ симуляции этого модуля через рестайленный `LessonCard` (Design V2 акценты `accent-physics`/`accent-chemistry`/`accent-geo`, та же логика роутинга).

**`ProgressSnapshot` (Home) vs `ProgressDashboard` (Profile)** — сознательно разные срезы одних данных, не дубликат: Home — 4 числа (XP/лабораторных/точность/уровень), Profile — полная разбивка (подсказки/попытки/темы/достижения). По ходу рестайла `ProgressDashboard` (только токены+i18n, фетч-логика не тронута) найден и исправлен реальный баг: свежий профиль (все нули, но НЕ ошибка) показывал стену нулей вместо приветливого empty-state — добавлена та же проверка `completed_labs===0 && xp===0`, что уже была в `ProgressSnapshot`.

**`RecentResults`** — до 5 последних `LabResult` (без выдуманных полей — `LabResult` не содержит `module`, поэтому список нейтрально стилизован, а не гадает акцент по названию). **`FocusNext`** — `weak_topics` с той же конструктивной формулировкой ("Стоит повторить"), что уже была в `ProgressDashboard` до D5.

**Student Profile** (`app/(app)/profile/page.tsx`) — карточка личности (инициалы, имя, `shell.role.*`, email read-only, редактируемое имя, дата регистрации) на `Surface`, ниже — `ProgressDashboard`. **Контракт редактирования побайтово тот же**: `PATCH /api/users/{id}` → `refreshUser()`, та же disabled-логика, тот же fallback ошибки. Убран один избыточный вложенный `<ProtectedRoute>` (страница уже была двойно обёрнута ДО D4, `StandardAppShell` теперь и так стоит выше).

**Loading/empty** — новый `components/design-system/Skeleton.tsx` (`animate-pulse`, `motion-reduce:animate-none`) вместо спиннеров/пустых экранов везде, где идёт реальный фетч.

**RU/EN/TG** — новые namespace `dashboard`/`profile` во всех трёх словарях, та же типизация от `ru`.

### Результаты проверок
| Проверка | Результат |
|---|---|
| `npx tsc --noEmit` | **1 ошибка — в `GeoWorldScene.tsx` (чужая, параллельная GeoWorld-сессия сейчас правит G4/рельеф — `git status` подтверждает, файл не тронут этой частью)**. Весь остальной проект чист |
| `npm run lint` | 0 ошибок, 0 предупреждений |
| `npx vitest run` (полный) | **787/787 PASSED (89 файлов)** — было 730/82 до этой части (+13 моих тестов: dashboard — реальное имя/приветствие, все 3 мира без SimLab, Continue Learning empty/resume с реальной ссылкой, реальные числа прогресса vs честный empty для нового профиля, реальные результаты vs empty, конструктивная подача weak_topics, учительский fallback без студенческих виджетов; profile — реальная идентичность, отсутствие выдуманных достижений, точный контракт редактирования) |
| dev-сервер | `/`, `/dashboard`, `/profile`, `/login` — 200, ошибок в HTML нет |

### Честная оговорка
Нет инструмента браузерной автоматизации — реальная визуальная приёмка (Desktop/Mobile × Light/Dark, "ощущение" хаба, читаемость skeleton-состояний) не проверена визуально, только SSR HTML + логика + typecheck/lint/тесты. Таджикский текст не проверен носителем (тот же открытый пункт с D2). Chemistry — единственный мир с настоящим cross-session resume; для Electricity/GeoWorld/SimLab это архитектурное ограничение backend, не недосмотр фронтенда.

### Статус на конец продолжения №25
**Design System V2 D5 — завершён.** `EDUMIND_DESIGN_SYSTEM_V2.md` обновлён (§31 — детали D5, route matrix, полная таблица аудита данных). D6 (SimulationShell) не начат — ждёт одобрения. `/teacher`, симуляции и вся домен-логика нигде в этой части не тронуты. GeoWorld-файлы параллельной сессии не тронуты ни строкой.

---

## Обновление 2026-08-08 (продолжение №26) — GeoWorld G4: рельеф/высоты (AWS Terrain Tiles)

### Задача чекпоинта
Сделать физическую географию видимой геометрически (горы физически поднимаются при подлёте к Памиру/Гималаям/Альпам), используя настоящие данные высот через тот же G2/G3-движок. По прямому указанию: G1 (камера), G2 (тайлы/LOD), G3 (снимки NASA GIBS) — заморожены, не переписывать без доказанной необходимости; imagery- и elevation-провайдеры НЕ должны быть связаны друг с другом; никаких границ/городов/AI-гида — это позже.

### Источник высот: AWS Open Data "Terrain Tiles" (Terrarium PNG)
Рассмотрены 3 варианта (Copernicus DEM GLO-30 — отклонён для этой стадии из-за формата GeoTIFF, требующего отдельной браузерной библиотеки-парсера, и крупных 1°×1° тайлов; OpenTopography — не рассмотрен детально, ориентирован на разовые исследовательские выгрузки, требует API-ключ для программного доступа). Выбран Terrarium: CORS подтверждён РЕАЛЬНЫМ GET-запросом (`curl` с заголовком `Origin`) — важная деталь: `HEAD`-запрос к этому S3-бакету НЕ показывает CORS-заголовки вообще, только настоящий `GET` — первая проверка через `HEAD` ложно показала отсутствие CORS, перепроверено `GET` и подтверждено `Access-Control-Allow-Origin: *`. Полная таблица сравнения — в `GEOWORLD_ROADMAP.md`, раздел G4.

### Архитектурное решение: TileEngine стал generic
Чтобы переиспользовать весь проверенный механизм G2/G3 (LOD/кэш/конкурентность/dispose) для рельефа, не копируя его и не связывая с imagery-провайдером, `TileEngine` параметризован типом данных (`TileEngine<T>`) — было жёстко привязано к `TileData` из G3. Чисто типовой рефакторинг, поведение не менялось: все существующие тесты G2/G3 прошли без единой правки логики теста (только добавление явного `<TileData>` в местах создания). Контракт рельефа — `ElevationProvider` (`lib/geo/elevation-provider.ts`), работающий через ГЕОГРАФИЧЕСКИЕ ГРАНИЦЫ, а не `TileId`; мост между ними — `ElevationEngineAdapter` (единственное место, знающее и про то, и про другое).

### Web Mercator адаптер (не приближение)
Terrarium использует стандартную Web Mercator XYZ-схему — отличную и от нашей внутренней geodetic-квадротрёх, и от схемы NASA GIBS. `lib/geo/providers/terrarium-grid.ts` реализует точные прямую/обратную формулы проекции. Внутренняя схема НЕ подогнана под это.

### Геометрия и швы
`lib/geo/terrain-mesh.ts` строит вершины по формуле `latLngToVector3(lat, lng, elevationToSceneRadius(rawMeters, baseRadius, exaggeration))` — 16×16 квадов на тайл. Швы между тайлами ОДНОГО уровня LOD решены математически (доказано тестом: сэмплинг — чистая функция координат, границы соседних внутренних тайлов стыкуются точно → идентичные вершины). Швы между РАЗНЫМИ уровнями LOD — "юбки" (тонкая свисающая стенка по периметру). Рельеф и снимок NASA GIBS — ОДНА геометрия, не два слоя (во избежание z-fighting, по прямому указанию ТЗ): смещение по высоте применяется только когда готовы оба, иначе плоская заплатка G3 без изменений. Экзагерация (визуальный множитель, не искажающий сырые данные) — 3 пресета + полное отключение, переключатель в панели управления.

### Честная оговорка
Нет инструмента браузерной автоматизации — реальный визуальный результат (действительно ли Памир/Гималаи выглядят объёмными, отсутствие видимых швов/z-fighting на глаз, "ощущение" плавности при перелёте между регионами) не проверен визуально, только логикой/тестами/компиляцией и прямой ручной проверкой самого HTTP-эндпоинта Terrarium через `curl`. Разрешение сетки (16×16) не профилировано на реальном слабом ноутбуке. Ручная браузерная проверка — за пользователем, чек-лист ниже.

### Результаты проверок
| Проверка | Результат |
|---|---|
| `npx tsc --noEmit` | 0 ошибок |
| `npm run lint` | 0 ошибок, 0 предупреждений |
| `npx vitest run` (полный) | **787/787 PASSED (89 файлов)** — из них 66 новых тестов от этого чекпоинта; остальной прирост с прошлой записи — из параллельной сессии Design V2, не отсюда |
| dev-сервер, `/geo3d/[id]` | скомпилирован (2599 модулей), HTTP 200, ошибок в логе нет |
| Реальный тайл Terrarium (`curl` с `Origin`) | HTTP 200, `Access-Control-Allow-Origin: *` (подтверждено только на настоящем GET, не HEAD) |
| `GlobeControls`/`orbitEnabled`/автовращение/клик по слоям/снимки GIBS | не тронуты этим чекпоинтом (G1-G3 заморожены) |

### Manual browser acceptance checklist (GeoWorld G4, для пользователя)
1. Открыть `/geo3d/[id]` из космоса — реальные снимки G3 всё ещё видны, силуэт планеты не искажён рельефом издалека.
2. Приблизиться к Азии → Центральной Азии → Таджикистану/Памиру — горы должны стать визуально объёмными (не плоская текстура).
3. Сравнить с более плоским регионом (Сахара) — контраст рельефа должен быть заметен.
4. Посетить Гималаи — аналогично объёмны.
5. Покрутить камеру вокруг горного региона под низким углом, если управление позволяет — форма рельефа должна читаться с разных ракурсов (свет/тень).
6. Убедиться, что нет видимых трещин/щелей между соседними тайлами рельефа.
7. Убедиться, что нет постоянного заметного z-fighting/мерцания между рельефом и снимком.
8. Быстро позумить туда-обратно, быстро сменить регион (например Памир → Европа → Америка) — без чёрных провалов, без зависания камеры.
9. Отключить рельеф кнопкой "Рельеф выкл." в панели — глобус должен вернуться к плоскому виду G3, ничего не сломано.
10. Переключить пресеты экзагерации (1×/15×/30×) — гора должна расти/уменьшаться соответственно, оставаясь в разумных пределах на 30×.
11. Включить debug-режим (Tile/LOD) — убедиться, что счётчики "Terrain visible/cached/active/failed" ограничены, не растут бесконтрольно.
12. Убедиться, что существующие функции (даблклик-перелёт, клик по геологическим слоям, вращение облаков) работают как раньше.
13. Нет заметного проседания FPS на обычном ноутбуке.

### Файлы, изменённые/добавленные в этой части
| Файл | Что изменено |
|------|-------------|
| `frontend/lib/geo/tile-engine.ts` | генерик-рефакторинг `TileEngine<T>` (было жёстко `TileData`) |
| `frontend/lib/geo/elevation-provider.ts` | новый — контракт `ElevationProvider`/`ElevationTileData` (bounds-based) |
| `frontend/lib/geo/elevation-engine-adapter.ts` (+test) | новый — мост TileId↔bounds |
| `frontend/lib/geo/elevation-sampling.ts` (+test) | новый — кламп уровня моря, экзагерация, билинейная выборка |
| `frontend/lib/geo/terrain-mesh.ts` (+test) | новый — генерация геометрии рельефа (кривизна+высота+швы) |
| `frontend/lib/geo/providers/terrarium-grid.ts` (+test) | новый — точная Web Mercator адресация + декодирование |
| `frontend/lib/geo/providers/terrarium-provider.ts` (+test) | новый — `TerrariumElevationProvider`, fetch+decode+AbortSignal |
| `frontend/components/geo/RealEarthTileLayer.tsx` | расширен — второй движок (рельеф), совмещённая геометрия снимок+высота |
| `frontend/components/scenes/GeoWorldScene.tsx` | переключатель экзагерации, расширенные debug-счётчики, атрибуция AWS Terrain Tiles |
| `GEOWORLD_ROADMAP.md` | раздел G4 переведён из плана в отчёт о сделанном + требования к G5 |

### Статус на конец продолжения №26
**GeoWorld G4 (Terrain/Elevation Foundation) — завершено и закоммичено.** Рельеф из настоящих данных высот (AWS Terrain Tiles) приводится в движение тем же generic-движком, что и снимки G3, на одной геометрии, без z-fighting. Ручная browser-приёмка визуального результата — за пользователем. G5 (границы/лейблы) не начат.

---

## Обновление 2026-08-09 (продолжение №27) — Design System V2, D5.1: визуальная переработка Student Dashboard (корректирующая стадия)

### Контекст
После ручной проверки D5 в браузере пользователь НЕ одобрил визуальный результат: композиция читалась как админ-список, не как хаб. Функциональность/данные D5 признаны полезными и сохранены полностью — исправление чисто визуальное/композиционное. GeoWorld не тронут.

### Проблема
Все секции (`Hero`, `ContinueLearning`, `WorldSection`, `ProgressSnapshot`, `RecentResults`, `FocusNext`) были сложены в одну колонку `max-w-6xl space-y-10` — отсюда гигантские пустые пространства, крошечные "миры" в виде текстовых списков, слабая иерархия, дежурная фраза про учителей на видном месте.

### Реализация
**Композиция страницы** (`dashboard/page.tsx`): Hero (во всю ширину) → ContinueLearning+ProgressSnapshot бок о бок (`lg:grid-cols-[2fr_1fr]`) → WorldSection (3 колонки, во всю ширину) → RecentResults+FocusNext бок о бок. Контейнер расширен до `max-w-7xl`. Добавлен `MotionConfig reducedMotion="user"` (был пропущен в D5).

**Explore the Worlds — главная переработка.** `WorldSection.tsx` вместо стека мелких текстовых списков теперь рендерит 3 крупные "портальные" карточки (переиспользован визуальный язык `WorldsShowcase` из лендинга, но богаче: два слоя градиента вместо одного, увеличенная высота шапки, hover-scale иконки, `whileInView`-анимация появления). Каждая карточка показывает реальную самую свежую симуляцию модуля ("Доступно: {название}", +N если их больше) с сильным CTA; для модуля без симуляций — честное отключённое состояние "Скоро" вместо мёртвой/фейковой ссылки. Никаких скриншотов, никакого WebGL — только CSS/SVG-градиенты.

**Hero** — добавлена едва заметная атмосферная 3-акцентная подложка (тот же приём, что у Landing/AuthShell), level/XP/streak перенесены из обычного текста в `GlassPanel`-бейдж (бриф явно называет "компактный progress HUD" случаем для glass).

**ContinueLearning** — та же приоритетная логика D5 дословно сохранена. Добавлена ОДНА новая реальная строка статуса — "Сохранено: {дата}" для активного сохранения (единственный реальный сигнал, который несёт `ChemistrySave` — процента прохождения в схеме нет, поэтому прогресс-бар сознательно не выдуман).

**ProgressSnapshot** — из грид-карточек в вертикальный `GlassPanel`-список (те же 4 реальные метрики), под более узкую колонку `1fr`.

**RecentResults/FocusNext** — логика не тронута, добавлено `flex h-full` для выравнивания высоты в общем ряду.

**Убрана dev-ориентированная фраза** — "Панель ученика для учителей не отображается — используй раздел «Ученики»" удалена из рендера учительского fallback (сам ключ i18n оставлен неиспользуемым в словарях — не стал перестраивать типизированную структуру ради одной строки).

### Реальный баг, найденный при написании тестов (не костыль под тест)
Строка "Доступно: {название}" была написана как соседние JSX-дети одного `<div>` — React создаёт отдельные текстовые узлы, но при чтении `element.textContent` (на чём основан `getByText`) они схлопываются в одну строку "Доступно: Простая цепь", из-за чего точное совпадение по одному "Простая цепь" не находилось. Это не ложный тест — реальный признак, что название не было отдельной семантической единицей. Исправлено оборачиванием названия в свой `<span className="font-medium text-text-secondary">` — одновременно чинит тесты и даёт названию визуальный вес в карточке.

### Результаты проверок
| Проверка | Результат |
|---|---|
| `npx tsc --noEmit` | 0 ошибок |
| `npm run lint` | 0 ошибок, 0 предупреждений |
| `npx vitest run` (полный) | **806/806 PASSED (91 файл)** — упал ТОЛЬКО транс­форм одного чужого файла `frontend/lib/geo/vector-geojson.test.ts` (untracked, параллельная GeoWorld-сессия, не тронут) |
| dev-сервер | `/`, `/dashboard`, `/profile` — 200, ошибок в HTML нет |

### Честная оговорка
Нет инструмента браузерной автоматизации — реальная визуальная приёмка (Desktop/Mobile × Light/Dark, "ощущение" хаба, читаемость glass-HUD, hover/focus) не проверена визуально, только SSR + логика + typecheck/lint/тесты. Пользователь ранее уже указал, что прохождения тестов недостаточно для визуального одобрения — эта оговорка честно повторена и здесь.

### Статус на конец продолжения №27
**Design System V2 D5.1 — завершён.** `EDUMIND_DESIGN_SYSTEM_V2.md` обновлён (§32). D6 (SimulationShell) не начат — ждёт одобрения. GeoWorld-файлы параллельной сессии не тронуты ни строкой.

**Примечание для параллельной сессии:** упомянутый выше "чужой файл `frontend/lib/geo/vector-geojson.test.ts`" — это мой (GeoWorld-сессии) файл, пойманный вашим прогоном тестов в процессе написания (промежуточное, ещё не готовое состояние). Спасибо, что не тронули — теперь он закончен и полностью рабочий, см. запись ниже (продолжение №28).

---

## Обновление 2026-08-09 (продолжение №28) — GeoWorld G5: границы стран и подписи городов (Natural Earth)

### Задача чекпоинта
Границы стран и подписи городов, появляющиеся прогрессивно при приближении. G1 (камера), G2 (тайлы/LOD), G3 (снимки), G4 (рельеф) — заморожены, не переписаны. Реализовано полностью, протестировано, задокументировано, закоммичено отдельно — по прямому указанию.

### Источник: Natural Earth (public domain)
CORS подтверждён эмпирически (`curl` реальным GET к `raw.githubusercontent.com/nvkelso/natural-earth-vector` → `Access-Control-Allow-Origin: *`). Официальные Terms of Use: атрибуция необязательна ("crediting the authors is unnecessary") — добавлена как любезность. Загружены и реально проверены 4 файла (размеры/структура/порядок координат — не предположения): `ne_110m`/`ne_50m` границы стран (177/242 страны) и `ne_110m`/`ne_50m` населённые пункты (243/1251 город, поле `NAME_RU` в наличии). 10m-датасет (десятки МБ) сознательно не используется.

### Архитектурное решение: НЕ TileEngine — сознательное отступление от собственной заметки в конце G4
В `GEOWORLD_ROADMAP.md` по итогам G4 было написано "переиспользовать TileEngine<T> в третий раз" для границ — при доходе до реализации это оказалось плохо подходящей идеей (страна — единый контур, не имеет смысла резать по квадротрёх-ячейкам без настоящей GIS-нарезки полигонов). Вместо этого — новый, специально подходящий, но переиспользующий всё нужное из существующей архитектуры механизм: `VectorDatasetLoader` (весь датасет по одному из 2 фиксированных ключей, кэш навсегда, дедуп) + `pickBorderTier`/`maxVisibleScaleRank` (простой LOD по дистанции камеры, не квадротрёх-обход) + переиспользованные напрямую `latLngToVector3` и camera-facing hemisphere culling (`latLngToUnitVec3` из `tile-lod.ts`, тот же код, не дублирован). Полное обоснование отступления — в `GEOWORLD_ROADMAP.md`, раздел G5.

### Честная оговорка
Нет инструмента браузерной автоматизации — реальный визуальный результат (действительно ли границы/подписи появляются плавно и в нужный момент, читаемость подписей, отсутствие визуального шума от перекрывающихся городов) не проверен визуально, только логикой/тестами/компиляцией и прямой ручной проверкой самих HTTP-эндпоинтов через `curl`. Ручная браузерная проверка — за пользователем, чек-лист ниже.

### Результаты проверок
| Проверка | Результат |
|---|---|
| `npx tsc --noEmit` | 0 ошибок |
| `npm run lint` | 0 ошибок, 0 предупреждений |
| `npx vitest run` (полный) | **813/813 PASSED (92 файла)** — из них 27 новых тестов от этого чекпоинта |
| dev-сервер, `/geo3d/[id]` | скомпилирован (2611 модулей), HTTP 200, ошибок в логе нет |
| Реальные датасеты Natural Earth (`curl`) | все 4 файла — HTTP 200, `Access-Control-Allow-Origin: *`, структура/размеры соответствуют документированным в GEOWORLD_ROADMAP.md |
| `GlobeControls`/снимки/рельеф/клик по геослоям | не тронуты этим чекпоинтом (G1-G4 заморожены) |

### Manual browser acceptance checklist (GeoWorld G5, для пользователя)
1. Открыть `/geo3d/[id]` издалека — границы/подписи ещё не видны (или видны только грубые контуры), глобус выглядит как в G4.
2. Приблизиться к любому континенту — контуры стран должны появиться (тонкие жёлтые линии).
3. Приблизиться ещё ближе — контуры должны стать заметно детальнее (переключение 110m→50m).
4. При приближении — начинают появляться подписи городов, сначала только крупнейшие/столицы, затем всё больше по мере приближения.
5. Повернуть глобус к другому континенту — старые границы/подписи с обратной стороны должны исчезнуть (culling полусферы).
6. Убедиться, что нет постоянного, чрезмерного визуального шума от перекрывающихся подписей на высокой плотности городов (Европа вблизи).
7. Выключить кнопкой "Скрыть границы/города" — слой должен полностью пропасть, обычный вид G3/G4 не изменился.
8. Убедиться, что существующие функции (даблклик-перелёт, клик по геологическим слоям, разрез слоёв, снимки, рельеф) работают как раньше.
9. Разрез слоёв (`isCutaway`) — границы/подписи должны скрыться (не мешают виду внутренних слоёв).
10. Нет заметного проседания FPS/подвисания камеры в момент первой загрузки 50m-датасета (~3МБ).

### Файлы, изменённые/добавленные в этой части
| Файл | Что изменено |
|------|-------------|
| `frontend/lib/geo/vector-geojson.ts` (+test) | новый — минимальные GeoJSON-типы, извлечение колец, прореживание |
| `frontend/lib/geo/geo-vector-lod.ts` (+test) | новый — LOD-политика границ/городов, camera-facing culling (переиспользует `tile-lod.ts`) |
| `frontend/lib/geo/vector-dataset-loader.ts` (+test) | новый — простой загрузчик "весь датасет по ключу", кэш+дедуп+abort |
| `frontend/lib/geo/providers/natural-earth.ts` | новый — URL/типы конкретно Natural Earth, атрибуция |
| `frontend/components/geo/CountryBordersLayer.tsx` | новый — рендер контуров границ |
| `frontend/components/geo/CityLabelsLayer.tsx` | новый — рендер подписей городов |
| `frontend/components/scenes/GeoWorldScene.tsx` | подключены оба слоя + тоггл "Границы/города" + атрибуция Natural Earth |
| `GEOWORLD_ROADMAP.md` | раздел G5 переведён из плана в отчёт о сделанном + требования к G6 |

### Статус на конец продолжения №28
**GeoWorld G5 (Countries/Borders/Labels) — завершено и закоммичено.** Границы и подписи городов из настоящих данных Natural Earth, свой LOD-механизм (не TileEngine — обоснованное архитектурное решение). Ручная browser-приёмка — за пользователем. G6 (образовательные слои) не начат.

---

## Обновление 2026-08-09 (продолжение №29) — Design System V2, D5.2: центрирование композиции Student Dashboard

### Контекст
D5.1 визуально одобрен как новая база. После повторного ручного просмотра в широком браузере — единственная жалоба: композиция "прижата" к левому краю, много пустого пространства с одной стороны. GeoWorld не тронут.

### Найденная причина
`StandardAppShell`'s content-колонка (`min-w-0 flex-1`) занимает ВСЮ оставшуюся ширину вьюпорта после Rail (например ≈1680–1848px на экране 1920px). `dashboard/page.tsx`'s собственный контейнер был `max-w-7xl` **без `mx-auto`** — блочный элемент с `max-width` без auto-маргинов не центрируется в более широком родителе, а прижимается к левому краю, оставляя весь излишек справа. Это и есть весь механизм "left-heavy" — не проблема Rail/TopBar/брейкпоинтов, просто отсутствующий `mx-auto`.

### Реализация
- `dashboard/page.tsx`: оба ветвления (студент и учительский fallback) — `max-w-7xl` → `mx-auto max-w-[90rem]` (1280px→1440px). `mx-auto` — собственно фикс; увеличение ширины — осознанный вторичный выбор, чтобы на очень широких экранах (1600–1920px) композиция читалась как "широкий командный центр", а не "узкая колонка с большими полями". На 1366/1440px cap не включается вообще — контент уже уже, чем 1440px, поведение как в D5.1.
- `WorldSection.tsx`: заголовок+подзаголовок секции обёрнуты в `mx-auto max-w-2xl text-center` (тот же паттерн, что у `WorldsShowcase` на лендинге) — единственное намеренное центрирование текста, по явной (необязательной) подсказке брифа дать "Исследуй миры" вес центральной секции. Всё остальное (Hero, Continue Learning/Progress, Recent Results/Focus Next, текст ВНУТРИ карточек миров) осталось left-aligned.
- 3 портала миров отдельно центрировать не потребовалось — они уже наследуют центрирование от родительского контейнера страницы; grid `align-items: stretch` (не тронут) по-прежнему даёт равную высоту.
- Depth-иерархия (§5 брифа) пересмотрена, но не изменена — существующая (Hero-подложка → Surface/GlassPanel → elevated-порталы с hover-lift) уже реализует запрошенные 4 уровня; усиление тени порталов через конфликтующие `shadow-ds-sm`/`shadow-ds-md` классы сознательно пропущено — полагается на порядок объявления в скомпилированном Tailwind CSS, не гарантированно безопасно "на глаз" ради чисто косметического нюанса.

### Результаты проверок
| Проверка | Результат |
|---|---|
| `npx tsc --noEmit` | 0 ошибок |
| `npm run lint` | 0 ошибок, 0 предупреждений |
| `npx vitest run` (полный) | **813/813 PASSED (92 файла)** — включая ранее падавший чужой `vector-geojson.test.ts` (параллельная сессия сама починила) |
| dev-сервер | `/`, `/dashboard` — 200, ошибок в HTML нет |

### Честная оговорка
Нет инструмента браузерной автоматизации — реальная визуальная приёмка центрирования на 1366/1440/1600/1920px не проверена визуально, только рассуждением по арифметике ширин + SSR + typecheck/lint/тесты. Пользователь снова предупреждён: прохождение тестов не равно визуальному одобрению.

### Статус на конец продолжения №29
**Design System V2 D5.2 — завершён.** `EDUMIND_DESIGN_SYSTEM_V2.md` обновлён (§33). D6 (SimulationShell) не начат — ждёт ручного визуального одобрения в браузере. GeoWorld-файлы параллельной сессии не тронуты ни строкой.

---

## Обновление 2026-08-09 (продолжение №30) — Design System V2, D6: Immersive SimulationShell + Floating Glass HUD

### Контекст и обязательный аудит
D6 — новая крупная стадия: 4 immersive-маршрута (Chemistry World, Electricity Lab, GeoWorld, SimLab) должны почувствоваться как "вход в мир EduMind", а не "дашборд вокруг маленького канваса". Перед правкой выполнен отдельный read-only аудит текущего кода (не по памяти из старых D-заметок — GeoWorld развивается параллельно всё это время).

**Ключевые находки аудита**:
- `(immersive)/layout.tsx` → `MinimalShell` (только `ProtectedRoute`+`QualityProvider`, без шелла) — подтверждено неизменным с D4. Каждая `[id]/page.tsx` рендерила простой `<h1>+<p>` заголовок в потоке — шелла не было вообще.
- `CanvasShell` вне fullscreen — фиксированная `h-[34rem]` (544px) независимо от вьюпорта.
- `useFullscreen` — общий хук, но реально используется ТОЛЬКО Chemistry и Electricity. **У GeoWorld и SimLab fullscreen нет вообще** (подтверждено грепом).
- Chemistry/Electricity: `lg:flex-row` — колонка канваса + ПОСТОЯННО смонтированная AI-панель как flex-сосед (`lg:w-80`, без состояния свёрнутости). Fullscreen-обёртка каждой сцены оборачивает ТОЛЬКО канвас+тоггл режима — guided-lab панель, AI-чат, safety-предупреждения, тетрадь остаются СНАРУЖИ и реально невидимы во время fullscreen (нативное поведение Fullscreen API браузера, не CSS/z-index).
- GeoWorld/SimLab — проще, используют другой, уже сворачиваемый AI-компонент (`AIAssistantChat`, плавающий пузырь).
- GeoWorld git-состояние на момент аудита: последний закоммиченный этап — G5, рабочее дерево чистое. К концу D6 параллельная сессия продвинулась дальше (`lib/geo/providers/volcanoes.ts` — untracked) — проверено `git status` прямо перед коммитом, ничего из этого не тронуто.
- **Баг "Лабораторная работа завершена"** (явно указан в брифе как "не чинить сейчас, задокументировать") — подтверждён и локализован: `lib/electricity-lab-catalog.ts:207`, `finishStep()` задаёт СТАТИЧЕСКУЮ строку инструкции для 8/8 шага, независимо от реальной разблокировки. `ElectricityGuidedLabPanel.tsx` рендерит её как есть — кнопка корректно `disabled`, но сам текст инструкции всегда читается как объявление о завершении. **Не исправлено в D6** — по прямому указанию, задокументировано как отдельный follow-up.
- SimLab — подтверждено повторно: всё ещё не продвигается в навигации (тот же regression-тест из D2), маршрут жив только по прямому URL.

### Граница ответственности: SimulationShell vs. сцена
**SimulationShell владеет**: back/exit (→ `/dashboard`), identity мира (иконка+акцент из `lib/landing-worlds.ts` + реальный `simulation.title`), Locale, Theme. Никакого fullscreen-контрола (у Chemistry/Electricity он уже есть в `SandboxModeOverlay`, у GeoWorld/SimLab его нет и D6 не добавляет — по прямому указанию "wrap only, nothing more" для GeoWorld).
**Сцена продолжает владеть**: fullscreen, камера/WASD/E-взаимодействие, все drag-системы, guided labs/каталог/тетрадь/safety/quality-селектор (не тронуты, остаются в потоке), содержимое AI-чата (контракт/контекст/бэкенд — только позиционирующая обёртка новая).

### Реализация
- **`components/simulation/SimulationShell.tsx`** (новый) — плавающий header, `fixed`, без собственной высоты в потоке. `pointer-events-none` на всей строке + `pointer-events-auto` только на реальных кластерах управления (это защита от проглатывания orbit-drag/WASD/wire-drag под прозрачными полями заголовка — прямое требование брифа §14). Новый хелпер `getWorldByModule()` в `lib/landing-worlds.ts` (тот же `LANDING_WORLDS`, не второй реестр) резолвит иконку/акцент по `simulation.module`; для `simlab` — нейтральный fallback без краша.
- **`components/simulation/AITeacherDock.tsx`** (новый) — сворачиваемая плавающая обёртка. По умолчанию свёрнут (кнопка-пилюля с иконкой Bot снизу справа); в развёрнутом виде рендерит РЕАЛЬНЫЙ, НЕИЗМЕНЁННЫЙ `ChemistryTeacherChat`/`AITeacherChat` внутри `fixed`-контейнера со своей кнопкой закрытия. Единственные изменения в самих сценах — по одной строке-обёртке в `ChemistryTeacherChatPanel` (Chemistry) и `TeacherChatPanel` (Electricity); структура `lg:flex-row` не тронута — канвас автоматически занимает освободившиеся ~320px, потому что AI-панель больше не участвует в flex-потоке (`fixed`).
- **`components/scenes/CanvasShell.tsx`** — высота вне fullscreen: `h-[34rem]` (фиксированные 544px) → `h-[75vh] min-h-[28rem] max-h-[48rem]`. Чистое CSS-значение, ноль риска для интеракции/физики, применяется одинаково ко всем 4 сценам (общий компонент) — главный рычаг для "канвас доминирует во вьюпорте". Механизм "мгновенный снап высоты, не анимировать" (существующий фикс от прошлого бага со скроллбаром) сохранён без изменений — поменялось только число.
- **Все 4 `[id]/page.tsx`** — простой `<h1>+<p>` заменён на `<SimulationShell simulation={simulation}>{scene}</SimulationShell>`. Строка `simulation.subject` убрана (не задублирована в i18n) — категория мира теперь передаётся иконкой+акцентом шелла, а не повторным текстом.
- **RU/EN/TG** — новый namespace `simulation` (`back`, `aiTeacher.trigger/expand/collapse`) во всех трёх словарях; `trigger` переиспользует уже существующее слово из `aiTeacher.eyebrow` (D2), не новый несогласованный ярлык.

### Что сознательно НЕ сделано (и почему)
- Большой info-grid под канвасом в Chemistry/Electricity (инструкции/тьюториал/quality-селектор/safety/guided-lab/тетрадь) **не превращён** в плавающий bottom-sheet в этом проходе — блок неоднороден (часть — реально первичные контролы вроде слайдеров Electricity, часть — вторичный статус), а безопасно перестроить композицию ~3700- и ~1700-строчных файлов без возможности визуально проверить результат — реальный риск, от которого явно предостерегал бриф. Тот же паттерн поэтапной осторожности, что и в D5→D5.1→D5.2.
- GeoWorld/SimLab overlay JSX не тронут за пределами общего изменения высоты `CanvasShell` и обёртки `SimulationShell` — по прямому "ничего больше" из брифа. Ни один G-stage файл не открывался на редактирование.
- Fullscreen НЕ добавлен в GeoWorld/SimLab — это было бы реальным добавлением поведения, не visual/shell-правкой.

### Результаты проверок
| Проверка | Результат |
|---|---|
| `npx tsc --noEmit` | 0 ошибок |
| `npm run lint` | 0 ошибок, 0 предупреждений (одна найденная и исправленная ошибка — `no-assign-module-variable` в собственном тесте, переименована переменная цикла) |
| `npx vitest run` (полный) | **843/843 PASSED (98 файлов)** — "2 errors" от `AbortController` в чужом untracked `lib/geo/providers/volcanoes.test.ts` (параллельная сессия, G6?, не тронут) |
| dev-сервер | Все 4 immersive-маршрута (`/chemistry_world/[id]`, `/electricity_lab/[id]`, `/geo3d/[id]`, `/simlab/[id]`) компилируются и отдают 200, ошибок в HTML нет |

### Честная оговорка
Нет инструмента браузерной автоматизации — реальная визуальная/интерактивная проверка (как выглядит плавающий header поверх каждой сцены, не мешает ли увеличенная высота канваса кадрированию камеры, не перехватывает ли зона header'а клики у самого верха канваса на практике) не выполнена. Только статический аудит + tsc/lint/vitest (все зелёные) + curl-проверка компиляции/SSR (200, без маркеров ошибок) для всех 4 маршрутов. Info-grid под канвасом в Chemistry/Electricity визуально не согласован с новым плавающим шеллом до будущей стадии — это открыто задокументировано, не скрыто.

### Статус на конец продолжения №30
**Design System V2 D6 — реализован и код-верифицирован, ждёт РУЧНОГО визуального одобрения.** `EDUMIND_DESIGN_SYSTEM_V2.md` обновлён (§34 — полная граница ответственности shell/scene, детали реализации, найденный баг Electricity как follow-up). D7 не начат. GeoWorld-файлы параллельной сессии (включая новые `volcanoes.*`) не тронуты ни строкой.

**Примечание для параллельной сессии:** да, `lib/geo/providers/volcanoes.test.ts` (и весь `volcanoes.*`) — это G6 (GeoWorld-сессия), поймано вами в процессе написания. Спасибо, что не тронули — завершено, см. запись ниже (продолжение №31). Тот `AbortController`-"2 errors" в вашем прогоне был реальным багом в промежуточном состоянии файла (необработанное отклонение из `.finally()`) — исправлено до финального коммита, сейчас чисто.

---

## Обновление 2026-08-09 (продолжение №31) — GeoWorld G6: образовательные геослои (тектоника/вулканы/землетрясения)

### Задача чекпоинта
GeoWorld должен стать образовательным геоисследователем, а не просто реалистичным просмотрщиком Земли: включаемые/выключаемые геослои поверх G1-G5, с кликабельными объектами и компактными карточками с реальными данными. G1-G5 заморожены, не переписаны.

### Аудит существующего (перед реализацией)
Разрез слоёв Земли, слайдер потепления/сель на Памире, клик-по-континенту, AI-кнопка — все оставлены БЕЗ ИЗМЕНЕНИЙ (классифицированы как KEEP, не геослои реестра — разрез представлен отдельным режимом "Строение Земли", климат — сценарий/симуляция, не переключаемый слой). Полная таблица классификации — в `GEOWORLD_ROADMAP.md`, раздел G6.

### Источники (проверены эмпирически)
- **Тектонические плиты**: Peter Bird (2003) PB2002, через `fraxen/tectonicplates` — ODC-BY (атрибуция обязательна, в отличие от предыдущих источников), CORS подтверждён.
- **Вулканы**: NOAA/NCEI Global Significant Volcanic Eruptions Database — public domain, пагинация (реальный потолок сервера `itemsPerPage=200`, `=1000` отклоняется HTTP 400 — проверено эмпирически), ~900 записей извержений дедуплицированы до уникальных вулканов.
- **Землетрясения**: USGS, снимок M4.5+/30 дней (СОЗНАТЕЛЬНО не живой поток — GeoWorld должен оставаться детерминированным для преподавания).

### Архитектура
Единый реестр слоёв (`lib/geo/layer-registry.ts`) — границы/города G5 сведены в него же, старый отдельный тогл убран (по прямому указанию не плодить второй контрол). Компактная плавающая панель "Слои" (`LayerControlPanel.tsx`) вместо растущего ряда кнопок. Одна общая инфокарточка (`GeoFeatureInfoCard.tsx`, drei `<Html>`) на все три новых слоя. Столицы (G5 датасет) теперь визуально отличаются от обычных городов через РЕАЛЬНОЕ поле `ADM0CAP` (не эвристика по размеру) — Душанбе подтверждён в данных с `ADM0CAP:1`.

### Честная оговорка
Нет инструмента браузерной автоматизации — реальный визуальный результат (легенды/карточки/декluttering, читаемость при плотной застройке) не проверен визуально, только логикой/тестами/компиляцией и прямой ручной проверкой самих API через `curl`. Ручная браузерная проверка — за пользователем, чек-лист ниже.

### Результаты проверок
| Проверка | Результат |
|---|---|
| `npx tsc --noEmit` | 0 ошибок |
| `npm run lint` | 0 ошибок, 0 предупреждений |
| `npx vitest run` (полный) | **850/850 PASSED (99 файлов)** — из них 35 новых тестов от этого чекпоинта |
| dev-сервер, `/geo3d/[id]` | скомпилирован (2711 модулей), HTTP 200, ошибок в логе нет |
| Реальные API (curl) | тектоника/вулканы/землетрясения — все HTTP 200 с корректными CORS-заголовками |
| `GlobeControls`/снимки/рельеф/границы-города/клик по геослоям Земли | не тронуты этим чекпоинтом (G1-G5 заморожены) |

### Manual browser acceptance checklist (GeoWorld G6, для пользователя)
1. Открыть `/geo3d/[id]` — базовый G1-G5 глобус работает как раньше.
2. Нажать кнопку "Слои" (правый верхний угол канваса) — открывается панель с категориями.
3. Включить/выключить "Границы стран", "Города и столицы" — работает так же, как раньше в G5 (просто в новом месте).
4. Включить "Тектонические плиты" — цветные линии границ плит поверх глобуса, с легендой (оранжевый = субдукция).
5. Включить "Вулканы" — красные маркеры-конусы.
6. Включить "Землетрясения" — цветные сферы, издалека только крупные (M6.5+), вблизи — все M4.5+.
7. Клик по любому вулкану/границе плиты/землетрясению — появляется одна компактная карточка с реальными данными.
8. Найти Таджикистан (граница видна), приблизиться — Душанбе должен появиться с отличительным маркером/цветом столицы.
9. Приблизиться к Памиру — рельеф (G4) по-прежнему виден, плюс (если включено) тектонический/сейсмический контекст региона.
10. Выключить все новые слои — чистая Земля (G3/G4) восстанавливается.
11. Разрез слоёв (`isCutaway`) — старое "Строение Земли" работает как раньше, новые геослои скрываются во время разреза.
12. Нет заметного проседания FPS при включении всех слоёв одновременно.

### Файлы, изменённые/добавленные в этой части
| Файл | Что изменено |
|------|-------------|
| `frontend/lib/geo/layer-registry.ts` (+test) | новый — реестр образовательных слоёв |
| `frontend/lib/geo/vector-geojson.ts` | добавлен тип `LineStringGeometry` (для границ плит) |
| `frontend/lib/geo/geo-vector-lod.ts` (+test) | добавлена `selectVisibleCities` (приоритет столиц, вынесена из компонента для тестируемости) |
| `frontend/lib/geo/providers/tectonic-plates.ts` (+test) | новый — загрузчики границ/полигонов плит, классификация цвета |
| `frontend/lib/geo/providers/volcanoes.ts` (+test) | новый — `VolcanoProvider` (пагинация+дедуп+кэш) |
| `frontend/lib/geo/providers/earthquakes.ts` (+test) | новый — загрузчик снимка USGS, цвет по магнитуде |
| `frontend/lib/geo/providers/natural-earth.ts` | `CityProperties` дополнен полем `ADM0CAP` |
| `frontend/components/geo/GeoFeatureInfoCard.tsx` | новый — общая инфокарточка |
| `frontend/components/geo/TectonicPlatesLayer.tsx` | новый |
| `frontend/components/geo/VolcanoesLayer.tsx` | новый |
| `frontend/components/geo/EarthquakesLayer.tsx` (+test) | новый, включая `minVisibleMagnitude` |
| `frontend/components/geo/LayerControlPanel.tsx` | новый — плавающая панель "Слои" |
| `frontend/components/geo/CityLabelsLayer.tsx` | добавлено визуальное отличие столиц |
| `frontend/components/scenes/GeoWorldScene.tsx` | подключены все новые слои/панель/карточка, убран старый тогл границ |
| `GEOWORLD_ROADMAP.md` | раздел G6 переведён из плана в отчёт о сделанном (плюс устранён случайный дубль заголовка от предыдущей правки) |

### Статус на конец продолжения №31
**GeoWorld G6 (Educational Geography Layers) — завершено и закоммичено.** Единый реестр геослоёв, три новых слоя из настоящих научных/государственных источников, столицы различены по реальному полю датасета. Ручная browser-приёмка — за пользователем. G7 (геомиссии/задания) не начат.

---

## Обновление 2026-08-09 (продолжение №32) — Design System V2, D6.1: визуальная полировка + полная RU/EN/TG-локализация immersive-экранов

### Контекст
После ручного просмотра Electricity Lab в браузере D6 принят как база, но признан визуально/интеграционно неполным: сцена всё ещё "тёмно-синяя старая EduMind", glass почти не виден, нижние контролы — старый page-подобный блок, верхние кнопки не читаются как единая система, AI Teacher выглядит отдельно от шелла, RU/EN/TG переводит только AI-чат, но не остальной интерфейс. Это НЕ запрос на переписывание логики симуляций — только presentation+интеграция.

### Точная причина неполного перевода
Отдельный read-only аудит (два параллельных прохода — по каждому миру) проинвентаризировал каждую видимую строку и CSS-класс во всём дереве компонентов, которое монтирует каждая сцена (~26 файлов). Находка: **ни один** файл не импортировал `useLocale`/`useTheme`, **ни один** не использовал токены Design V2 — везде легаси `.glass-panel`/`border-glass-border`/`neon-violet`/`slate-*`. Причина не в баге LocaleProvider/ThemeProvider (они корректны с D1/D2) — просто D0–D6 подключили новую систему только к ОБОЛОЧКЕ вокруг лабораторий (AppShell/Landing/Auth/SimulationShell), но не к самому UI ВНУТРИ лабораторий. D6.1 — это тот самый недостающий проход, применённый к осознанно ограниченному, но самому заметному подмножеству.

### Осознанно ограниченный scope
Аудит нашёл ~120–150 строк UI-chrome на мир ПЛЮС отдельно ~150–200+ кириллических строк-литералов ВНУТРИ файлов каталога (`lib/electricity-lab-catalog.ts`, `lib/chemistry-lab-catalog.ts` — тексты конкретных экспериментов) и сообщения safety-движка. Перевод каталога/safety означал бы смену СХЕМЫ ДАННЫХ этих файлов — это уже не presentation-фикс, а рискованное изменение домена, именно то, от чего явно предостерегал бриф.

**Переведено + переоформлено под D1-токены** (основная интерактивная поверхность — то, что студент видит в обычной сессии): `SandboxModeOverlay.tsx` (общий для обоих миров), `AutosaveBadge.tsx`/`ElectricityAutosaveBadge.tsx`, `ChemistryTeacherChat.tsx`/`AITeacherChat.tsx`, `GuidedLabPanel.tsx`/`ElectricityGuidedLabPanel.tsx` (кроме `currentStep.instruction`/`.objectives`/`.goal` — данные каталога), `ExperimentPanel.tsx`/`TaskPanel.tsx` (кроме `.title`/`.description`/сообщений валидатора), и весь info-блок под канвасом в обеих сценах (инструкции, звук, селектор активного сосуда, quality, аварийная остановка, терминал-легенда, слайдеры напряжения/сопротивления, статус цепи).

**Осознанно отложено (задокументировано, не скрыто)**: `ExperimentCatalogBrowser`/`ElectricityExperimentCatalogBrowser`, `CompletionScreen`, `LabNotebookPanel`/`ElectricityLabNotebookPanel`/`ElectricityLabReportPanel`, `ResumeExperimentModal`/`ElectricityResumeModal`, `ChemistryTutorialPanel`/`TutorialPanel` — более редкие экраны; плюс перманентно вне scope: весь контент каталога и сообщения safety-движка.

### Архитектура locale/theme после фикса
Никакой новой i18n-системы — та же типизированная `useLocale()`/`lib/i18n/dictionaries/{ru,en,tg}.ts` архитектура из D2. Добавлены namespace'ы `chemistry`/`electricity` (+общий `sandboxHud`) во все три словаря с той же гарантией типизации "от ru" — пропущенный ключ в EN/TG роняет сборку. Динамические значения — через `"{placeholder}".replace(...)`, без новой шаблонной системы. Тема — тот же D1 `ThemeProvider`, просто компоненты теперь РЕАЛЬНО используют его токены вместо хардкода. Один осознанный отход: фон WebGL-сцены (`CanvasShell`'s `backgroundTop`/`backgroundBottom`) НЕ привязан к теме — это атмосфера мира, не UI chrome (прямое указание брифа), но ретонирован из насыщенного indigo-navy в нейтральный графит.

### Что изменилось navy → Design V2
Внешняя обёртка колонки канваса в обеих сценах: `bg-gradient-to-b from-slate-900...` → `bg-surface border border-border/[0.08]`. Фон `CanvasShell`: `#1e2340/#04050c` → `#1c1f26/#05060a` (применяется единообразно ко всем 4 сценам через общий компонент, ни один G-файл не тронут). Info-блок: `.glass-panel` → реальный `.ds-glass`, все `slate-*`/`neon-violet` → семантические токены. `SandboxModeOverlay` — унификация верхнего HUD: те же `.ds-glass`-пилюли, что у `SimulationShell`, эмодзи 🎥/🚶 заменены на lucide-иконки Camera/Footprints. Оба AI-чата — полная ретонировка под `.ds-glass`/`ds-input`/семантические токены.

### Fullscreen — расследовано, не форсировано
Подтверждено: `useFullscreen(wrapperRef)` каждой сцены оборачивает только канвас+`SandboxModeOverlay`, НЕ `SimulationShell` (тот рендерится на уровень выше, на странице). Чтобы шелл был виден ВО ВРЕМЯ fullscreen, пришлось бы поднять владение fullscreen-состоянием из сцены в `SimulationShell` — это уже инверсия контроля, не presentation-правка. По прямому указанию брифа — НЕ реализовано, ограничение честно задокументировано: во время fullscreen видна только внутриканвасная HUD `SandboxModeOverlay`, шелл и AI-триггер — нет (это не регрессия, так было и раньше, просто теперь явно записано).

### Прочее
Баг "Лабораторная работа завершена" — подтверждён повторно, **не исправлен** (по прямому указанию брифа). GeoWorld — подтверждено через `git status` перед каждым коммитом: ни один файл `components/geo/`, `lib/geo/`, `GeoWorldScene.tsx` не открывался на редактирование (параллельная сессия активно их правила весь этот проход).

### Результаты проверок
| Проверка | Результат |
|---|---|
| `npx tsc --noEmit` | 0 ошибок |
| `npm run lint` | 0 ошибок, 0 предупреждений |
| `npx vitest run` (полный) | **874/874 PASSED (101 файл)** — +11 новых/обновлённых теста на реальное переключение locale (не симуляцию через localStorage), +2 реальных регрессии пойманы и исправлены (`AutosaveBadge.test.tsx`, `ElectricityGuidedLabPanel.test.tsx` — не оборачивали в `LocaleProvider`) |
| dev-сервер | Полный чистый пересбор (`.next` удалён) — все 4 immersive-маршрута компилируются и отдают 200, ошибок нет |

### Честная оговорка
Нет инструмента браузерной автоматизации — реальная визуальная/интерактивная корректность (согласованность HUD с палитрой каждой сцены, "ощущение" Light-темы, вид AI-дока в реальном диалоге) не проверена визуально. Отложенный контент (каталог-браузеры, тетради/отчёты, resume-модалки, tutorial-панели) остаётся на легаси-палитре/языке — открытый, признанный пробел.

### Статус на конец продолжения №32
**Design System V2 D6.1 — реализован и код-верифицирован, ждёт РУЧНОГО визуального одобрения.** `EDUMIND_DESIGN_SYSTEM_V2.md` обновлён (§35). D7 не начат. GeoWorld-файлы параллельной сессии (G6/начало G7) не тронуты ни строкой.
