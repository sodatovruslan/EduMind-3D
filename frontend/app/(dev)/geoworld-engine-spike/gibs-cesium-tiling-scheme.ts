// G6.6 spike — портирован (TypeScript, тот же алгоритм 1:1) из ОФИЦИАЛЬНОГО
// примера NASA GIBS для CesiumJS:
// https://github.com/nasa-gibs/web-examples/blob/main/examples/cesium/gibs.js
// (Apache License 2.0, "Copyright United States Government as represented
// by the Administrator of NASA"). Не выдумано — реальный, официальный
// референс NASA под наш собственный движок.
//
// ВАЖНАЯ НАХОДКА спайка: сетка НИЖЕ 1:1 совпадает с той, что мы САМИ вывели
// эмпирически в G3 (см. frontend/lib/geo/providers/gibs-grid.ts,
// GIBS_500M_LEVELS) — 2×1 → 3×2 → 5×3 → 10×5 → ... — независимое
// подтверждение корректности нашей собственной работы. Это ЗНАЧИТ, что
// переход на Cesium НЕ убирает необходимость custom-адаптера под реальную
// (нерегулярную) сетку GIBS — она нужна ЛЮБОМУ движку, это свойство самого
// GIBS, не недостаток нашей текущей архитектуры.
//
// Типы — `any`/window.Cesium: этот спайк намеренно грузит Cesium через CDN
// (см. page.tsx), не через npm-пакет — не трогаем package.json/next.config.js
// для изолированного dev-only маршрута. Реальная миграция потребовала бы
// `npm install cesium` + webpack static-asset copy, либо тот же CDN-подход
// в продакшне (оба варианта официально поддерживаются Cesium).

export interface GibsLevel {
  width: number;
  height: number;
  /** Радиан на пиксель. */
  resolution: number;
}

// Те же уровни, что у NASA (500m-профиль, до z=7/160×80) — используем ту
// же 500m-урезку, что и наш собственный gibs-grid.ts (см. G3), не
// углубляемся до 250m/z=8, тот же осознанный выбор объёма загрузки.
export const GIBS_CESIUM_LEVELS: GibsLevel[] = [
  { width: 2, height: 1, resolution: 0.009817477042468103 },
  { width: 3, height: 2, resolution: 0.004908738521234052 },
  { width: 5, height: 3, resolution: 0.002454369260617026 },
  { width: 10, height: 5, resolution: 0.001227184630308513 },
  { width: 20, height: 10, resolution: 0.0006135923151542565 },
  { width: 40, height: 20, resolution: 0.00030679615757712823 },
  { width: 80, height: 40, resolution: 0.00015339807878856412 },
  { width: 160, height: 80, resolution: 0.00007669903939428206 },
];

const TILE_PIXELS = 512; // подтверждено эмпирически в G3 (реальный GetCapabilities), не 256 из устаревшего примера

/**
 * Создаёт Cesium TilingScheme, покрывающий РЕАЛЬНУЮ (нерегулярную) сетку
 * GIBS — прямой порт официального `gibs.GeographicTilingScheme` под наш
 * TypeScript-код. `CesiumNS` передаётся явно (не импортом — Cesium грузится
 * через CDN в рантайме, см. page.tsx).
 */
export function createGibsTilingScheme(CesiumNS: any): any {
  const self = new CesiumNS.GeographicTilingScheme();
  const rectangle = CesiumNS.Rectangle.MAX_VALUE;

  self.getNumberOfXTilesAtLevel = (level: number) => GIBS_CESIUM_LEVELS[level].width;
  self.getNumberOfYTilesAtLevel = (level: number) => GIBS_CESIUM_LEVELS[level].height;

  self.tileXYToRectangle = (x: number, y: number, level: number, result?: any) => {
    const { resolution } = GIBS_CESIUM_LEVELS[level];
    const xTileWidth = resolution * TILE_PIXELS;
    const yTileHeight = resolution * TILE_PIXELS;

    const west = x * xTileWidth + rectangle.west;
    const east = (x + 1) * xTileWidth + rectangle.west;
    const north = rectangle.north - y * yTileHeight;
    const south = rectangle.north - (y + 1) * yTileHeight;

    const out = result ?? new CesiumNS.Rectangle(0, 0, 0, 0);
    out.west = west;
    out.south = south;
    out.east = east;
    out.north = north;
    return out;
  };

  return self;
}
