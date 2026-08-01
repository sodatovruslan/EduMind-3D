# EduMind Design System & Redesign Preparation Plan

Статус: **аудит и план, ничего не реализовано, ничего не закоммичено.**
Визуально в проекте на момент написания этого документа ничего не менялось.

---

## 1. Проблемы текущего дизайна

Подтверждено чтением кода (не предположения):

- **Sidebar зафиксирован навсегда**: `components/ui/Sidebar.tsx` — `fixed left-0 top-0 w-64 h-screen`, всегда 256px, сворачивания нет.
- **Layout жёстко резервирует место под UI**: `app/(app)/layout.tsx` — `<main className="ml-64 ... p-8 pt-24">`. Нет пути показать 3D-сцену на весь экран без переписывания этого файла.
- **3D-сцена — это врезанный блок фиксированной высоты, а не окружение**: `components/scenes/CanvasShell.tsx` — `<div className="relative h-[34rem] w-full overflow-hidden rounded-2xl border ...">`. Ровно это и создаёт ощущение "маленькая 3D-сцена внутри админ-панели" — сцена физически не может занять весь экран при текущей структуре.
- **Нет ни одного переиспользуемого базового компонента**: в `components/ui/` есть только `Sidebar`, `Navbar`, `LessonCard`, `Loader`. Нет `Button`, `Card`, `Panel`, `Dialog`, `Toast`, `Input`, `Select`, `Tooltip`, `Badge` — их не существует вообще (проверено grep по `Dialog|Modal|Toast|role="dialog"` — 0 совпадений во всём `components/`).
- **Стили дублируются в каждой странице заново**: `rounded-*` встречается в 134 местах в 31 файле, `shadow-*` — в 6 местах в 4 файлах, цвета Tailwind-палитры (`slate/indigo/violet/cyan/...`) — 322 раза в 33 файлах. Каждый файл сам решает, какой radius/тень/цвет использовать — согласованности нет, только визуальное совпадение по привычке.
- **Панели лабораторий (`components/lab/*Panel.tsx`, `ElectricityGuidedLabPanel.tsx`, `LabNotebookPanel.tsx`, `TaskPanel.tsx`, `AITeacherChat.tsx` и т.д.) — это самостоятельные страницы-компоненты**, каждая пишет свою разметку панели/карточки/заголовка с нуля, а не использует общий `Panel`/`Card`.
- Итог: интерфейс воспринимается как SaaS/CRM ровно потому, что архитектурно так и построено — постоянный sidebar + navbar + контентная колонка + врезанные боксы, как в обычной админке, а не как HUD поверх иммерсивного мира.

## 2. Карта существующих UI-компонентов

```
components/
├── ui/            Sidebar, Navbar, LessonCard, Loader      (общие, но не токенизированные)
├── core/          *Provider.tsx, *DragProvider.tsx          (чистая логика/state, БЕЗ визуала — не трогать)
├── scenes/        CanvasShell, ElectricityLabScene,
│                  ChemistryWorldScene, SimLabScene,
│                  GeoWorldScene                              (3D + вплетённый UI-оверлей внутри Canvas-обёртки)
├── ai/            AIAssistantChat, AITeacherChat,
│                  ChemistryTeacherChat                       (3 похожих чат-панели, дублируют разметку)
├── lab/           CompletionScreen, *CatalogBrowser,
│                  *GuidedLabPanel, *NotebookPanel,
│                  *ReportPanel, LabModeSelector              (9 файлов, каждый свой Card/Panel с нуля)
├── experiments/   ExperimentPanel
├── progress/      ProgressDashboard
├── tasks/         TaskPanel
└── tutorial/      TutorialPanel, ChemistryTutorialPanel

app/(app)/layout.tsx        — глобальный AppShell (Sidebar+Navbar+main), сейчас единственный и негибкий
app/(app)/dashboard, teacher, profile — обычные "плоские" страницы
app/(app)/{electricity_lab,chemistry_world,geo3d,simlab}/[id] — страницы-обёртки над Scene-компонентами
```

