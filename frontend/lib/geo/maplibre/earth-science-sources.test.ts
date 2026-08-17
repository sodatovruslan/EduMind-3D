import { describe, expect, it } from "vitest";
import { volcanoesToFeatureCollection, EARTHQUAKE_WINDOWS, DEFAULT_EARTHQUAKE_WINDOW } from "./earth-science-sources";
import type { VolcanoRecord } from "../providers/volcanoes";

// G6.12 §14/§18 — конвертация в GeoJSON не должна терять/искажать поля
// (§14: "не выдумывай отсутствующие поля"), и три временных окна
// землетрясений должны быть РЕАЛЬНО поддерживаемыми USGS URL (проверено
// curl вручную при разработке — здесь фиксируем форму/значения по умолчанию).
describe("volcanoesToFeatureCollection", () => {
  it("конвертирует records в валидный GeoJSON FeatureCollection с [lng, lat] порядком координат", () => {
    const records: VolcanoRecord[] = [
      { id: 1, name: "Krakatoa", country: "Indonesia", latitude: -6.1, longitude: 105.4, elevation: 813, morphology: "Caldera", lastEruptionYear: 1927, deathsTotal: 36417 },
    ];
    const fc = volcanoesToFeatureCollection(records);
    expect(fc.type).toBe("FeatureCollection");
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0].geometry).toEqual({ type: "Point", coordinates: [105.4, -6.1] });
    expect(fc.features[0].properties).toEqual(records[0]);
  });

  it("пустой список записей даёт валидную пустую FeatureCollection (не падает)", () => {
    const fc = volcanoesToFeatureCollection([]);
    expect(fc.features).toEqual([]);
  });
});

describe("EARTHQUAKE_WINDOWS", () => {
  it("содержит ровно три реально поддерживаемых USGS окна (day/week/month), все — валидные HTTPS URL к тому же feed-эндпоинту", () => {
    expect(Object.keys(EARTHQUAKE_WINDOWS)).toEqual(["day", "week", "month"]);
    for (const url of Object.values(EARTHQUAKE_WINDOWS)) {
      expect(url).toMatch(/^https:\/\/earthquake\.usgs\.gov\/earthquakes\/feed\/v1\.0\/summary\/4\.5_(day|week|month)\.geojson$/);
    }
  });

  it("окно по умолчанию — 'month' (тот же детерминированный снимок, что production R3F-рендерер)", () => {
    expect(DEFAULT_EARTHQUAKE_WINDOW).toBe("month");
  });
});
