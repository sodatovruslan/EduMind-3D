import { describe, expect, it } from "vitest";
import { buildGeoAiContext, type GeoAiContextInput } from "./aiContext";

// G6.11 §18 / G6.12 §38 — "не отправлять гигантские сырые MapLibre-объекты
// в AI, малый сериализуемый объект" — тест подтверждает форму и
// JSON-сериализуемость, не наличие живого MapLibre-инстанса.
describe("GeoWorld G6.11/G6.12 — buildGeoAiContext (AI context foundation)", () => {
  const camera = { center: [68.7739, 38.5601] as [number, number], zoom: 11.5, bearing: 0, pitch: 60 };
  const baseInput: Omit<GeoAiContextInput, "actionsLog" | "selectedContinentName" | "completionScore"> = {
    camera,
    activeLayers: { tectonics: false, volcanoes: false, earthquakes: false, climate: false },
    selectedFeature: null,
    climateScenario: { temperatureAnomaly: 0, triggered: false },
    earthStructureMode: false,
  };

  it("возвращает JSON-сериализуемый объект без циклических/DOM-ссылок", () => {
    const ctx = buildGeoAiContext({
      ...baseInput,
      actionsLog: [{ action_type: "explore_layer", layer: "crust" }],
      selectedContinentName: null,
      completionScore: null,
    });
    expect(() => JSON.stringify(ctx)).not.toThrow();
    expect(ctx.renderer).toBe("maplibre");
    expect(ctx.camera).toEqual(camera);
  });

  it("exploredLayers собирается ТОЛЬКО из explore_layer записей actionsLog, в порядке появления", () => {
    const ctx = buildGeoAiContext({
      ...baseInput,
      actionsLog: [
        { action_type: "explore_layer", layer: "crust" },
        { action_type: "explore_continent", lat: 38.5, lng: 68.7 },
        { action_type: "explore_layer", layer: "mantle" },
      ],
      selectedContinentName: "Азия",
      completionScore: null,
    });
    expect(ctx.exploredLayers).toEqual(["crust", "mantle"]);
    expect(ctx.selectedContinent).toBe("Азия");
    expect(ctx.actionsCount).toBe(3);
  });

  it("lastAction — последняя запись лога, null при пустом логе", () => {
    const empty = buildGeoAiContext({ ...baseInput, actionsLog: [], selectedContinentName: null, completionScore: null });
    expect(empty.lastAction).toBeNull();

    const withLog = buildGeoAiContext({
      ...baseInput,
      actionsLog: [{ action_type: "explore_continent", lat: 1, lng: 2 }],
      selectedContinentName: null,
      completionScore: null,
    });
    expect(withLog.lastAction).toEqual({ type: "explore_continent", action_type: "explore_continent", lat: 1, lng: 2 });
  });

  it("§38 — передаёт активные слои/выбранный объект/сценарий климата/Earth Structure Mode как есть, компактно", () => {
    const ctx = buildGeoAiContext({
      ...baseInput,
      actionsLog: [],
      selectedContinentName: null,
      completionScore: null,
      activeLayers: { tectonics: true, volcanoes: false, earthquakes: true, climate: false },
      selectedFeature: { kind: "volcano", title: "Krakatoa", subtitle: "Indonesia", lines: ["Высота: 813 м"] },
      climateScenario: { temperatureAnomaly: 3.5, triggered: true },
      earthStructureMode: true,
    });
    expect(ctx.activeLayers).toEqual({ tectonics: true, volcanoes: false, earthquakes: true, climate: false });
    expect(ctx.selectedFeature?.title).toBe("Krakatoa");
    expect(ctx.climateScenario).toEqual({ temperatureAnomaly: 3.5, triggered: true });
    expect(ctx.earthStructureMode).toBe(true);
    expect(() => JSON.stringify(ctx)).not.toThrow();
  });
});
