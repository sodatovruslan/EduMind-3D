import { describe, expect, it } from "vitest";
import { buildGeoAiContext } from "./aiContext";

// G6.11 §18 — "не отправлять гигантские сырые MapLibre-объекты в AI, малый
// сериализуемый объект" — тест подтверждает форму и JSON-сериализуемость,
// не наличие живого MapLibre-инстанса.
describe("GeoWorld G6.11 — buildGeoAiContext (AI context foundation)", () => {
  const camera = { center: [68.7739, 38.5601] as [number, number], zoom: 11.5, bearing: 0, pitch: 60 };

  it("возвращает JSON-сериализуемый объект без циклических/DOM-ссылок", () => {
    const ctx = buildGeoAiContext({
      camera,
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
      camera,
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
    const empty = buildGeoAiContext({ camera, actionsLog: [], selectedContinentName: null, completionScore: null });
    expect(empty.lastAction).toBeNull();

    const withLog = buildGeoAiContext({
      camera,
      actionsLog: [{ action_type: "explore_continent", lat: 1, lng: 2 }],
      selectedContinentName: null,
      completionScore: null,
    });
    expect(withLog.lastAction).toEqual({ type: "explore_continent", action_type: "explore_continent", lat: 1, lng: 2 });
  });
});