Ключевое наблюдение: **логика (core/) уже отделена от визуала образцово** — `ChemistryWorkspaceProvider`/`ExperimentStateProvider`/`ChemistryDragProvider` и т.п. не содержат JSX и не завязаны на тему. Это именно то разделение, вокруг которого стоит строить design system — сам слой данных редизайна не коснётся.

## 3. Список захардкоженных стилей

| Категория | Где | Пример |
|---|---|---|
| Цвета фона/поверхностей | частично токенизировано в `tailwind.config.ts` (`surface-deep`, `surface-slate`, `surface-container.*`, `brand`, `neon-cyan`, `neon-violet`, `glass-border`) — но рядом с этим 322 прямых обращения к сырой Tailwind-палитре (`slate-100`, `slate-400`, `indigo-500` и т.д.) в 33 файлах | `components/ui/Sidebar.tsx:24` `text-slate-100`, `ProgressDashboard.tsx` (12 обращений) |
| box-shadow / glow | смесь Tailwind-классов и сырых `rgba()` в CSS | `app/globals.css:17-40` (`.glass-panel`, glow-классы — 6 разных hardcoded rgba-теней), `Sidebar.tsx:40` inline `shadow-[0_0_10px_rgba(99,102,241,0.2)]` |
| border-radius | нет единого масштаба — `rounded-lg/xl/2xl/3xl/full` вперемешку, 134 вхождения, 31 файл | `ChemistryWorldScene.tsx` (16), `ElectricityLabScene.tsx` (12), `ProgressDashboard.tsx` (8) |
| Высота 3D-контейнера | зашито числом, не токен | `CanvasShell.tsx:103` `h-[34rem]` |
| Ширина sidebar / отступ контента | зашито числом в двух не связанных местах одновременно (Sidebar и layout должны совпадать вручную) | `Sidebar.tsx:22` `w-64`, `layout.tsx:13` `ml-64` |
| Шрифты | токенизировано через CSS-переменные (`--font-body/headline/mono`) — это уже хорошо, оставить как есть | `tailwind.config.ts` `fontFamily` |
| z-index | единичное значение, не системный масштаб | `Sidebar.tsx:22` `z-50` |

Вывод: часть фундамента (цвета фона, шрифты) уже частично токенизирована через `tailwind.config.ts` — редизайн не начинается с нуля. Но radius/shadow/spacing/z-index/высоты контейнеров нигде не собраны в масштаб — это и есть основная работа для design tokens.

## 4. Компоненты, которые можно оставить как есть

- Весь `components/core/*Provider.tsx` — чистый state, без JSX/темы, не пострадает от редизайна в принципе.
- `lib/circuit-engine.ts`, `lib/chemistry-engine.ts`, `lib/reaction-engine.ts`, `lib/experiment-validator.ts`, `lib/hazard-engine.ts` (и всё соседнее в `lib/`) — физика/химия, вне зоны редизайна по определению.
- Структура маршрутов `app/(app)/.../[id]/page.tsx` — сама структура страниц (fetch+render) остаётся, меняется только то, во что они рендерятся.
- `tailwind.config.ts` — база (`brand`, `surface-container` scale) годная отправная точка для tokens, не нужно выбрасывать, нужно расширить.

## 5. Компоненты, которые нужно переработать

