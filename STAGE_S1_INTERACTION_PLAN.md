# Stage S-1 — Focus & Pickup Core: архитектурный план

Статус: **план на утверждение, ни строки кода не написано, ничего не закоммичено.**

Основан на реальном чтении (не предположениях):
`ChemistryDragProvider.tsx`, `ChemistryWorkspaceProvider.tsx`, `ChemistryWorldScene.tsx`
(`DragSurface`, `useDragHandlers`, `Hitbox`, `GrabLift`, `ContainerMesh`, `StockBottleMesh`,
`ChemistryScene`, `ChemistryCanvas`, `ChemistryWorldInner`).

---

## 0. Ключевое архитектурное решение

**Во время Held предмет НИКОГДА не пишет в `ChemistryWorkspaceProvider`.** Пока предмет держат,
меняется только то, ГДЕ он визуально нарисован (локальный рендер-transform относительно камеры) —
его `position`/`rotationY`/`data` (химия) в общем состоянии остаются нетронутыми всё время. Это
одновременно даёт:
- пункт 8 (возврат без потери данных) — тривиально верен, потому что ничего не менялось;
- нулевые изменения в редьюсере `ChemistryWorkspaceProvider.tsx` — доказуемо не трогаем химию/данные;
- простой откат — новая логика целиком аддитивна.

## 1. Как пользователь наводится на предмет

Камера в Stage S-1 остаётся OrbitControls (локомоция — Stage S-7, её не выбираем сейчас).
"Наведение" = уже существующий механизм: React Three Fiber сам делает raycast от камеры через
позицию курсора против мешей сцены и стреляет `onPointerOver`/`onPointerOut` — именно так уже
сегодня работает подсветка-тултип при наведении в `ContainerMesh`/`StockBottleMesh`. Stage S-1
переиспользует ровно этот raycast, только результат идёт не в локальный `useState(hovered)`,
а в общий `ChemistryInteractionProvider.setFocused(id)`.

**Явно проговариваемое ограничение (не прячу):** это заглушка под курсор мыши, а не настоящий
raycast "из центра экрана вперёд от игрока". Когда в Stage S-7 будет выбрана локомоция
(в частности, если это будет первое лицо), меняется ТОЛЬКО источник направления луча
(центр экрана вместо позиции курсора) — сам механизм обнаружения фокуса не переписывается.

## 2. Как предмет получает состояние Focused

`onPointerOver` → `interaction.setFocused(id)`, `onPointerOut` → `interaction.clearFocused(id)`
(clear только если `focusedId === id`, чтобы быстрый переход между двумя соседними предметами
не затирал чужой focus гонкой событий). Focused возможен только если `heldId === null`
(нельзя фокусироваться на новом предмете, пока один уже в руке — это соответствует однопредметной
модели "одна рука").

## 3. Подсветка и подсказка действия

- **Подсветка**: новое кольцо под предметом (тот же приём, что уже используют `isSelected`/
  `isSnapTarget`/`isUnsafe` в `ContainerMesh` — тонкое кольцо `ringGeometry` под объектом,
  которое плавно пульсирует через `useFrame`), новый цвет (например янтарный `#fbbf24`), чтобы
  не путать с уже существующими selection/snap/unsafe кольцами.
- **Подсказка действия**: НЕ через `<Html>` внутри Canvas (тот billboard масштабируется по
  `distanceFactor` и плохо читается вблизи), а обычный DOM-элемент `InteractionPrompt` —
  фиксированная подсказка снизу по центру канваса, читает `useChemistryInteraction()` и рисует
  `"E — Взять: {название предмета}"`, когда `focusedId` задан и `heldId === null`, либо
  `"E — Отпустить  ·  ←/→ — повернуть"`, когда `heldId` задан. Название предмета берётся из уже
  существующих карт подписей (`CONTAINER_LABEL` для сосудов, название вещества для бутылок) —
  тех же, что уже используют текущие hover-тултипы.

## 4. Переход в Held

