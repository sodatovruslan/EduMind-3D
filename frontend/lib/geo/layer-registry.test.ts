import { describe, expect, it } from "vitest";
import { LAYER_DEFINITIONS, createDefaultLayerVisibility, layersByCategory } from "./layer-registry";

describe("GeoWorld G6 — layer-registry: реестр образовательных слоёв", () => {
  it("у каждого слоя уникальный id", () => {
    const ids = LAYER_DEFINITIONS.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("createDefaultLayerVisibility отражает defaultEnabled каждого слоя", () => {
    const visibility = createDefaultLayerVisibility();
    for (const layer of LAYER_DEFINITIONS) {
      expect(visibility[layer.id]).toBe(layer.defaultEnabled);
    }
  });

  it("границы/города включены по умолчанию (продолжают G5, не регрессия)", () => {
    const visibility = createDefaultLayerVisibility();
    expect(visibility.borders).toBe(true);
    expect(visibility.cities).toBe(true);
  });

  it("новые геологические слои (плиты/вулканы/землетрясения) выключены по умолчанию — не захламляют вид сразу", () => {
    const visibility = createDefaultLayerVisibility();
    expect(visibility.plates).toBe(false);
    expect(visibility.volcanoes).toBe(false);
    expect(visibility.earthquakes).toBe(false);
  });

  it("layersByCategory группирует все слои без потерь и дублей", () => {
    const groups = layersByCategory();
    const total = groups.reduce((sum, g) => sum + g.layers.length, 0);
    expect(total).toBe(LAYER_DEFINITIONS.length);
  });

  it("слои с легендой (plates/volcanoes/earthquakes/cities) имеют непустой список", () => {
    for (const layer of LAYER_DEFINITIONS) {
      if (layer.legend) expect(layer.legend.length).toBeGreaterThan(0);
    }
  });
});