- `app/(app)/layout.tsx` — сделать AppShell вариативным (обычный режим / fullscreen lab режим), а не единственной жёсткой структурой.
- `components/ui/Sidebar.tsx` — сделать сворачиваемым/скрываемым, вынести ширину в токен.
- `components/scenes/CanvasShell.tsx` — убрать фиксированную `h-[34rem]`, добавить режим "занимает весь доступный контейнер/экран" (не ломая текущих вызовов — новый проп с дефолтом = текущее поведение, как уже сделано для `minDistance/maxDistance` и т.п.).
- Три чат-панели (`AIAssistantChat`, `AITeacherChat`, `ChemistryTeacherChat`) — свести к одному переиспользуемому `AITeacherPanel` + разной "прошивке" контекста, вместо трёх копий разметки.
- Все `*Panel.tsx`/`*Browser.tsx`/`*Screen.tsx` в `components/lab/` — сейчас каждый верстает карточку/панель с нуля; перевести на общий `Panel`/`Card`/`CollapsiblePanel` после их появления.
- `app/globals.css` — заменить hardcoded `rgba(...)` в `.glass-panel`/glow-классах на CSS-переменные из будущих tokens.

## 6. Новые базовые компоненты, которые потребуются

Приняты категории из запроса пользователя как итоговый список для будущей реализации (сейчас — не пишем ни одного из них):

**Общие:** `AppShell`, `Navigation`, `Topbar`, `Button`, `IconButton`, `Card`, `Panel`, `CollapsiblePanel`, `Tabs`, `Input`, `Select`, `Slider`, `Dialog`, `Drawer`, `Tooltip`, `Badge`, `Progress`, `Toast`, `EmptyState`, `LoadingState`, `ErrorState`.

**Специализированные для 3D-миров:** `WorldHUD`, `InteractionPrompt`, `ObjectInfoPanel`, `ToolPanel`, `AITeacherPanel` (замена трёх текущих чатов), `TaskPanel` (переработанная версия текущего), `SafetyAlert`, `MeasurementDisplay`, `SandboxEventLog`, `TeacherAssignmentStatus`, `FullscreenToggle` (см. раздел 9а — Immersive Fullscreen Laboratory Mode).

Все они физически будут жить в новой директории `components/ui/` (базовые) и `components/hud/` (специализированные под 3D), и не должны импортировать ничего из `components/core/*Provider` напрямую — только принимать данные через props, чтобы визуальный слой оставался полностью отделён от Chemistry/Electricity/GeoWorld-логики.

## 7. Структура design tokens (предложение)

Формат: CSS-переменные в `app/globals.css` (тема переключается заменой значений переменных), Tailwind config читает переменные через `var(--token-name)` — так грядущая замена темы = замена одного блока `:root { ... }`, без правки компонентов.

```
--eduM-bg                 (было surface-deep)
--eduM-surface            (было surface-slate)
--eduM-surface-elevated   (было surface-container.high/highest)
--eduM-text-primary
--eduM-text-secondary
--eduM-text-muted
--eduM-border
--eduM-accent             (было brand)
--eduM-accent-secondary   (было neon-cyan / neon-violet — свести в одну пару accent/accent-secondary)
--eduM-success
--eduM-warning
--eduM-danger
--eduM-focus-ring
--eduM-shadow-sm/md/lg/glow
--eduM-radius-sm/md/lg/xl/full
--eduM-space-1..8         (числовой шаг, сейчас произвольные p-*/gap-* без системы)
--eduM-font-body/headline/mono   (уже есть — переносится без изменений)
--eduM-motion-fast/base/slow     (сейчас transition-длительности не токенизированы вообще)
--eduM-z-nav/z-hud/z-dialog/z-toast   (сейчас один жёсткий z-50)
```

## 8. Будущая архитектура AppShell

Два режима вместо одного жёсткого layout:

- **Standard mode** (dashboard, profile, teacher, каталоги) — текущий sidebar+navbar+content, но sidebar сворачиваемый, ширина через токен, не задвоенное число в двух файлах.
- **Immersive Lab mode** (electricity_lab/chemistry_world/geo3d/simlab при заходе в конкретную симуляцию) — 3D-сцена = фон на весь viewport; Sidebar/Navbar по умолчанию скрыты/свёрнуты в тонкий edge-tab; весь остальной UI (`WorldHUD`, `AITeacherPanel`, `TaskPanel`, `SandboxEventLog`) — плавающие панели/drawers поверх Canvas, не в потоке документа.