Клавиша `E` (toggle): если `focusedId` есть и `heldId === null` → `interaction.pickUp(focusedId)`.
Никакого клика/драга мышью для захвата в Stage S-1 — сознательно, чтобы не пересекаться со
старым `useDragHandlers`/`DragSurface`, который управляет ВСЕМИ остальными предметами сцены.
Разрешён захват только одного предмета одновременно (`pickUp` — no-op, если `heldId` уже занят
другим id).

## 5. Как предмет следует за точкой руки у камеры

Новый компонент `HeldObjectRig` внутри `ContainerMesh`/`StockBottleMesh` (условная ветка
рендера, см. раздел 9): в `useFrame` берём `camera` из `useThree()`, вычисляем мировую точку
"руки" как `camera.localToWorld(HAND_ANCHOR_LOCAL.clone())`, где `HAND_ANCHOR_LOCAL =
new THREE.Vector3(0.32, -0.25, -0.6)` (вправо-вниз-вперёд в системе координат камеры — константа,
подбирается визуально один раз). Каждый кадр group.position = эта точка, group.quaternion =
ориентация камеры + базовый наклон "как в руке" + `heldYawOffset` (см. п.6). Работает одинаково
независимо от того, что двигает камеру (OrbitControls сейчас, что угодно другое в Stage S-7) —
зависимость только от `camera.position`/`camera.quaternion`, не от способа управления камерой.

Пока `heldId !== null`, OrbitControls должен быть выключен для этого предмета же (иначе будет
казаться, что "рука" дёргается, пока крутится камера) — на деле переносим существующий паттерн
`orbitEnabled={!draggingId}` в `ChemistryCanvas` на `orbitEnabled={!draggingId && !heldId}`.

## 6. Вращение во время удержания

`ArrowLeft`/`ArrowRight` во время `heldId !== null` → `interaction.rotateHeld(±Math.PI / 12)`
(шаг 15°, тот же порядок величины, что уже существующий `ROTATE_ITEM` с шагом 45° для старой
системы, только мельче — для ручного позиционирования в руке приятнее меньший шаг).
`heldYawOffset` живёт ТОЛЬКО в `ChemistryInteractionProvider` (не в редьюсере воркспейса) и
применяется поверх базовой ориентации камеры в `HeldObjectRig`. При отпускании `heldYawOffset`
сбрасывается в 0 и не сохраняется — в Stage S-1 вращение в руке чисто визуальное и не меняет
`rotationY` предмета на столе (см. раздел 0).

## 7. Как отпустить предмет

`E` ещё раз (toggle) или `Escape` → `interaction.release()`: `heldId = null`,
`heldYawOffset = 0`. Клик мышью НЕ отпускает предмет в Stage S-1 (это осознанно оставлено для
Stage S-2 — "поставить в любом месте" целиком её зона ответственности, в S-1 мы её не
предвосхищаем).

## 8. Возврат в прежнее состояние без потери данных

Автоматически: как только `heldId` очищается, условная ветка рендера (раздел 9) перестаёт
использовать `HeldObjectRig` и снова рендерит `<group position={[item.position...]}
rotation={[0, item.rotationY, 0]}>` — те же самые значения, что были ДО захвата, потому что
они никогда не менялись, пока предмет был в руке (раздел 0). Химия (`item.data`) не
дispatch'илась ни разу за весь цикл — значит объём/масса/осадок/температура гарантированно те же.

## 9. Совместимость с текущим ChemistryDragProvider

`ChemistryDragProvider` **не меняется ни на строчку**. Новый `ChemistryInteractionProvider`
монтируется рядом (сосед, не замена), внутри него же читаем `useChemistryWorkspace()` при
необходимости (например для подписи предмета в подсказке).

Для трёх POC-предметов (раздел 10) в `ContainerMesh`/`StockBottleMesh` появляется точечное
условное ветвление:

```
const isS1Interactive = STAGE_S1_INTERACTIVE_IDS.has(item.id); // Set("beaker-1","flask-1")
```

Если `isS1Interactive` — используется новый `useFocusAndHold(item.id)` вместо
`useDragHandlers(item.id)`: другие обработчики `onPointerOver/onPointerOut/onPointerDown`,
рендер оборачивается в `HeldObjectRig`, когда `heldId === item.id`. Если `!isS1Interactive` —
код выполняется **буквально как сегодня**, ни один символ старого пути не меняется.

