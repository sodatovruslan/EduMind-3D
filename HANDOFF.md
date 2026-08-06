# HANDOFF — для следующего AI-агента

Этот файл — рабочая заметка о том, что происходит ПРЯМО СЕЙЧАС, а не документация проекта.
Цель: если пользователь переключится на другого AI/агента, тот должен понять состояние проекта из этого файла за 5 минут.

Обновляется по ходу работы.

**Последнее обновление: 2026-08-04** (Stage S-7 v2 S7-V2.1..V2.13 & Chemistry World Critical Heating Bug Fixes полностью ЗАВЕРШЕНЫ).

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

Backend/frontend снова остановлены после диагностики (по просьбе пользователя). Ничего не закоммичено.
