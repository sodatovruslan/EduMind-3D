import { describe, expect, it } from "vitest";
import {
  ROOT_TILES,
  childrenOf,
  colsAtLevel,
  parentOf,
  parseTileKey,
  rowsAtLevel,
  tileBounds,
  tileCenter,
  tileKey,
  wrapX,
} from "./tiling";

describe("GeoWorld G2 — tiling: адресация тайлов (z/x/y)", () => {
  it("удваивает число столбцов/строк на каждом уровне, начиная с 2×1 на z=0", () => {
    expect(colsAtLevel(0)).toBe(2);
    expect(rowsAtLevel(0)).toBe(1);
    expect(colsAtLevel(1)).toBe(4);
    expect(rowsAtLevel(1)).toBe(2);
    expect(colsAtLevel(4)).toBe(32);
    expect(rowsAtLevel(4)).toBe(16);
  });

  it("tileKey/parseTileKey — точный roundtrip", () => {
    const id = { z: 3, x: 5, y: 2 };
    expect(parseTileKey(tileKey(id))).toEqual(id);
  });

  it("wrapX оборачивает долготу по модулю в обе стороны (без края, в отличие от широты)", () => {
    expect(wrapX(-1, 1)).toBe(3); // z=1 → cols=4, -1 оборачивается в последний столбец
    expect(wrapX(4, 1)).toBe(0); // переполнение через край оборачивается в начало
    expect(wrapX(2, 1)).toBe(2); // обычный индекс не трогается
  });

  it("родитель — null на корневом уровне (z=0)", () => {
    expect(parentOf({ z: 0, x: 0, y: 0 })).toBeNull();
    expect(parentOf({ z: 0, x: 1, y: 0 })).toBeNull();
  });

  it("parentOf(любой из childrenOf(id)) === id — обход дерева согласован в обе стороны", () => {
    const parents: Array<{ z: number; x: number; y: number }> = [
      { z: 0, x: 0, y: 0 },
      { z: 0, x: 1, y: 0 },
      { z: 2, x: 3, y: 1 },
      { z: 3, x: 7, y: 6 },
    ];
    for (const parent of parents) {
      const kids = childrenOf(parent);
      expect(kids).toHaveLength(4);
      for (const kid of kids) {
        expect(parentOf(kid)).toEqual(parent);
      }
      // все 4 потомка различны
      const keys = new Set(kids.map((k) => tileKey(k)));
      expect(keys.size).toBe(4);
    }
  });

  it("два корневых тайла на z=0 вместе покрывают всю планету без дыр/нахлёста", () => {
    expect(ROOT_TILES).toHaveLength(2);
    const [west, east] = ROOT_TILES.map(tileBounds);
    expect(west.latMin).toBe(-90);
    expect(west.latMax).toBe(90);
    expect(east.latMin).toBe(-90);
    expect(east.latMax).toBe(90);
    expect(west.lngMin).toBe(-180);
    expect(west.lngMax).toBe(east.lngMin); // стыкуются точно, без зазора/нахлёста
    expect(east.lngMax).toBe(180);
  });

  it("границы тайлов у полюсов — валидные числа, без NaN/переполнения диапазона", () => {
    const z = 3;
    const rows = rowsAtLevel(z);
    const northRow = tileBounds({ z, x: 0, y: 0 });
    const southRow = tileBounds({ z, x: 0, y: rows - 1 });
    expect(northRow.latMax).toBe(90);
    expect(Number.isFinite(northRow.latMin)).toBe(true);
    expect(southRow.latMin).toBe(-90);
    expect(Number.isFinite(southRow.latMax)).toBe(true);
  });

  it("центр тайла всегда внутри его собственных границ", () => {
    const ids = [
      { z: 0, x: 0, y: 0 },
      { z: 2, x: 5, y: 1 },
      { z: 4, x: 17, y: 9 },
    ];
    for (const id of ids) {
      const b = tileBounds(id);
      const c = tileCenter(id);
      expect(c.lat).toBeGreaterThanOrEqual(b.latMin);
      expect(c.lat).toBeLessThanOrEqual(b.latMax);
      expect(c.lng).toBeGreaterThanOrEqual(b.lngMin);
      expect(c.lng).toBeLessThanOrEqual(b.lngMax);
    }
  });

  it("шов на антимеридиане: соседние по долготе тайлы на одном уровне стыкуются встык", () => {
    const z = 2;
    const cols = colsAtLevel(z);
    for (let x = 0; x < cols; x++) {
      const a = tileBounds({ z, x, y: 0 });
      const b = tileBounds({ z, x: wrapX(x + 1, z), y: 0 });
      if (x + 1 < cols) {
        expect(a.lngMax).toBeCloseTo(b.lngMin, 10);
      } else {
        // последний тайл оборачивается на первый — a.lngMax=180, b.lngMin=-180 (тот же физический шов, не дыра)
        expect(a.lngMax).toBe(180);
        expect(b.lngMin).toBe(-180);
      }
    }
  });
});
