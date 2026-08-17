import { describe, expect, it } from "vitest";
import { buildPlateBoundaryInfo, buildVolcanoInfo, buildEarthquakeInfo } from "./feature-info-builders";
import type { EarthScienceLabels } from "./useEarthScienceLayers";

// G6.12 §13/§16/§20/§37 — эти функции строят единственный typed feature-info
// объект (GeoFeatureInfo), который используют И обработчики клика по карте,
// И клавиатурно-доступный список (AccessibleFeatureList) — тест
// подтверждает, что честно показывается ТОЛЬКО то, что реально есть в
// датасете (§14/§17 — "no false precision, don't invent fields"), и что
// `raw` содержит локале-независимые скаляры для backend-логирования
// (устраняет реальный баг: парсинг локализованного текста строкой).
const labels: EarthScienceLabels = {
  plateBoundarySubduction: "Тип: субдукция",
  plateBoundaryUnclassified: "Тип: не классифицирован",
  volcanoElevation: "Высота: {value} м",
  volcanoType: "Тип: {value}",
  volcanoLastEruption: "Извержение: {value}",
  volcanoLastEruptionBce: "Извержение: {value} до н.э.",
  volcanoDeaths: "Погибших: {value}",
  earthquakeDepth: "Глубина: {value} км",
  earthquakeDate: "Дата: {value}",
};

describe("buildPlateBoundaryInfo", () => {
  it("подставляет человекочитаемые имена плит по коду, если они есть в lookup", () => {
    const names = new Map([
      ["EU", "Eurasia"],
      ["IN", "India"],
    ]);
    const info = buildPlateBoundaryInfo({ PlateA: "EU", PlateB: "IN", Type: "subduction" }, names, labels);
    expect(info.title).toBe("Eurasia / India");
    expect(info.lines).toEqual(["Тип: субдукция"]);
    expect(info.raw).toEqual({ plateA: "Eurasia", plateB: "India", boundaryType: "subduction" });
  });

  it("честно показывает 'не классифицирован', а не выдуманный тип, когда Type пуст (реальные данные PB2002)", () => {
    const info = buildPlateBoundaryInfo({ PlateA: "AF", PlateB: "AN", Type: "" }, new Map(), labels);
    expect(info.lines).toEqual(["Тип: не классифицирован"]);
    expect(info.raw?.boundaryType).toBe("");
  });

  it("падает обратно на сырой код плиты, если имени нет в lookup (полигоны ещё не загружены)", () => {
    const info = buildPlateBoundaryInfo({ PlateA: "ZZ", PlateB: "YY", Type: "" }, new Map(), labels);
    expect(info.title).toBe("ZZ / YY");
  });
});

describe("buildVolcanoInfo", () => {
  it("включает только реально присутствующие поля — не показывает выдуманные значения для null-полей", () => {
    const info = buildVolcanoInfo({ name: "Krakatoa", country: "Indonesia", elevation: null, morphology: null, lastEruptionYear: null, deathsTotal: null }, labels);
    expect(info.title).toBe("Krakatoa");
    expect(info.subtitle).toBe("Indonesia");
    expect(info.lines).toEqual([]);
    expect(info.raw).toEqual({ name: "Krakatoa", country: "Indonesia" });
  });

  it("год извержения > 0 форматируется как обычный год, отрицательный — как 'до н.э.'", () => {
    const ad = buildVolcanoInfo({ name: "A", elevation: null, morphology: null, lastEruptionYear: 1991, deathsTotal: null }, labels);
    expect(ad.lines).toContain("Извержение: 1991");

    const bce = buildVolcanoInfo({ name: "B", elevation: null, morphology: null, lastEruptionYear: -79, deathsTotal: null }, labels);
    expect(bce.lines).toContain("Извержение: 79 до н.э.");
  });

  it("deathsTotal=0 не показывается (falsy — как и раньше в старом R3F-рендерере, 0 погибших не образовательная строка)", () => {
    const info = buildVolcanoInfo({ name: "A", elevation: null, morphology: null, lastEruptionYear: null, deathsTotal: 0 }, labels);
    expect(info.lines).toEqual([]);
  });
});

describe("buildEarthquakeInfo", () => {
  it("форматирует магнитуду в title, place в subtitle, глубину/дату в lines", () => {
    const info = buildEarthquakeInfo({ mag: 6.5, place: "10km SW of Somewhere", time: 1700000000000 }, 12.3, "en-US", labels);
    expect(info.title).toBe("M 6.5");
    expect(info.subtitle).toBe("10km SW of Somewhere");
    expect(info.lines[0]).toBe("Глубина: 12 км");
    expect(info.raw).toEqual({ place: "10km SW of Somewhere", magnitude: 6.5 });
  });

  it("пропускает строку глубины, если depth не число (не выдумывает 0)", () => {
    const info = buildEarthquakeInfo({ mag: 5.0, place: "X", time: 0 }, undefined, "en-US", labels);
    expect(info.lines.some((l) => l.startsWith("Глубина"))).toBe(false);
  });
});
