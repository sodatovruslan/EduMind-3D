// G6.12 §37 — единая, renderer-independent модель "информации о выбранном
// объекте". Явное требование задания: НЕ создавать 4 независимых UI-системы
// (VolcanoInfoCard/EarthquakeInfoCard/PlateInfoCard/ClimateInfoCard), если
// можно расширить один типизированный контракт. Старый R3F-рендерер уже
// шёл в этом направлении (`GeoFeatureInfo` в components/geo/GeoFeatureInfoCard.tsx
// — {title, subtitle, lines, position}), но `position` там — Three.js-
// специфичный vec3 для `<Html>`-якоря. MapLibre — обычный DOM, ему 3D-точка
// не нужна вообще (см. FeatureInfoPanel.tsx — фиксированная панель, не
// 3D-привязанный попап) — поэтому эта модель renderer-agnostic, `position`
// не входит в контракт, только сами образовательные данные.
export type GeoFeatureKind = "plate-boundary" | "volcano" | "earthquake" | "earth-layer" | "continent";

export interface GeoFeatureInfo {
  kind: GeoFeatureKind;
  title: string;
  subtitle?: string;
  lines: string[];
  /**
   * Несколько локале-независимых скаляров (не текст для показа) — нужны
   * ТОЛЬКО для логирования backend-действия (explore_plate_boundary/
   * explore_volcano/explore_earthquake, см. GeoWorldSceneMapLibre.tsx) без
   * хрупкого парсинга локализованных `title`/`lines` обратно в данные
   * (реальная проблема, которую это поле устраняет: строка вида "Тип: зона
   * субдукции..." отличается в RU/EN/TG, `.includes("субдук")` работал бы
   * только на русской локали). НЕ сырой GeoJSON — 2-3 скаляра, не геометрия.
   */
  raw?: Record<string, string | number | boolean | null>;
}