`DragSurface` и `useDragHandlers` остаются полностью рабочими для всех остальных предметов
(`test-tube-1`, все 5 инструментов, 5 из 6 бутылок). Так старая механика физически не может
сломаться — новый код её просто не касается.

## 10. Состав первого proof-of-concept

Три уже существующих объекта из `createInitialState()` (новых сущностей заводить не нужно):
- `beaker-1` (пустой стакан, `ContainerItem`),
- `flask-1` (колба, `ContainerItem`),
- `stock-water` (бутылка воды, `StockBottle`) — можно заменить на `stock-nacl`, без разницы для POC.

Явно НЕ подключается в Stage S-1 (как и было указано): шкафы/хранение, крышки бутылок, наливание,
реакции, ходьба/локомоция, AI-анализ, отчёты учителю. Все остальные объекты сцены не меняют
поведения — используются как живое доказательство того, что старая механика не сломана.

---

## Новые типы и state machine

```ts
export type InteractionPhase = "idle" | "focused" | "held";

interface ChemistryInteractionContextValue {
  phase: InteractionPhase;         // производное: heldId ? "held" : focusedId ? "focused" : "idle"
  focusedId: string | null;
  heldId: string | null;
  heldYawOffset: number;
  setFocused: (id: string | null) => void;
  clearFocused: (id: string) => void;   // no-op если id !== текущий focusedId (защита от гонки)
  pickUp: (id: string) => void;         // no-op если heldId уже занят
  release: () => void;
  rotateHeld: (deltaYaw: number) => void; // no-op если heldId === null
}
```

Переходы: `idle --(pointerOver)--> focused --(E)--> held --(ArrowLeft/Right)--> held
(yaw меняется) --(E/Escape)--> idle`. Из `focused` без `E` возможен обратный переход в `idle`
по `pointerOut`. Из `held` фокус на другой предмет невозможен, пока не случится `release`.

## Новые файлы

- `frontend/components/core/ChemistryInteractionProvider.tsx` — провайдер + хук
  `useChemistryInteraction()`, state machine выше, глобальный keyboard-listener (`E`, `Escape`,
  `ArrowLeft/Right`) с защитой: игнорировать нажатия, если `document.activeElement` — `input`,
  `textarea` или `[contenteditable]` (чат AI Teacher уже имеет текстовое поле — не перехватывать
  ввод текста).
- `frontend/components/scenes/InteractionPrompt.tsx` — обычный DOM-компонент подсказки
  (раздел 3), рендерится вне Canvas.
- `frontend/components/core/ChemistryInteractionProvider.test.tsx` — vitest на state machine
  (см. план тестов ниже).

## Изменяемые существующие файлы

- `frontend/components/scenes/ChemistryWorldScene.tsx`:
  - монтирование `<ChemistryInteractionProvider>` рядом с `<ChemistryDragProvider>`;
  - `ContainerMesh`/`StockBottleMesh` — условная ветка для `beaker-1`/`flask-1`/`stock-water`
    (раздел 9), новый компонент `HeldObjectRig`, новое focus-кольцо;
  - `ChemistryCanvas` — `orbitEnabled={!draggingId && !heldId}`;
  - добавление `<InteractionPrompt />` в разметку `ChemistryWorldInner` (вне Canvas).

**Не изменяются**: `ChemistryDragProvider.tsx`, `ChemistryWorkspaceProvider.tsx` (ни типы, ни
редьюсер, ни начальное состояние), `chemistry-engine.ts`, `reaction-engine.ts`,
`experiment-validator.ts`, любые backend-файлы, любые Provider вне Chemistry World.

## Зависимости

- `useThree` из `@react-three/fiber` (доступ к `camera` для hand-anchor).
- Существующие карты подписей (`CONTAINER_LABEL`, имя вещества по `substanceId` из
  `SUBSTANCES`) — переиспользуются как есть, не меняются.
- Существующий паттерн window-level keyboard listener из `ChemistryDragProvider.tsx`
  (`window.addEventListener("keydown", ...)` с cleanup) — та же форма, новый провайдер.

## Риски

1. **Конфликт клавиши `E`/стрелок с вводом текста** (AI Teacher chat) — смягчается проверкой
   `document.activeElement` перед обработкой (см. "Новые файлы" выше).
