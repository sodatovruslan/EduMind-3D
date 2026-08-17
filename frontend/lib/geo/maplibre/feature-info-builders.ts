// G6.12 — чистые функции "сырые свойства объекта → GeoFeatureInfo",
// вынесенные из useEarthScienceLayers.ts, чтобы их могли переиспользовать
// И обработчики клика по карте, И клавиатурно-доступный список объектов
// (AccessibleFeatureList.tsx, §41 — альтернатива клику мышью по глобусу).
import type { GeoFeatureInfo } from "../education/featureInfo";
import type { EarthScienceLabels } from "./useEarthScienceLayers";

export function buildPlateBoundaryInfo(
  props: { PlateA?: string; PlateB?: string; Type?: string },
  plateNames: Map<string, string>,
  labels: EarthScienceLabels
): GeoFeatureInfo {
  const nameA = plateNames.get(props.PlateA ?? "") ?? props.PlateA ?? "?";
  const nameB = plateNames.get(props.PlateB ?? "") ?? props.PlateB ?? "?";
  return {
    kind: "plate-boundary",
    title: `${nameA} / ${nameB}`,
    lines: [props.Type === "subduction" ? labels.plateBoundarySubduction : labels.plateBoundaryUnclassified],
    raw: { plateA: nameA, plateB: nameB, boundaryType: props.Type ?? null },
  };
}

export function buildVolcanoInfo(
  props: { name: string; country?: string; elevation?: number | null; morphology?: string | null; lastEruptionYear?: number | null; deathsTotal?: number | null },
  labels: EarthScienceLabels
): GeoFeatureInfo {
  const lines: string[] = [];
  if (props.elevation !== null && props.elevation !== undefined) {
    lines.push(labels.volcanoElevation.replace("{value}", String(props.elevation)));
  }
  if (props.morphology) lines.push(labels.volcanoType.replace("{value}", String(props.morphology)));
  if (props.lastEruptionYear !== null && props.lastEruptionYear !== undefined) {
    const year = Number(props.lastEruptionYear);
    lines.push(
      year > 0
        ? labels.volcanoLastEruption.replace("{value}", String(year))
        : labels.volcanoLastEruptionBce.replace("{value}", String(Math.abs(year)))
    );
  }
  if (props.deathsTotal) lines.push(labels.volcanoDeaths.replace("{value}", String(props.deathsTotal)));
  return { kind: "volcano", title: props.name, subtitle: props.country ?? "", lines, raw: { name: props.name, country: props.country ?? null } };
}

export function buildEarthquakeInfo(
  props: { mag: number; place?: string; time: number },
  depth: number | undefined,
  localeTag: string,
  labels: EarthScienceLabels
): GeoFeatureInfo {
  const dateStr = new Date(Number(props.time)).toLocaleString(localeTag);
  const lines = [
    typeof depth === "number" ? labels.earthquakeDepth.replace("{value}", depth.toFixed(0)) : null,
    labels.earthquakeDate.replace("{value}", dateStr),
  ].filter((l): l is string => Boolean(l));
  return {
    kind: "earthquake",
    title: `M ${Number(props.mag).toFixed(1)}`,
    subtitle: props.place ?? "",
    lines,
    raw: { place: props.place ?? null, magnitude: props.mag },
  };
}
