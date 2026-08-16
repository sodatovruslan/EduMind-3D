import { describe, expect, it } from "vitest";
import { lngLatToTileXY } from "./tile-math";
import { CONTROL_POINTS } from "./camera-presets";
import { ESRI_URL } from "./imagery-sources";

// G6.10 §7 — regression guard: НЕ pixel screenshot test (недоступно в CI/
// headless без реального браузера), а детерминированная проверка Web
// Mercator tile-coordinate математики на трёх координатах, которые уже
// прошли полный georeferencing validation цикл (G6.8.x, "Verdict:
// GEOREFERENCING VERIFIED" — см. GEOWORLD_ROADMAP.md). Ожидаемые значения
// посчитаны НЕЗАВИСИМО (отдельный Node-скрипт вне test suite, та же
// формула, что уже подтверждена реальными сетевыми запросами к Esri в
// G6.8.x) — не изобретены, не подогнаны под текущий код задним числом.
//
// Цель — поймать РЕГРЕССИЮ (x/y swap, неверная формула проекции, сдвиг
// zoom), если будущие изменения imagery/tiling-кода их случайно внесут, а
// не заново доказать georeferencing (это уже сделано в G6.8.x).

describe("GeoWorld G6.10 — georeferencing regression guard (Web Mercator tile math)", () => {
  it("Памятник Исмоили Сомони — точный тайл на z18", () => {
    const { center } = CONTROL_POINTS.ismoiliSomoni;
    expect(lngLatToTileXY(center[0], center[1], 18)).toEqual({ x: 181159, y: 100584 });
  });

  it("Гипрозем — точный тайл на z18", () => {
    const { center } = CONTROL_POINTS.giprozem;
    expect(lngLatToTileXY(center[0], center[1], 18)).toEqual({ x: 181125, y: 100642 });
  });

  it("46-й микрорайон — точный тайл на z18", () => {
    const { center } = CONTROL_POINTS.microdistrict46;
    expect(lngLatToTileXY(center[0], center[1], 18)).toEqual({ x: 181146, y: 100625 });
  });

  it("три контрольные точки дают РАЗНЫЕ тайлы на z18 (иначе x/y-swap был бы незаметен тестом)", () => {
    const tiles = Object.values(CONTROL_POINTS).map((p) => lngLatToTileXY(p.center[0], p.center[1], 18));
    const keys = tiles.map((t) => `${t.x}/${t.y}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("аргументы (lng, lat) — не перепутаны местами: подстановка (lat, lng) для Гипрозема даёт ДРУГОЙ тайл", () => {
    const { center } = CONTROL_POINTS.giprozem;
    const correct = lngLatToTileXY(center[0], center[1], 18);
    const swapped = lngLatToTileXY(center[1], center[0], 18);
    expect(swapped).not.toEqual(correct);
  });

  it("Esri URL template — порядок подстановки {z}/{y}/{x} (row/col), СООТВЕТСТВУЮЩИЙ реальному ArcGIS REST API (curl-подтверждено в G6.8)", () => {
    // Реальный API: .../tile/{level}/{row}/{col} — то есть Y (row) идёт
    // ПЕРЕД X (col) в пути. Если кто-то в будущем "исправит" порядок на
    // интуитивно ожидаемый {x}/{y}, реальные тайлы начнут приходить не с
    // той стороны света — этот тест ловит именно такую регрессию.
    const filled = ESRI_URL.replace("{z}", "18").replace("{y}", "100642").replace("{x}", "181125");
    expect(filled).toBe("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/18/100642/181125");
    expect(ESRI_URL.indexOf("{y}")).toBeLessThan(ESRI_URL.indexOf("{x}"));
  });
});