Технически: `AppShell` получает `mode: "standard" | "immersive"` и рендерит разный набор обвязки вокруг `{children}`, сама страница (`.../[id]/page.tsx`) решает, какой режим ей нужен — правки в самих 3D-сценах/движках не требуются.

## 9. Концепция интерфейса внутри 3D-песочницы

- Лаборатория — весь экран (или почти весь, с тонкой edge-полосой для возврата).
- `WorldHUD` — минимальная всегда видимая полоса (название симуляции, кнопка "выход на dashboard", индикатор качества/FPS) — тонкая, не панель.
- `InteractionPrompt` — контекстная подсказка у объекта в фокусе (Stage S-1 будет реализовывать сам факт фокуса — это визуальный компонент поверх него).
- `ObjectInfoPanel`/`MeasurementDisplay` — всплывают у выбранного объекта/прибора, не занимают постоянное место.
- `AITeacherPanel`, `TaskPanel`, `SandboxEventLog` — сворачиваемые drawers сбоку/снизу, по умолчанию свёрнуты в иконку, разворачиваются по клику, не перекрывают стол/полки насовсем.
- `SafetyAlert` — модальный/тост-приоритетный компонент (единственный случай, где перекрытие сцены оправдано).
- Постоянных тяжёлых боковых панелей быть не должно — то, что сейчас занимает `ml-64` навсегда, должно освобождаться при входе в лабораторию.

## 9а. Immersive Fullscreen Laboratory Mode (обязательный будущий режим)

Зафиксировано по отдельному запросу пользователя как **обязательное** требование к
будущему AppShell — не реализуется сейчас, но архитектура Interaction Core (Stage
S-1+) должна с самого начала оставлять для него место (см. пункт 7 ниже, про Escape).

**Требования:**

1. Лаборатория занимает весь экран браузера.
2. Обычные `Sidebar` и `Navbar` полностью скрываются (не просто сворачиваются в
   иконку — исчезают из layout).
3. Остаётся только минимальный прозрачный HUD: выход из лаборатории, текущее
   задание, `InteractionPrompt`, индикатор предмета в руке, AI Teacher,
   `SafetyAlert`, пауза/сброс, выход из полноэкранного режима.
4. Все панели (задания, AI Teacher, каталог, notebook) открываются поверх мира
   как компактные drawer/popover и закрываются обратно — ничего не занимает
   постоянное место в layout.
5. AI Teacher сворачиваемый, никогда не перекрывает рабочую область насовсем.
6. Fullscreen через Fullscreen API (`element.requestFullscreen()`), с
   корректным fallback (просто fullscreen-стили на весь viewport через CSS),
   если браузер/окружение запрещает настоящий fullscreen (частый случай в
   школьных Chromebook-политиках).
7. **Приоритет обработки Escape** (важно для Interaction Core уже сейчас —
   см. ниже): если предмет в руке — сначала освободить/вернуть его; если
   открыта панель/drawer — закрыть панель; и только затем, если ничего из
   этого не сработало, выходить из fullscreen. Это ЗНАЧИТ, что будущий слой
   fullscreen-режима должен перехватывать Escape ПОСЛЕ Interaction Core, а не
   вместо него — Interaction Core уже сегодня (Stage S-1) реализует свою
   часть этой цепочки (`release()` по Escape), и это не потребует переделки,
   когда появится сам fullscreen-режим — фактически нужно будет только
   добавить следующие звенья цепочки (закрыть панель → выйти из fullscreen),
   не трогая существующую логику.
8. После выхода из fullscreen: состояние лаборатории не теряется, эксперимент
   не сбрасывается, камера не прыгает, предметы остаются на своих местах,
   AI-сессия сохраняется — то есть fullscreen toggle обязан быть чисто
   CSS/layout-переключением поверх уже смонтированного дерева React, а не
   remount сцены.