2. **Фокус по курсору — не настоящий первый-лицо raycast** — явно временное решение, пересмотр
   в Stage S-7 (см. раздел 1). Не скрываю это как готовое решение.
3. **Дрожание hand-anchor от `enableDamping` OrbitControls** во время удержания — камера
   физически не двигается по вводу пользователя (orbit выключен), но damping может доводить
   позицию камеры до цели ещё пару кадров после последнего движения — визуально неощутимо,
   но стоит проверить вживую.
4. **Риск незавершённой миграции**: если в будущих стадиях (S-2+) забыть переносить новые
   объекты в новую систему, часть сцены рискует навсегда остаться на двух параллельных
   механизмах. Смягчение: список `STAGE_S1_INTERACTIVE_IDS` должен расти (а не старый список
   уменьшаться) явно, стадия за стадией, с явной пометкой в коде/HANDOFF, какие id уже
   мигрировали.
5. **Hitbox, подобранный под клик-драг, может плохо ловить hover-raycast** на разных дистанциях
   камеры (2.2–7, см. `ChemistryCanvas`) — потребует визуальной проверки радиуса для всех 3 POC
   объектов, возможна точечная подстройка `radius`/`height` только для этих трёх.

## План тестов

- `ChemistryInteractionProvider.test.tsx` (новый, чистая логика state machine):
  - `idle → focused` через `setFocused`; `focused → idle` через `clearFocused` с правильным id
    (и NO-OP при "чужом" id — защита от гонки);
  - `focused → held` через `pickUp`; повторный `pickUp` другого id **не меняет** `heldId`, пока
    не случится `release` (однопредметная модель);
  - `rotateHeld` меняет `heldYawOffset` только при `heldId !== null`, иначе no-op;
  - `release` сбрасывает `heldId` и `heldYawOffset` в исходное состояние.
- Существующие `ChemistryWorkspace*.test.tsx` / `ChemistryLabExperienceProvider*.test.tsx` —
  должны остаться зелёными без единой правки (доказательство нулевого воздействия на редьюсер).
- Ручная браузерная проверка (Claude-in-Chrome), по всем трём POC-объектам:
  наведение → кольцо+подсказка → `E` → предмет прыгает к руке и следует за камерой (Orbit
  реально не крутит камеру, пока зажат) → `←`/`→` реально поворачивают предмет в руке → `E`
  или `Escape` → предмет **точно** возвращается на исходное место/поворот → значения
  `totalVolumeMl`/`data` (проверить через debug mode/console) не изменились. Отдельно — что
  `test-tube-1` и все инструменты/бутылки вне POC-списка по-прежнему таскаются старым способом
  без каких-либо изменений в поведении.

## Критерии завершения Stage S-1

1. Все 3 POC-объекта проходят полный цикл Idle→Focused→Held→(поворот)→Release с возвратом
   ровно в исходное состояние (позиция, поворот, данные Chemistry Engine — без изменений).
2. Старая механика (drag/drop) не регрессировала ни на одном объекте вне POC-списка.
3. `ChemistryWorkspaceProvider.tsx` не изменён (проверяется diff'ом — 0 строк).
4. `tsc --noEmit`, `eslint`, `vitest run`, `pytest -q`, `next build` — все чистые.
5. Ручной браузерный проход по чек-листу выше — без консольных ошибок.
6. Ничего не закоммичено до отдельного подтверждения после этой проверки.

## Стратегия отката

Изменение полностью аддитивно: 2 новых файла + один новый тестовый файл + точечные условные
ветки внутри `ContainerMesh`/`StockBottleMesh`/`ChemistryCanvas` в одном файле
(`ChemistryWorldScene.tsx`), без единого изменения в редьюсере/типах/движках. Откат на этапе
разработки — просто отбросить незакоммиченные изменения (`git checkout -- <файлы>` или удалить
новые файлы). Если бы это уже было закоммичено — единичный, изолированный коммит, безопасно
отменяемый `git revert` без зависимостей, так как Stage S-2+ на его основе ещё не строилась.

---

**Код не писать, пока план не будет явно подтверждён.**
