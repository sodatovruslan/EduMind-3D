# Stage S-2.5 — Interactable Coverage

## Scope

Stage S-2.5 подключает переносимые лабораторные предметы к общим Interaction Core
и Placement Core, сохраняя существующие drag, pouring, heating и measuring actions.

## Capability contract

Каждый переносимый объект описывается единым registry: `canBeHeld`,
`canBePlaced`, `allowedSurfaces`, `canPickUpNow(state)`, `blockedReason`,
`legacyDragMode`, hand transform и placement footprint.

## Deferred work

- TODO (Stage S-4): после появления настоящего доменного `isCapOpen` запретить
  перенос открытых stock bottles. В S-2.5 отсутствующее состояние крышки не
  симулируется и не блокирует бутылки.
- Compatible shelf surfaces и storage slots относятся к Stage S-3.
- Реалистичная ориентация лежащих тонких инструментов не входит в S-2.5.
- Стеклянная палочка в S-2.5 является только физическим предметом; перемешивание
  и химические эффекты отложены.

## Acceptance boundary

Автоматически проверяются registry coverage, Focused/Held, placement, Escape,
ограничения горелки и отсутствие стационарных объектов в registry. В браузере
семейства проверяются отдельными короткими Chromium-сценариями; субъективные
hover comfort и естественность управления требуют ручной проверки.
