import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  LAYER_ORDER,
  LAYER_RADII,
  CUT_LAYERS,
  CUT_PLANE,
  computeLayerOpacity,
  isClickOnVisibleSurface,
  computeCameraDistance,
  computeCameraPosition,
  MAX_CAMERA_DISTANCE,
} from "./earthStructureGeometry";

// G6.12 QA FIX — владелец продукта нашёл, что Earth Structure Mode
// визуально не показывал строение Земли (4 полные непрозрачные вложенные
// сферы, внешняя перекрывала всё внутреннее). Эти тесты покрывают ИМЕННО
// исправленную логику (сколько слоёв, какие вырезаются, как считается
// прозрачность, какая сторона среза кликабельна) — не пытаются доказать
// визуальное качество unit-тестами (для этого нужна ручная browser QA,
// см. отчёт), только то, что логика, определяющая видимость/выбор, верна.

describe("4 Earth layers exist, in surface-to-center order", () => {
  it("ровно 4 слоя: crust, mantle, outer_core, inner_core", () => {
    expect(LAYER_ORDER).toEqual(["crust", "mantle", "outer_core", "inner_core"]);
  });

  it("радиусы убывают от поверхности к центру (каждый следующий слой строго меньше предыдущего)", () => {
    const radii = LAYER_ORDER.map((l) => LAYER_RADII[l]);
    for (let i = 1; i < radii.length; i++) {
      expect(radii[i]).toBeLessThan(radii[i - 1]);
    }
  });

  it("каждый слой имеет положительный радиус (реальное visual representation, не нулевая геометрия)", () => {
    for (const layer of LAYER_ORDER) {
      expect(LAYER_RADII[layer]).toBeGreaterThan(0);
    }
  });
});

describe("cutaway — какие слои разрезаны", () => {
  it("crust/mantle/outer_core вырезаны (иначе внешний слой скрывал бы внутренние — сам баг, который мы чиним)", () => {
    expect(CUT_LAYERS.has("crust")).toBe(true);
    expect(CUT_LAYERS.has("mantle")).toBe(true);
    expect(CUT_LAYERS.has("outer_core")).toBe(true);
  });

  it("inner_core НЕ вырезан (внутри самого глубокого слоя уже нечего показывать)", () => {
    expect(CUT_LAYERS.has("inner_core")).toBe(false);
  });
});

describe("computeLayerOpacity — selection/highlight state", () => {
  it("без выбора — полная непрозрачность у всех слоёв (структура видна геометрией среза, не x-ray)", () => {
    expect(computeLayerOpacity(false, false)).toBe(1);
  });

  it("выбранный слой — полностью непрозрачный (clearly highlighted)", () => {
    expect(computeLayerOpacity(true, true)).toBe(1);
  });

  it("невыбранный слой при активном выборе — приглушён, но НЕ невидим (visible for spatial context)", () => {
    const opacity = computeLayerOpacity(true, false);
    expect(opacity).toBeGreaterThan(0);
    expect(opacity).toBeLessThan(1);
  });
});

describe("isClickOnVisibleSurface — клик регистрируется только на реально видимой стороне среза", () => {
  it("inner_core (не вырезан) — клик засчитывается с любой стороны", () => {
    expect(isClickOnVisibleSurface("inner_core", new THREE.Vector3(0, 0, 1))).toBe(true);
    expect(isClickOnVisibleSurface("inner_core", new THREE.Vector3(0, 0, -1))).toBe(true);
  });

  it("вырезанный слой — точка на видимой (дальней от камеры) стороне засчитывается", () => {
    const visiblePoint = new THREE.Vector3(0.3, 0.2, -0.8);
    expect(CUT_PLANE.distanceToPoint(visiblePoint)).toBeGreaterThanOrEqual(0);
    expect(isClickOnVisibleSurface("crust", visiblePoint)).toBe(true);
  });

  it("вырезанный слой — точка на отрезанной (ближней к камере) стороне НЕ засчитывается (реальный баг raycast-vs-clippingPlanes)", () => {
    const clippedPoint = new THREE.Vector3(0.3, 0.2, 0.8);
    expect(CUT_PLANE.distanceToPoint(clippedPoint)).toBeLessThan(0);
    expect(isClickOnVisibleSurface("crust", clippedPoint)).toBe(false);
    expect(isClickOnVisibleSurface("mantle", clippedPoint)).toBe(false);
    expect(isClickOnVisibleSurface("outer_core", clippedPoint)).toBe(false);
  });
});

describe("computeCameraDistance/computeCameraPosition — QA FIX round 3 (390×844 crop)", () => {
  it("узкий портретный aspect (мобильный, 390×844-подобный) требует БОЛЬШУЮ дистанцию, чем широкий desktop aspect", () => {
    const mobileAspect = 366 / 633; // реальные пропорции канваса на 390×844, см. компонент
    const desktopAspect = 1280 / 560;
    expect(computeCameraDistance(mobileAspect)).toBeGreaterThan(computeCameraDistance(desktopAspect));
  });

  it("модель (радиус коры + отступ подписи) помещается в кадр по УЗКОЙ оси на любом aspect — реальный баг, где узкий портрет обрезал крест", () => {
    for (const aspect of [366 / 633, 0.5, 1, 1280 / 560, 2.5]) {
      const distance = computeCameraDistance(aspect);
      const objectRadius = 1.0 + 0.14; // CRUST_R + LABEL_EXTRA_OFFSET
      const vHalfFovRad = (42 / 2) * (Math.PI / 180);
      const limitingHalfFov = aspect < 1 ? Math.atan(Math.tan(vHalfFovRad) * aspect) : vHalfFovRad;
      const visibleHalfWidthAtDistance = Math.tan(limitingHalfFov) * distance;
      expect(visibleHalfWidthAtDistance).toBeGreaterThanOrEqual(objectRadius);
    }
  });

  it("дистанция никогда не превышает MAX_CAMERA_DISTANCE (должно совпадать с maxDistance у GlobeControls)", () => {
    for (const aspect of [366 / 633, 0.4, 0.2, 1280 / 560, 3]) {
      expect(computeCameraDistance(aspect)).toBeLessThanOrEqual(MAX_CAMERA_DISTANCE);
    }
  });

  it("экстремально узкий aspect клэмпится к MAX_CAMERA_DISTANCE, а не растёт неограниченно (явный, тестируемый предел вместо молчаливой обрезки GlobeControls)", () => {
    expect(computeCameraDistance(0.05)).toBe(MAX_CAMERA_DISTANCE);
  });

  it("computeCameraPosition возвращает позицию с той же дистанцией от начала координат, что computeCameraDistance", () => {
    const aspect = 366 / 633;
    const [x, y, z] = computeCameraPosition(aspect);
    const magnitude = Math.sqrt(x * x + y * y + z * z);
    expect(magnitude).toBeCloseTo(computeCameraDistance(aspect), 5);
  });

  it("камера всегда остаётся на стороне среза (z>0) — иначе смотрела бы не в вырез, а на глухую сторону", () => {
    for (const aspect of [366 / 633, 1, 1280 / 560]) {
      const [, , z] = computeCameraPosition(aspect);
      expect(z).toBeGreaterThan(0);
    }
  });
});
