import { latLngToUnitVec3, type Vec3 } from "./tile-lod";

// G5 — границы стран и подписи городов НЕ тайлятся по нашей внутренней
// квадротрёх (в отличие от G3/G4): страна — единая линия контура вне
// зависимости от того, какая внутренняя LOD-ячейка сейчас видна, разбивать
// её на тайловые куски означало бы настоящую GIS-нарезку полигонов —
// избыточно для задачи "показать контур/подпись при приближении". LOD
// здесь — переключение ЦЕЛОГО датасета по уровню детализации (как в любой
// картографической библиотеке), не TileEngine-квадротрёх. См.
// GEOWORLD_ROADMAP.md, раздел G5, за явным обоснованием этого отступления
// от собственной более ранней заметки ("переиспользовать TileEngine<T> в
// третий раз") — то предложение оказалось плохо подходящей идеей на
// практике, не проверенной до того, как дошли до реализации.

export type BorderTier = "coarse" | "medium";

const COARSE_DISTANCE_THRESHOLD = 2.5; // дальше этого — достаточно грубых 110m-границ

export function pickBorderTier(cameraDistance: number): BorderTier {
  return cameraDistance > COARSE_DISTANCE_THRESHOLD ? "coarse" : "medium";
}

/**
 * Natural Earth SCALERANK: 0 = самые важные/крупные объекты (мало), выше
 * число — менее значимые (много). "Больше подписей при приближении"
 * означает РАЗРЕШАТЬ более высокий SCALERANK по мере уменьшения дистанции.
 */
export function maxVisibleScaleRank(cameraDistance: number): number {
  if (cameraDistance > 4) return -1; // ничего не подписываем издалека — только чистая Земля
  if (cameraDistance > 2.5) return 0; // только столицы/мегаполисы первого ранга
  if (cameraDistance > 1.6) return 3;
  if (cameraDistance > 1.2) return 6;
  return 10; // вблизи — все доступные в 50m-датасете
}

const HORIZON_DOT = -0.1; // та же идея, что horizonDot в tile-lod.ts — не показываем то, что на дальней стороне глобуса

export function isFacingCamera(lat: number, lng: number, cameraPos: Vec3): boolean {
  const dir = latLngToUnitVec3(lat, lng);
  const camLen = Math.sqrt(cameraPos[0] ** 2 + cameraPos[1] ** 2 + cameraPos[2] ** 2) || 1;
  const camDir: Vec3 = [cameraPos[0] / camLen, cameraPos[1] / camLen, cameraPos[2] / camLen];
  const dot = dir[0] * camDir[0] + dir[1] * camDir[1] + dir[2] * camDir[2];
  return dot >= HORIZON_DOT;
}

export interface RankedCity {
  key: string;
  lat: number;
  lng: number;
  scaleRank: number;
  isCapital: boolean;
}

/**
 * Отбор видимых городов: те же принципы, что у отдельных функций выше
 * (maxVisibleScaleRank + isFacingCamera), плюс приоритет столиц (реальное
 * поле ADM0CAP датасета, см. providers/natural-earth.ts — НЕ эвристика по
 * размеру города) и жёсткий потолок числа подписей. Вынесено в чистую
 * функцию отдельно от CityLabelsLayer.tsx ради тестируемости без R3F/WebGL.
 */
export function selectVisibleCities<T extends RankedCity>(cities: T[], cameraDistance: number, cameraPos: Vec3, maxCount: number): T[] {
  const maxRank = maxVisibleScaleRank(cameraDistance);
  // Столица небольшой страны допускается на 2 ранга раньше обычного города
  // того же ранга — но не издалека из космоса, допуск не бесконечный.
  const passes = (city: T) => city.scaleRank <= maxRank + (city.isCapital ? 2 : 0) && isFacingCamera(city.lat, city.lng, cameraPos);
  const candidates = cities.filter(passes);
  candidates.sort((a, b) => Number(b.isCapital) - Number(a.isCapital));
  return candidates.slice(0, maxCount);
}