9. Режим должен работать одинаково и с текущим OrbitControls, и с будущим
   первым лицом/свободным перемещением (Stage S-7) — фулскрин не завязан на
   конкретную схему управления камерой.
10. Fullscreen Mode — уровень `AppShell`/UI. Не связывается с Chemistry
    Engine/Circuit Engine/Reaction Engine/AI backend/прогрессом или какой-либо
    другой доменной логикой ни в каком виде.

**Как это уже сейчас влияет на Interaction Core:** `ChemistryInteractionProvider`
(Stage S-1) обрабатывает Escape как "если держим предмет — отпустить" и ничего
больше — он не глотает Escape безусловно и не мешает будущему уровню выше
добавить свои ветки (закрыть панель / выйти из fullscreen) в ту же цепочку
позже. Раскладка по приоритету (предмет → панель → fullscreen) должна
собираться на уровне, ГДЕ будет жить fullscreen-режим (будущий `AppShell`), а
не переписыванием `ChemistryInteractionProvider`.

## 10. План миграции по этапам

1. **Tokens** — ввести CSS-переменные (раздел 7) + прокинуть их в `tailwind.config.ts`, не меняя ни одного значения по факту (переменная = текущее значение). Нулевой визуальный эффект, проверяется побайтовым сравнением скриншотов.
2. **Базовые компоненты-обёртки** — создать `Button/Card/Panel/Input/...`, каждый — тонкая обёртка, которая по умолчанию рендерит ТЕ ЖЕ классы, что сейчас руками пишутся в местах использования (то есть визуально ничего не меняется, просто разметка перестаёт дублироваться).
3. **Точечная замена** дублирующейся разметки в `components/lab/*`, `components/ai/*` на новые базовые компоненты, файл за файлом, с visual diff проверкой после каждого.
4. **AppShell + Immersive mode** — добавить `mode` в layout, перевести лабораторные страницы на `immersive`, `CanvasShell` получает "занять весь контейнер" вариант.
5. **HUD-компоненты** — `WorldHUD`/`InteractionPrompt`/`SandboxEventLog`/`SafetyAlert` и т.д. — уже поверх Interaction Core (Stage S-1+), который к этому моменту должен существовать.
6. **Смена темы** — как финальная демонстрация системы: замена значений в `:root` без правки компонентов.

## 11. Риски регрессий

- Sidebar/Navbar тесно связаны через захардкоженные `w-64`/`ml-64` в разных файлах — при переносе в токен есть риск рассинхронизации, если забыть один из двух. Смягчение: вводить токен и в тот же PR/коммит проверять оба места.
- `CanvasShell.tsx` используется 4 модулями (SimLab/GeoWorld/Electricity Lab/Chemistry World) — любое изменение дефолтов может незаметно сломать один из них. Смягчение: новый функционал — всегда через новый необязательный проп с дефолтом = старое поведение (уже установившийся паттерн в проекте, см. `minDistance/maxAzimuthAngle` в резюме сессии).
- Три AI-чат компонента исторически могли разойтись по мелкой логике (не только визуалу) — сведение в один `AITeacherPanel` требует сверки построчно перед удалением дублей, не просто визуального слияния.
- `.glass-panel`/glow классы в `globals.css` используются в 3D-сценах для HTML-оверлеев (`<Html>` из drei) — при токенизации нужно визуально сверить именно внутри Canvas, не только в обычных страницах.
- Testid-разметка (`data-testid="terminal-{id}"` и т.п.), используемая для автоматического браузерного тестирования — не должна быть задета редизайном ни в одном компоненте.

## 12. Рекомендуемый порядок реализации после Interaction Core

Редизайн стартует ТОЛЬКО после того, как физика/химия и Stage S-1..S-7 (Interaction Core) стабилизированы и покрыты тестами. Рекомендуемый порядок при старте: разделы 10.1 → 10.2 → 10.3 → 10.4 → 10.5 → 10.6, с ручной верификацией (tsc/eslint/vitest/build/browser) после каждого шага, отдельным коммитом на шаг, ни один шаг не меняет Chemistry/Circuit/Reaction/Hazard-движки, AI backend, API-контракты, Interaction Manager или state management — только визуальный слой.

