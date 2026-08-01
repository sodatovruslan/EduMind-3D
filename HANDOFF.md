# HANDOFF — для следующего AI-агента, если у текущего закончится лимit

Этот файл — рабочая заметка о том, что происходит ПРЯМО СЕЙЧАС, а не документация проекта.
Цель: если пользователь переключится на другого AI/агента, тот должен понять состояние проекта
из этого файла за 5 минут, а не заставлять пользователя объяснять всё заново.

Обновляется по ходу работы. Если ты новый агент — читай сначала "Текущий приоритет №1",
потом "Незавершённые куски кода" (это критично — там реальный риск сломать что-то, если
не знать точного состояния), потом всё остальное.

Последнее обновление: 2026-08-02 (после реализации Stage S-1).

---

## Текущий приоритет №1 (что делать прямо сейчас)

**Stage S-1 (Focus & Pickup Core) РЕАЛИЗОВАН и ВРУЧНУЮ ПРОВЕРЕН в браузере, но ЕЩЁ НЕ
ЗАКОММИЧЕН** — ждёт явного подтверждения пользователя после отчёта, прежде чем делать
`git add`+`git commit`. Подробности реализации — в подразделе A ниже (не переделывать заново,
просто закоммитить после подтверждения, либо продолжать на этой основе к Stage S-2).

Пользователь ведёт ОДНОВРЕМЕННО две линии работы:

### A) Chemistry World → Interaction Core (Stage S-1..S-7) — S-1 готов, ждёт коммита

Пользователь развернул направление: вместо статичной сцены со столом и 2D-драгом по плоскости
стола нужна свободная лабораторная песочница от первого лица — подошёл к шкафу, открыл,
взял предмет в "руку", отнёс куда угодно, поставил, открыл крышку бутылки, налил по
приближению+углу (используя существующие вызовы Chemistry Engine), вернул на полку —
всё логируется для будущего отчёта учителю/AI.

Согласована (пользователь одобрил явно) state-machine предмета:
`Idle → Focused → Held → Open/Closed (под-состояние) → Placed → Pouring → Returned`.

Согласован поэтапный план **без единого большого изменения** (эти стадии пользователь
продиктовал дословно, порядок менять нельзя):
- **Stage S-1 — Focus & Pickup Core** (raycast-фокус, подсветка, prompt, взять в руку → Held,
  отпустить обратно в Idle; БЕЗ шкафов/крышек/налива).
- Stage S-2 — Free Placement (поставить в любом валидном месте на столе, проверка поверхности,
  без наложения, поворот в руке).
- Stage S-3 — Shelves & Cabinets (открыть шкаф, предметы доступны только после открытия, слоты
  хранения, взять/вернуть).
- Stage S-4 — Bottle Caps (открыть/закрыть, налив заблокирован пока закрыто).
- Stage S-5 — Real Pouring (настоящий pourPoint, проверка угла/дистанции, реальный вызов
  Chemistry Engine, без фейковой анимации).
- Stage S-6 — AI Observation Events (структурированный лог событий).
- Stage S-7 — Movement System (выбор локомоции — ТОЛЬКО после того, как S-1/S-2 доказали, что
  цикл взять/нести/поставить работает; НЕ выбирать WASD/point-click раньше времени — это было
  явное указание пользователя).

