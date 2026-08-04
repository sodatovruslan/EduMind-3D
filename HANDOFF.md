# HANDOFF — для следующего AI-агента

Этот файл — рабочая заметка о том, что происходит ПРЯМО СЕЙЧАС, а не документация проекта.
Цель: если пользователь переключится на другого AI/агента, тот должен понять состояние проекта из этого файла за 5 минут.

Обновляется по ходу работы.

**Последнее обновление: 2026-08-04** (Stage S-7 v2 S7-V2.1..V2.12 полностью ЗАВЕРШЕНЫ и ЗАКОММИЧЕНЫ. В работе: Stage S7-V2.13 — Final Polish, Performance, Full Regression & Delivery).

---

## Актуальное состояние на 2026-08-04

- **Ветка разработки**: `feature/stage-s7-v2-locomotion`
- **HEAD**: `0485e29` (`feat(chemistry): isolate sandbox locomotion from observation pipeline`)
- **Закоммиченные этапы S7 v2**:
  - `e49d33c` `feat(sandbox): add isolated WASD locomotion prototype` (S7-V2.1..V2.2)
  - `f083a07` `feat(sandbox): add dynamic room bounds and wall collisions` (S7-V2.3..V2.4)
  - `ab815c3` `feat(sandbox): add furniture collision and kinematic sliding` (S7-V2.5)
  - `d6a5773` `feat(sandbox): add cabinet interaction bounds and reach gating` (S7-V2.6)
  - `ac5e220` `feat(sandbox): add prototype pickup and held rig` (S7-V2.7)
  - `5efcda8` `feat(chemistry): add toggleable sandbox camera mode` (S7-V2.8)
  - `184bd54` `feat(chemistry): register real scene sandbox locomotion` (S7-V2.8 registration)
  - `8c26acc` `feat(chemistry): add unified sandbox interaction pipeline` (S7-V2.9)
  - `df8bd84` `feat(chemistry): add sandbox placement and cabinet storage` (S7-V2.10)
  - `27a3ebc` `feat(chemistry): integrate sandbox pouring with chemistry pipeline` (S7-V2.11)
  - `0485e29` `feat(chemistry): isolate sandbox locomotion from observation pipeline` (S7-V2.12)
- **Проверки**:
  - `npx tsc --noEmit` — **0 ошибок** (PASS)
  - `pytest -q` — **45/45 PASSED** (PASS)
  - `npx vitest run` — **368/368 PASSED** (PASS)

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
