import { describe, it, expect } from "vitest";
import {
  TABLE_SURFACE,
  isPointOnSurface,
  isPointClearOfOccupants,
  isPlacementValid,
  getFootprintRadius,
  type PlacementOccupant,
} from "./placement-surfaces";

describe("isPointOnSurface", () => {
  it("точка далеко от края с учетом радиуса — внутри", () => {
    expect(isPointOnSurface([0, 0], TABLE_SURFACE, 0.32)).toBe(true);
  });

  it("центр внутри границ, но радиус выталкивает край предмета за границу — снаружи", () => {
    // minX = -4.5, точка на -4.4 с радиусом 0.32 -> левый край на -4.72, вне стола
    expect(isPointOnSurface([-4.4, 0], TABLE_SURFACE, 0.32)).toBe(false);
  });

  it("точка ровно на границе (край предмета точно совпадает с краем стола) — включительно валидна", () => {
    // x - radius === minX ровно
    expect(isPointOnSurface([TABLE_SURFACE.minX + 0.32, 0], TABLE_SURFACE, 0.32)).toBe(true);
  });

  it("центр вне границ по Z — снаружи", () => {
    expect(isPointOnSurface([0, 3], TABLE_SURFACE, 0.1)).toBe(false);
  });
});

describe("isPointClearOfOccupants", () => {
  it("пустой список занятых точек — всегда валидно", () => {
    expect(isPointClearOfOccupants([0, 0], 0.32, [])).toBe(true);
  });

  it("далекий сосед — валидно", () => {
    expect(isPointClearOfOccupants([0, 0], 0.32, [{ position: [3, 3], radius: 0.32 }])).toBe(true);
  });

  it("сосед вплотную (пересечение по сумме радиусов) — блок", () => {
    expect(isPointClearOfOccupants([0, 0], 0.32, [{ position: [0.3, 0], radius: 0.32 }])).toBe(false);
  });

  it("расстояние ровно на границе (radius + occupant.radius + margin) — включительно валидно", () => {
    const radius = 0.32;
    const occupantRadius = 0.17;
    const exactDistance = radius + occupantRadius + 0.06;
    expect(isPointClearOfOccupants([0, 0], radius, [{ position: [exactDistance, 0], radius: occupantRadius }])).toBe(true);
  });

  it("несколько занятых точек — блок, если хотя бы одна слишком близко", () => {
    const occupants: PlacementOccupant[] = [
      { position: [5, 5], radius: 0.3 },
      { position: [0.1, 0], radius: 0.32 },
    ];
    expect(isPointClearOfOccupants([0, 0], 0.32, occupants)).toBe(false);
  });
});

describe("isPlacementValid", () => {
  it("валидно только когда одновременно в границах И свободно", () => {
    const occupants: PlacementOccupant[] = [{ position: [1.2, 0.6], radius: 0.32 }];
    expect(isPlacementValid([0, 0], 0.32, TABLE_SURFACE, occupants)).toBe(true);
    expect(isPlacementValid([1.2, 0.6], 0.32, TABLE_SURFACE, occupants)).toBe(false); // занято
    expect(isPlacementValid([10, 10], 0.32, TABLE_SURFACE, occupants)).toBe(false); // вне стола
  });

  it("переносимый предмет не блокирует сам себя исходной позицией (occupants должны исключать его заранее)", () => {
    // сам вызывающий код обязан исключить держимый предмет из occupants —
    // здесь просто проверяем, что при пустом occupants точка исходной позиции валидна
    expect(isPlacementValid([0, 0], 0.32, TABLE_SURFACE, [])).toBe(true);
  });
});

describe("getFootprintRadius", () => {
  it("известный kind — точное значение", () => {
    expect(getFootprintRadius("beaker")).toBe(0.32);
    expect(getFootprintRadius("scale")).toBe(0.35);
  });

  it("неизвестный kind — разумный дефолт, не падает", () => {
    expect(getFootprintRadius("unknown_kind")).toBeGreaterThan(0);
  });
});