## 13. Файлы, которые будут затронуты (примерный список)

```
НОВЫЕ:
frontend/app/globals.css                         (+ CSS-переменные tokens)
frontend/tailwind.config.ts                       (расширение: чтение из var(--...))
frontend/components/ui/Button.tsx                 (новый)
frontend/components/ui/Card.tsx                   (новый)
frontend/components/ui/Panel.tsx                  (новый)
frontend/components/ui/CollapsiblePanel.tsx       (новый)
frontend/components/ui/Input.tsx                  (новый)
frontend/components/ui/Select.tsx                 (новый)
frontend/components/ui/Slider.tsx                 (новый)
frontend/components/ui/Dialog.tsx                 (новый)
frontend/components/ui/Drawer.tsx                 (новый)
frontend/components/ui/Tooltip.tsx                (новый)
frontend/components/ui/Badge.tsx                  (новый)
frontend/components/ui/Toast.tsx                  (новый)
frontend/components/ui/EmptyState.tsx             (новый)
frontend/components/ui/LoadingState.tsx           (новый)
frontend/components/ui/ErrorState.tsx             (новый)
frontend/components/hud/WorldHUD.tsx              (новый)
frontend/components/hud/InteractionPrompt.tsx     (новый)
frontend/components/hud/ObjectInfoPanel.tsx       (новый)
frontend/components/hud/ToolPanel.tsx             (новый)
frontend/components/hud/AITeacherPanel.tsx        (новый, заменит 3 файла ниже)
frontend/components/hud/SafetyAlert.tsx           (новый)
frontend/components/hud/MeasurementDisplay.tsx    (новый)
frontend/components/hud/SandboxEventLog.tsx       (новый)
frontend/components/hud/TeacherAssignmentStatus.tsx (новый)

ИЗМЕНЯЮТСЯ (структурно, не физика):
frontend/app/(app)/layout.tsx                     (mode: standard | immersive)
frontend/components/ui/Sidebar.tsx                (сворачиваемость, токен ширины)
frontend/components/ui/Navbar.tsx
frontend/components/scenes/CanvasShell.tsx        (fullscreen-вариант, новый необязательный проп)
frontend/components/ai/AIAssistantChat.tsx        (слить в AITeacherPanel или обернуть)
frontend/components/ai/AITeacherChat.tsx          (—//—)
frontend/components/ai/ChemistryTeacherChat.tsx   (—//—)
frontend/components/lab/*.tsx (9 файлов)          (перевод на Card/Panel/Button)
frontend/components/experiments/ExperimentPanel.tsx
frontend/components/progress/ProgressDashboard.tsx
frontend/components/tasks/TaskPanel.tsx
frontend/components/tutorial/*.tsx (2 файла)
frontend/app/(app)/dashboard/page.tsx
frontend/app/(app)/teacher/page.tsx
frontend/app/(app)/profile/page.tsx
frontend/app/(auth)/login/page.tsx, register/page.tsx, layout.tsx   (тоже на общих tokens)

НЕ ТРОГАЮТСЯ:
frontend/components/core/*                        (state, без JSX)
frontend/lib/*-engine.ts, *-validator.ts           (физика/химия)
frontend/components/scenes/*Scene.tsx              (3D-геометрия/материалы — трогаются только HUD-оверлеи внутри них, не 3D-объекты)
backend/*                                          (не затрагивается редизайном вообще)
```

---

**Ничего из вышеперечисленного не реализовано.** Документ — план на будущее, актуален после стабилизации Interaction Core (Stage S-1..S-7) и Chemistry/Electricity ядра. Визуальный редизайн начнётся только по отдельному подтверждению.
