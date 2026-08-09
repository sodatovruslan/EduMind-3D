import { describe, expect, it } from "vitest";
import { computeClipPlanes } from "./GlobeControls";

describe("GeoWorld G6.5 — computeClipPlanes: near/far масштабируются с высотой над поверхностью", () => {
  it("вплотную к поверхности near очень маленький (не срезает близкий рельеф/снимок)", () => {
    const { near } = computeClipPlanes(1.003, 1, 20);
    expect(near).toBeLessThan(0.01);
  });

  it("далеко от поверхности near пропорционально больше", () => {
    const close = computeClipPlanes(1.01, 1, 20).near;
    const far = computeClipPlanes(5, 1, 20).near;
    expect(far).toBeGreaterThan(close);
  });

  it("near никогда не опускается до нуля/отрицательного значения (минимальный пол)", () => {
    const { near } = computeClipPlanes(1, 1, 20); // altitude=0, ровно на поверхности
    expect(near).toBeGreaterThan(0);
  });

  it("far всегда достаточно велик, чтобы включать maxDistance с запасом (звёзды/дальняя сторона глобуса)", () => {
    const { far } = computeClipPlanes(1.5, 1, 20);
    expect(far).toBeGreaterThan(20);
  });

  it("far растёт вместе с maxDistance", () => {
    const small = computeClipPlanes(1.5, 1, 10).far;
    const large = computeClipPlanes(1.5, 1, 100).far;
    expect(large).toBeGreaterThan(small);
  });
});