**Stage S-1 план был показан пользователю и ОДОБРЕН** ("План Stage S-1 одобряю. Можешь начинать
реализацию"), с 4 уточнениями, все учтены в реализации (см. ниже):
1. S-1 — только фундамент (Focused→Held→Rotate→Release/Cancel), не полноценная песочница —
   явно не называть готовым результатом.
2. **Архитектура через универсальный capability-реестр, НЕ через `if (SET.has(id))` в
   компонентах** — реализовано как `frontend/lib/interactables.ts`
   (`INTERACTABLE_REGISTRY: Record<string, InteractableConfig>` с полями `displayName`,
   `canBeHeld`, `handOffset`, `handRotation`, `interactionRadius`) + единый хук
   `useInteractable(id)` в `ChemistryInteractionProvider.tsx`, который вызывают ВСЕ компоненты
   одинаково (`ContainerMesh`/`StockBottleMesh`) — единственная точка ветвления по capability
   находится внутри хука, не размазана по компонентам.
3. Визуальное и доменное состояние строго разделены — во время Held ничего не пишется в
   `ChemistryWorkspaceProvider` (см. "Ключевое архитектурное решение" в
   `STAGE_S1_INTERACTION_PLAN.md`).
4. Обязательные edge-case тесты — написаны и проходят (см. ниже).

**Реализация (файлы):**
- **Новый** `frontend/lib/interactables.ts` — реестр capability (сейчас: `beaker-1`, `flask-1`,
  `stock-water` — POC-список, должен РАСТИ в будущих стадиях, не уменьшаться тем же путём).
- **Новый** `frontend/components/core/ChemistryInteractionProvider.tsx` — state machine
  `idle/focused/held`, keyboard (`E` — toggle взять/отпустить, `Escape` — безопасно отпустить,
  `ArrowLeft/Right` — вращение в руке на 15°/нажатие), защита от `e.repeat` (OS-автоповтор) и от
  печати в input/textarea/contentEditable (`document.activeElement`/`e.target`). Экспортирует
  `useChemistryInteraction()` и единый `useInteractable(id)`.
- **Новый** `frontend/components/core/ChemistryInteractionProvider.test.tsx` — 14 тестов,
  включая все обязательные edge-кейсы пользователя (нельзя взять второй предмет пока держишь
  первый; focus чистится по clearFocused с защитой от гонки; predмет без `canBeHeld` не берётся;
  повторный keydown при зажатой клавише игнорируется; ввод в input не триггерит; unmount во
  время Held снимает keydown-listener; `ChemistryWorkspaceProvider` не меняется — содержимое
  стакана/колбы не теряется и не меняется после pickup/rotate/release).
- **Изменён** `frontend/components/scenes/ChemistryWorldScene.tsx`:
  - `HeldObjectRig` (новый компонент рядом с `GrabLift`/`PourTilt`) — в `useFrame` считает
    мировую позицию/поворот предмета от ТЕКУЩЕЙ камеры (`camera.localToWorld(handOffset)` +
    `camera.quaternion * handRotation * yawQuat`) — не зависит от способа управления камерой
    (готово к первому лицу в Stage S-7 без переделки).
  - `FocusRing` (новый) — янтарное пульсирующее кольцо под предметом в фокусе (отдельный цвет
    от existing selection/snap/unsafe колец).
  - `InteractionPrompt` (новый, через `<Html fullscreen>` — без изменений в `CanvasShell.tsx`) —
    подсказка внизу канваса ("E — Взять: Стакан" / "E — Отпустить: ... · ←/→ — повернуть").
  - `ContainerMesh`/`StockBottleMesh` — точечно используют `useInteractable(id)`; если
    `capability` есть, `onPointerDown` для СТАРОГО drag отключается (`capability ? undefined :
    onPointerDown`) — для этих объектов старый клик-драг сознательно уступает место E/Focus;
    если `capability` нет (все остальные предметы) — код исполняется буквально как раньше.
  - `ChemistryCanvas`: `orbitEnabled={!draggingId && !heldId}` (OrbitControls гасится и во время
    старого drag, и во время нового Held).
  - `ChemistryInteractionProvider` смонтирован внутри `ChemistryDragProvider` (сосед, не замена).
- **НЕ изменены**: `ChemistryWorkspaceProvider.tsx` (0 строк diff), `chemistry-engine.ts`,
  `reaction-engine.ts`, `CanvasShell.tsx`, backend — как и требовалось.

**Верификация пройдена:** `tsc --noEmit` чисто, `eslint` чисто, `vitest run` — 210/210 тестов
(22 файла, включая новый), `pytest -q` (backend) — 44/44, `next build` — успешно (dev-сервер
был остановлен перед сборкой и перезапущен после, как требует правило проекта). Ручная
браузерная проверка (Claude-in-Chrome) на `http://localhost:3000/chemistry_world/<id>`:
Стакан/Колба/Бутылка воды — полный цикл наведение→"E — Взять: ..."→удержание у камеры
(OrbitControls не крутится во время Held)→Escape→точный возврат на исходное место, для всех
трёх объектов. Регрессия проверена: старый drag&drop по-прежнему работает на `test-tube-1`
(клик выделяет, показывает RotateHandle/SealHandle как раньше). Консоль браузера чистая на
всём протяжении (без ошибок).

**Известный некритичный косметический нюанс** (не блокирует завершение S-1, не проверялся
автотестами специально): собственный локальный `hovered`-tooltip контейнера/бутылки (старый
hover-label, показывающий название) может остаться видимым чуть дольше, если мышь не двигалась
в момент pickup/release — потому что React Three Fiber пересчитывает pointerOver/Out только по
реальным pointer-событиям, а не когда объект визуально переместился под неподвижным курсором.
Само состояние Interaction Core (focused/held) от этого не страдает — это исключительно
визуальный tooltip-артефакт, самоисправляющийся при следующем реальном движении мыши.

**Визуальную проверку вращения (`←`/`→`) подтвердить на глаз не удалось**: все 3 POC-объекта
(стакан/колба/бутылка) геометрически осерадиально симметричны (LatheGeometry/цилиндр без
асимметричных деталей), поэтому поворот вокруг Y незаметен визуально независимо от того,
работает он или нет. Корректность подтверждена автотестом (`rotateHeld` меняет
`heldYawOffset` только пока `heldId` задан, сбрасывается на `release()`), а также отсутствием
ошибок в консоли при множественных нажатиях `←`/`→` в браузере.

**Документы:**
- `D:\EduMind 3D\STAGE_S1_INTERACTION_PLAN.md` — одобренный архитектурный план (актуален,
  реализация ему соответствует).
- `D:\EduMind 3D\EduMind_Design_System_Prep.md` — дополнен разделом "9а. Immersive Fullscreen
  Laboratory Mode" (обязательное будущее требование, ТОЛЬКО план, не реализовано) — важно:
  там зафиксировано, что будущий fullscreen-режим должен перехватывать Escape ПОСЛЕ
  Interaction Core (предмет→панель→fullscreen), а не вместо него — `ChemistryInteractionProvider`
  уже сегодня реализует свою часть этой цепочки и не потребует переделки.

**Следующий шаг:** показать пользователю отчёт с результатами (сделано отдельным сообщением),
дождаться подтверждения, затем СДЕЛАТЬ ОДИН КОММИТ (`sodatovruslan <email@github.com>`, без
co-author, не пушить) и переходить к Stage S-2 (Free Placement) — план для неё ещё не составлен,
составлять по той же схеме (текстовый план + список файлов → показать → дождаться одобрения →
только потом код), как было сделано для S-1.

Контекст, изученный перед проектированием S-1 (полезно и для S-2+):
- `frontend/components/core/ChemistryDragProvider.tsx` — сейчас минимальный: `{draggingId,
  startDrag(id), stopDrag()}` + глобальные `pointerup`/`Escape` слушатели. Это "эфемерное"
  interaction-state, которое Stage S-1 должен РАСШИРИТЬ или заменить совместимо, не удаляя.
- `frontend/components/core/ChemistryWorkspaceProvider.tsx` — источник истины по домену
  (containers/tools/stockBottles, useReducer). `position: [number, number]` — плоские XZ
  координаты на столе, нет понятия полки/хранения/крышки бутылки. **Важный нюанс, замеченный
  при чтении**: `MOVE_ITEM` в редьюсере обновляет позиции только для `containers` и `tools`, но
  НЕ для `stockBottles` — то есть перетаскивание бутылки сейчас не двигает её собственную
  позицию в state (это существующая особенность/возможный баг текущей системы, НЕ трогать
  попутно — не относится к Stage S-1, но полезно знать при проектировании Interaction Manager).
- `frontend/components/scenes/ChemistryWorldScene.tsx` — сцена; drop/pour срабатывает по
  `DROP_PROXIMITY_RADIUS = 0.5` в `handleDrop()` (~строка 2194), НЕ по клику "налить" — чисто
  по дистанции. Это и есть механизм, который Stage S-5 должен переиспользовать (proximity+angle),
  а не переписывать с нуля.

### B) Design System Preparation (только что доставлено, план, ничего не реализовано)

Отдельным, не связанным с Interaction Core запросом пользователь попросил ПОДГОТОВИТЬ (не
реализовывать) будущий редизайн — текущий тёмно-синий UI ощущается как SaaS/CRM-панель, а не
как погружение в 3D-лабораторию. Документ создан:

**`D:\EduMind 3D\EduMind_Design_System_Prep.md`** — полный аудит + план (проблемы дизайна, карта
компонентов, список хардкода, что оставить/переработать, список новых базовых компонентов,
структура design tokens, архитектура AppShell с standard/immersive режимами, концепция HUD
внутри 3D-песочницы, поэтапный план миграции, риски регрессий, список затрагиваемых файлов).

**Явное правило от пользователя: редизайн НЕ начинается сейчас.** Приоритет — сначала
довести до стабильности Physics/Chemistry ядро (то есть Interaction Core Stage S-1..S-7 +
доделать баг #118 ниже). Design System — только подготовка архитектуры, чтобы редизайн потом
можно было сделать заменой темы/токенов, без переписывания компонентов. Ничего из документа
не реализовано, ничего не закоммичено. Не начинать писать компоненты из раздела 6 документа,
пока пользователь отдельно не подтвердит.

---

## Незавершённые куски кода (ОПАСНО — прочитать перед любым продолжением)

### Salt Dissolution bug (Task #118) — наполовину применённый фикс

Задача: соль в контейнере с водой должна растворяться заново, если позже добавить ещё воды
(сейчас баг: одноразовый расчёт растворимости в `addSubstance()` никогда не пересматривается
после добавления воды позже — соль так и остаётся в осадке навсегда).

Файл: `frontend/lib/chemistry-engine.ts`.

**Уже добавлено и применено** (сразу после функции `amountOf()`):
```ts
function setAmount(list: ContainedAmount[], substanceId: string, grams: number): ContainedAmount[] {
  const filtered = list.filter((c) => c.substanceId !== substanceId);
  if (grams <= 1e-9) return filtered;
  return [...filtered, { substanceId, grams }];
}

function rebalanceSolubility(container: Container): Container {
  const waterGrams = amountOf(container.contents, "water");
  const waterLiters = waterGrams / SUBSTANCES.water.densityGPerMl / 1000;
  const solubleIds = new Set<string>();
  container.contents.forEach((c) => solubleIds.add(c.substanceId));
  container.precipitate.forEach((c) => solubleIds.add(c.substanceId));
  let contents = container.contents;
  let precipitate = container.precipitate;
  for (const substanceId of solubleIds) {
    const substance = SUBSTANCES[substanceId];
    if (!substance || substance.solubilityGPerLiterWater === undefined) continue;
    const totalG = amountOf(contents, substanceId) + amountOf(precipitate, substanceId);
    if (totalG <= 0) continue;
    const maxDissolvableG = waterLiters > 0 ? substance.solubilityGPerLiterWater * waterLiters : 0;
    const newDissolvedG = Math.min(totalG, maxDissolvableG);
    const newPrecipitateG = totalG - newDissolvedG;
    contents = setAmount(contents, substanceId, newDissolvedG);
    precipitate = setAmount(precipitate, substanceId, newPrecipitateG);
  }
  return { ...container, contents, precipitate };
}
```

**НЕ сделано (это и есть незавершённая часть):**
1. `addSubstance()` всё ещё содержит СТАРОЕ тело (ручной разовый расчёт через
   `alreadyDissolvedG`/`roomForMoreG`/`dissolvedG`/`precipitateG`, пишет напрямую в
   `contents`+`precipitate` через `addToList`) — НЕ вызывает `rebalanceSolubility`. Нужно
   упростить: добавлять всю массу в `contents`, затем вызвать `rebalanceSolubility(container)`.
2. `pour()` — вообще не тронут. Нужно применить `rebalanceSolubility` к `newSource`/`newTarget`
   перед возвратом из функции.
3. Регрессионные тесты в `chemistry-engine.test.ts` — не написаны:
   (a) обычное растворение доходит до конца/эксперимент завершается,
   (b) избыток соли даёт осадок и эксперимент НЕ завершается, пока не добавлено достаточно воды
   — а после добавления воды осадок должен раствориться и эксперимент завершиться.

Это единственная авторизованная точка, где разрешено трогать физику Chemistry Engine —
явно как баг-фикс, отдельно от общего правила "визуал-онли" для Stage C-2/C-3.

---

## Постоянные правила проекта (не только для текущей стадии)

- **Всегда отвечать пользователю по-русски** — жёсткое требование, было явное недовольство,
  когда статус-строка вылезла на английском.
- **Git**: только `git add` + `git commit`, автор строго `sodatovruslan <email@github.com>`,
  БЕЗ co-author trailer, **никогда не push** — пуш делает сам пользователь. Никогда не
  rebase/force-push/трогать remote-историю.
- Никогда не вводить пароли/логиниться самостоятельно, даже в собственный дев-стенд
  пользователя — если браузерная сессия разлогинена, просить пользователя залогиниться самому.
- Не трогать Circuit Engine / Chemistry Engine / Reaction Engine / Hazard Engine / AI Teacher
  backend / API-контракты / прогресс/XP/достижения / архитектуру БД без явного запроса —
  для Chemistry World Stage C-2/C-3 разрешены ТОЛЬКО визуальные изменения (плюс явно
  авторизованный баг-фикс #118 выше).
- Перед `npm run build` — обязательно останавливать dev-сервер на порту 3000 (известная
  особенность: конфликт webpack-рантайма дев-сервера), после сборки — перезапускать. Частый
  симптом зависшего сервера: "Jest worker encountered N child process exceptions" —
  лечится `taskkill //PID <pid> //F` + `rm -rf frontend/.next` + рестарт.
- Не коммитить, пока не пройдена полная ручная проверка (tsc/eslint/vitest/pytest/build +
  живая браузерная проверка через Claude-in-Chrome MCP).
- `CanvasShell.tsx` общий для SimLab/GeoWorld/Electricity Lab/Chemistry World — любой новый
  проп обязан иметь дефолт, сохраняющий прежнее поведение остальных модулей.
- Electricity Lab и Chemistry World объявлены "Version 1.0 Production Ready" в предыдущих
  стадиях — трогать точечно, только по явному запросу (визуальный апгрейд/баг-фикс), не
  затрагивая физику/логику.

## Архитектура проекта (коротко)

EduMind 3D — образовательная 3D-платформа (Next.js 14 App Router + React Three Fiber фронтенд,
FastAPI бэкенд, Postgres). Модули: SimLab, GeoWorld, Chemistry World, Electricity Lab.

Слои (одинаковые для Chemistry World и Electricity Lab):
1. **Physics/Chemistry Engine** — чистый TS, без React. `frontend/lib/circuit-engine.ts`
   (Electricity), `chemistry-engine.ts`/`reaction-engine.ts`/`hazard-engine.ts` (Chemistry).
   "Замороженное" ядро физики — не трогать без явного запроса.
2. **Task/Lab Catalog слой** — учебные сценарии поверх физики (`electricity-lab-catalog.ts`,
   `chemistry-lab-catalog.ts`, `experiment-validator.ts`).
3. **React providers** — держат состояние сессии, сами ничего не пересчитывают:
   `ElectricityLabExperienceProvider.tsx` / `ChemistryLabExperienceProvider.tsx` /
   `ChemistryWorkspaceProvider.tsx` / `ChemistryDragProvider.tsx` / `ExperimentStateProvider.tsx` /
   `WireDragProvider.tsx` — всё в `frontend/components/core/`.
4. **UI** — `frontend/components/lab/*`, `frontend/components/scenes/*Scene.tsx`.
5. **AI Teacher** — `ai-context-builder.ts` (Electricity) / `chemistry-context-builder.ts`
   (Chemistry) собирают JSON, backend просто прокидывает его в промпт. Backend не трогать без
   явного запроса.
6. **Backend Learning Profile** — `backend/app/services/progress_service.py`, XP/достижения.

## История последних крупных стадий (закоммичено)

- Electricity Lab / SimLab / GeoWorld / Chemistry World v1.0 — множество стадий (E-0..E-4,
  Stage 2..5.7, Hazard v2) — все завершены и закоммичены в предыдущих сессиях.
- **Electricity Lab: Visual Realism Upgrade (GLB-модели)** — commit `413ce12`. Процедурная
  геометрия батареи/лампочки/выключателя/мультиметра заменена на GLB-модели (Poly Haven и др.),
  найдены и исправлены реальные баги (батарея стояла вертикально из-за лишнего rotation;
  выключатель был раздут и с неправильным pivot — исправлено через `baseHandleRotationX` offset).

## В процессе, НЕ закоммичено (см. "Текущий приоритет №1 → A" выше для полной картины)

**Chemistry World Visual Realism Upgrade (Stage C-2/C-3)** — заменяются все placeholder 3D-объекты
на реалистичные ассеты (GLB где есть бесплатные CC0-модели, иначе качественная процедурная
геометрия через `THREE.LatheGeometry`). Правило: физика/химия byte-for-byte без изменений,
только визуал (плюс баг #118 выше — явное исключение).

Ключевой файл — `frontend/components/scenes/ChemistryWorldScene.tsx`, сильно переписан
(GlassObject/GLASS_LIBRARY для стеклянной посуды через LatheGeometry, комната с DoubleSide-
материалами, асимметричные размеры комнаты `ROOM_FRONT_REACH`/`ROOM_Z_LENGTH`, шкафы
на верхнем креплении стены, раковина на боковой стене, `useWallProximityFade()`, GLB-модели
стола/бунзеновской горелки под `frontend/public/models/chemistry/`). `CanvasShell.tsx` получил
новые опциональные пропы (`minDistance/maxDistance/minAzimuthAngle/maxAzimuthAngle`, все с
дефолтами = прежнее поведение) — общий файл, но обратно совместим для остальных модулей.

**Затем весь room/camera/decoration трек был сознательно отменён пользователем** в пользу
Interaction Core (Stage S-1..S-7, см. приоритет A выше) — комната/камера/декор больше НЕ
главный фокус, это была предыдущая, устаревшая парадигма. Не возвращаться к "украшению комнаты",
пока Stage S-1..S-7 не даст рабочий цикл взаимодействия.

## Как продолжить (по порядку)

1. Stage S-1 готов и проверен — дождаться подтверждения пользователя, затем ОДИН коммит
   (`sodatovruslan <email@github.com>`, без co-author, не пушить) на всю реализацию S-1.
2. Составить и показать пользователю (текстом, БЕЗ кода) архитектурный план + список файлов
   для **Stage S-2 — Free Placement**, по той же схеме, что и S-1 (план → показать → дождаться
   одобрения → только потом код). Учесть текущую архитектуру: `INTERACTABLE_REGISTRY` в
   `lib/interactables.ts` уже готов расти (просто добавлять новые id/поля, не переписывать),
   `HeldObjectRig`/`ChemistryInteractionProvider` уже существуют и должны РАСШИРЯТЬСЯ (например
   добавить состояние "куда именно на столе можно поставить"), а не дублироваться.
3. Параллельно (низкий риск, можно делать в любой момент, не связано с Interaction Core) —
   доделать баг #118: переписать `addSubstance()` на вызов `rebalanceSolubility`, применить
   `rebalanceSolubility` в `pour()`, написать 2 регрессионных теста, прогнать полную
   верификацию, закоммитить отдельно.
4. Design System — НЕ начинать реализацию (ни одного компонента из
   `EduMind_Design_System_Prep.md`, включая раздел 9а про Fullscreen Mode), пока пользователь
   явно не подтвердит начало редизайна И пока Interaction Core/Chemistry ядро не стабилизированы.
5. Полная верификация перед любым коммитом: `tsc --noEmit`, `eslint`, `vitest run` (frontend),
   `pytest -q` (backend), `next build` (dev-сервер остановить перед сборкой, перезапустить
   после), затем ручная браузерная проверка через Claude-in-Chrome MCP.
6. Коммит — один коммит на завершённую стадию, `sodatovruslan <email@github.com>`, без
   co-author, **не пушить**.
