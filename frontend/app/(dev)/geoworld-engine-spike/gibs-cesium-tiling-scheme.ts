// G6.6.1 — пересмотрено после того, как визуальная проверка в браузере
// показала "почти однотонный синий globe" (imagery не рендерится).
//
// РАССЛЕДОВАНИЕ (G6.6.1): первая версия этого файла портировала таблицу
// `resolution` из официального примера NASA
// (github.com/nasa-gibs/web-examples/blob/main/examples/cesium/gibs.js).
// Независимая числовая проверка (без браузера, чистый Node) вскрыла, что
// эта таблица при tilePixels=512 даёт ГЕОМЕТРИЧЕСКИ НЕВОЗМОЖНЫЙ результат
// для уровня 0: ширина тайла = 288° при 2 тайлах на уровне (итого 576° —
// больше, чем целых 360° планеты). Проверено: 0.009817477042468103 × 512
// = 5.0265... рад = 288°, а не положенные 180°. Обратный подсчёт показал,
// что эта таблица самосогласована только при tilePixels=320 (π/0.00981747...
// = ровно 320), тогда как сам файл NASA использует захардкоженные 512 в
// той же формуле — внутреннее расхождение в стороннем демо-файле (либо
// таблица посчитана для другого сценария использования, который не удалось
// подтвердить без живого браузера).
//
// РЕШЕНИЕ: не гадать дальше с чужой непроверяемой константой — вместо
// этого использовать ТУ ЖЕ формулу, что уже эмпирически подтверждена и
// покрыта тестами в lib/geo/providers/gibs-grid.ts (G3): границы тайла =
// 360°/matrixWidth(level) по долготе, 180°/matrixHeight(level) по широте,
// от угла (-180°, 90°). Список width/height по уровням — тот же самый,
// что и в gibs-grid.ts (совпадает и с официальным примером NASA, это НЕ
// вызывало сомнений — расхождение было именно в таблице resolution, не в
// width/height).

export interface GibsLevel {
  width: number;
  height: number;
}

// Совпадает 1:1 с GIBS_500M_LEVELS в lib/geo/providers/gibs-grid.ts (G3,
// эмпирически снято с реального GetCapabilities) — сознательно не
// импортируется напрямую (тот модуль тянет THREE.js типы через tiling.ts,
// спайк изолирован от production-кода по прямому указанию).
export const GIBS_CESIUM_LEVELS: GibsLevel[] = [
  { width: 2, height: 1 },
  { width: 3, height: 2 },
  { width: 5, height: 3 },
  { width: 10, height: 5 },
  { width: 20, height: 10 },
  { width: 40, height: 20 },
  { width: 80, height: 40 },
  { width: 160, height: 80 },
];

/**
 * Создаёт Cesium TilingScheme, покрывающий РЕАЛЬНУЮ (нерегулярную) сетку
 * GIBS — те же width/height по уровням, что подтверждены в G3, но
 * геометрия тайла считается напрямую (360°/180° per matrix), без
 * непроверяемой таблицы "resolution" из стороннего примера.
 * `CesiumNS` передаётся явно (Cesium грузится через CDN в рантайме).
 */
export function createGibsTilingScheme(CesiumNS: any): any {
  const self = new CesiumNS.GeographicTilingScheme();
  const rectangle = CesiumNS.Rectangle.MAX_VALUE; // west=-π, east=π, south=-π/2, north=π/2

  self.getNumberOfXTilesAtLevel = (level: number) => GIBS_CESIUM_LEVELS[level].width;
  self.getNumberOfYTilesAtLevel = (level: number) => GIBS_CESIUM_LEVELS[level].height;

  self.tileXYToRectangle = (x: number, y: number, level: number, result?: any) => {
    const { width, height } = GIBS_CESIUM_LEVELS[level];
    const lngSpan = (rectangle.east - rectangle.west) / width;
    const latSpan = (rectangle.north - rectangle.south) / height;

    const west = rectangle.west + x * lngSpan;
    const east = west + lngSpan;
    const north = rectangle.north - y * latSpan;
    const south = north - latSpan;

    const out = result ?? new CesiumNS.Rectangle(0, 0, 0, 0);
    out.west = west;
    out.south = south;
    out.east = east;
    out.north = north;
    return out;
  };

  self.positionToTileXY = (position: any, level: number, result?: any) => {
    if (!CesiumNS.Rectangle.contains(rectangle, position)) return undefined;
    const { width, height } = GIBS_CESIUM_LEVELS[level];
    const lngSpan = (rectangle.east - rectangle.west) / width;
    const latSpan = (rectangle.north - rectangle.south) / height;

    let longitude = position.longitude;
    if (rectangle.east < rectangle.west) longitude += CesiumNS.Math.TWO_PI;

    let xTile = Math.floor((longitude - rectangle.west) / lngSpan);
    if (xTile >= width) xTile = width - 1;
    let yTile = Math.floor((rectangle.north - position.latitude) / latSpan);
    if (yTile >= height) yTile = height - 1;

    const out = result ?? new CesiumNS.Cartesian2(0, 0);
    out.x = xTile;
    out.y = yTile;
    return out;
  };

  return self;
}
