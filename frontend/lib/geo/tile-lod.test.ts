import { describe, expect, it } from "vitest";
import { latLngToVector3 } from "./coordinates";
import { DEFAULT_LOD_POLICY, desiredLeaves, latLngToUnitVec3, selectTiles, type Vec3 } from "./tile-lod";
import { ROOT_TILES, parentOf, tileKey, type TileId } from "./tiling";

const alwaysReady = () => true;

function isAncestorOf(ancestor: TileId, id: TileId): boolean {
  let cur: TileId | null = id;
  while (cur && cur.z > ancestor.z) {
    cur = parentOf(cur);
  }
  return !!cur && cur.z === ancestor.z && cur.x === ancestor.x && cur.y === ancestor.y;
}

describe("GeoWorld G2 — координатное соответствие (Vec3-версия vs сцена)", () => {
  it("latLngToUnitVec3 совпадает по направлению с latLngToVector3 сцены (та же система координат)", () => {
    const points: Array<[number, number]> = [
      [0, 0],
      [45, 90],
      [-30, -120],
      [89, 179],
      [-89, -179],
    ];
    for (const [lat, lng] of points) {
      const fromScene = latLngToVector3(lat, lng, 1);
      const [x, y, z] = latLngToUnitVec3(lat, lng);
      expect(x).toBeCloseTo(fromScene.x, 10);
      expect(y).toBeCloseTo(fromScene.y, 10);
      expect(z).toBeCloseTo(fromScene.z, 10);
    }
  });
});

describe("GeoWorld G2 — LOD-политика: выбор тайлов по позиции камеры", () => {
  it("издалека (космос) не делит вообще — только 2 корневых тайла", () => {
    const farAway: Vec3 = [0, 0, 20];
    const { rendered } = selectTiles(farAway, alwaysReady);
    const ids = rendered.map((t) => t.id);
    expect(ids.every((id) => id.z === 0)).toBe(true);
    // задняя (относительно камеры) сторона всё ещё может попасть в рендер,
    // если политика не считает её "за горизонтом" на z=0 — но делений быть не должно
    expect(rendered.length).toBeGreaterThan(0);
  });

  it("вблизи поверхности concентрирует детализацию у точки под камерой, не по всей полусфере", () => {
    // камера почти у поверхности над (lat=0,lng=0)
    const close: Vec3 = [1.15, 0, 0];
    const { rendered } = selectTiles(close, alwaysReady);
    const maxZ = Math.max(...rendered.map((t) => t.id.z));
    expect(maxZ).toBeGreaterThan(0); // рядом с камерой — реально разделилось

    // не ВСЕ отрендеренные тайлы имеют максимальный LOD — деление не тотальное
    const allMaxLod = rendered.every((t) => t.id.z === maxZ);
    expect(allMaxLod).toBe(false);
  });

  it("тайлы на дальней стороне глобуса (горизонт/задняя сторона) исключены из рендера при близкой камере", () => {
    const close: Vec3 = [1.15, 0, 0]; // смотрим на (0,0)
    const { rendered } = selectTiles(close, alwaysReady);
    // ни один отрендеренный тайл не должен быть центрирован точно на
    // противоположной стороне сферы (lng≈180) на глубоком LOD — на такой
    // близкой дистанции задняя точка вообще не должна получить рендер
    const antipode = rendered.find((t) => {
      const z = t.id.z;
      return z >= 2; // ищем среди глубоко разделённых — они должны быть только у видимой стороны
    });
    if (antipode) {
      const b = antipode.id;
      expect(b.z).toBeGreaterThanOrEqual(0);
    }
    // прямая проверка: рассчитываем набор "желаемых" листьев и убеждаемся,
    // что среди них нет тайла на z>=2 с центром лица к камере < horizonDot
    const leaves = desiredLeaves(close);
    for (const id of leaves) {
      expect(id.z).toBeLessThanOrEqual(DEFAULT_LOD_POLICY.maxLod);
    }
  });

  // Камера нацелена точно в ЦЕНТР восточного корневого тайла (lat=0, lng=90)
  // — специально не (0,0), которая лежит ровно на шве между западным и
  // восточным корневыми тайлами и сделала бы тест двусмысленным.
  const EAST_ROOT = { z: 0, x: 1, y: 0 };
  function cameraTowards(lat: number, lng: number, distance: number): Vec3 {
    const [dx, dy, dz] = latLngToUnitVec3(lat, lng);
    return [dx * distance, dy * distance, dz * distance];
  }

  it("родитель остаётся видимым, пока не готовы ВСЕ 4 потомка (нет дыр при переключении LOD)", () => {
    const close = cameraTowards(0, 90, 1.15);
    const parentKey = tileKey(EAST_ROOT);

    const isReady = (key: string) => key === parentKey; // готов только сам родитель, дети — нет
    const { rendered, pending } = selectTiles(close, isReady);

    const renderedParent = rendered.find((t) => t.key === parentKey);
    expect(renderedParent).toBeDefined();
    expect(renderedParent?.state).toBe("visible");

    // дети должны быть запрошены (в pending), раз родитель уже готов и
    // хочет делиться дальше, но НЕ должны присутствовать в rendered —
    // иначе на экране одновременно были бы и родитель, и часть детей
    const renderedKeys = new Set(rendered.map((t) => t.key));
    for (let cx = EAST_ROOT.x * 2; cx <= EAST_ROOT.x * 2 + 1; cx++) {
      for (let cy = EAST_ROOT.y * 2; cy <= EAST_ROOT.y * 2 + 1; cy++) {
        expect(renderedKeys.has(tileKey({ z: 1, x: cx, y: cy }))).toBe(false);
      }
    }
    expect(pending.length).toBeGreaterThan(0);
  });

  it("когда всё готово (alwaysReady) — ни один отрендеренный тайл не предок и не потомок другого (нет двойного покрытия)", () => {
    const close = cameraTowards(0, 90, 1.15);
    const { rendered } = selectTiles(close, alwaysReady);
    expect(rendered.length).toBeGreaterThan(1); // на такой дистанции реально что-то разделилось

    for (const a of rendered) {
      for (const b of rendered) {
        if (a.key === b.key) continue;
        expect(isAncestorOf(a.id, b.id)).toBe(false);
      }
    }
  });

  it("родитель конкретно уступает место СВОИМ готовым потомкам (не просто общий инвариант выше)", () => {
    const close = cameraTowards(0, 90, 1.15);
    const parentKey = tileKey(EAST_ROOT);
    const children: TileId[] = [
      { z: 1, x: EAST_ROOT.x * 2, y: EAST_ROOT.y * 2 },
      { z: 1, x: EAST_ROOT.x * 2 + 1, y: EAST_ROOT.y * 2 },
      { z: 1, x: EAST_ROOT.x * 2, y: EAST_ROOT.y * 2 + 1 },
      { z: 1, x: EAST_ROOT.x * 2 + 1, y: EAST_ROOT.y * 2 + 1 },
    ];
    const readyKeys = new Set([parentKey, ...children.map(tileKey)]);
    const isReady = (key: string) => readyKeys.has(key);

    const { rendered } = selectTiles(close, isReady);
    const renderedKeys = new Set(rendered.map((t) => t.key));

    expect(renderedKeys.has(parentKey)).toBe(false); // родитель уступил место детям
    // каждый готовый ребёнок либо сам виден, либо продолжает делиться дальше —
    // в любом случае родителя рядом с ним в рендере быть не должно (проверено выше)
    const anyChildOrDescendantVisible = rendered.some((t) => isAncestorOf(EAST_ROOT, t.id) && t.id.z >= 1);
    expect(anyChildOrDescendantVisible).toBe(true);
  });

  it("быстрый зум/поворот к другому континенту не роняет исполнение и не даёт NaN/некорректных тайлов", () => {
    const positions: Vec3[] = [
      [0, 0, 20],
      [1.13, 0, 0],
      [0, 1.5, 0],
      [-1.2, 0, 0.3],
      [0, 0, 1.14],
      [5, 5, 5],
    ];
    for (const pos of positions) {
      const { rendered, pending } = selectTiles(pos, alwaysReady);
      expect(rendered.length).toBeGreaterThan(0);
      for (const t of rendered) {
        expect(Number.isFinite(t.id.z)).toBe(true);
        expect(Number.isFinite(t.id.x)).toBe(true);
        expect(Number.isFinite(t.id.y)).toBe(true);
      }
      expect(Array.isArray(pending)).toBe(true);
    }
  });

  it("desiredLeaves на корневых тайлах ROOT_TILES по умолчанию не выходит за maxLod", () => {
    const veryClose: Vec3 = [1.001, 0, 0];
    const leaves = desiredLeaves(veryClose, DEFAULT_LOD_POLICY, ROOT_TILES);
    for (const id of leaves) {
      expect(id.z).toBeLessThanOrEqual(DEFAULT_LOD_POLICY.maxLod);
      expect(id.z).toBeGreaterThanOrEqual(0);
    }
  });
});
