// G6 — реестр образовательных геослоёв GeoWorld. Чистые данные, без React —
// UI (LayerControlPanel) и рендер-компоненты подписываются на этот список,
// вместо того чтобы каждый новый слой добавлял свою отдельную кнопку/тогл
// прямо в GeoWorldScene.tsx (см. GEOWORLD_ROADMAP.md, раздел G6).

export type LayerCategory = "political" | "geology" | "physical";

export interface LayerLegendItem {
  color: string;
  label: string;
}

export interface LayerDefinition {
  id: string;
  category: LayerCategory;
  title: string;
  description: string;
  legend?: LayerLegendItem[];
  defaultEnabled: boolean;
}

export const LAYER_CATEGORY_LABELS: Record<LayerCategory, string> = {
  political: "Политическая карта",
  geology: "Геология",
  physical: "Физическая география",
};

// Границы/города — те же данные и провайдер, что в G5 (frontend/lib/geo/providers/natural-earth.ts,
// frontend/components/geo/CountryBordersLayer.tsx и CityLabelsLayer.tsx) —
// сведены в этот единый реестр, а не оставлены отдельным тоглом (по прямому
// указанию "Do NOT create a second country/city control").
export const LAYER_DEFINITIONS: LayerDefinition[] = [
  {
    id: "borders",
    category: "political",
    title: "Границы стран",
    description: "Государственные границы (Natural Earth). Появляются подробнее при приближении.",
    defaultEnabled: true,
  },
  {
    id: "cities",
    category: "political",
    title: "Города и столицы",
    description: "Населённые пункты (Natural Earth) — больше городов видно при приближении.",
    legend: [
      { color: "#fbbf24", label: "Столица" },
      { color: "#e2e8f0", label: "Город" },
    ],
    defaultEnabled: true,
  },
  {
    id: "plates",
    category: "geology",
    title: "Тектонические плиты",
    description: "Границы литосферных плит (модель PB2002, Peter Bird, 2003) — там, где плиты сталкиваются, чаще происходят землетрясения и извержения.",
    legend: [
      { color: "#f97316", label: "Зона субдукции (одна плита уходит под другую)" },
      { color: "#facc15", label: "Граница плиты (другой тип)" },
    ],
    defaultEnabled: false,
  },
  {
    id: "volcanoes",
    category: "geology",
    title: "Вулканы",
    description: "Вулканы со значимыми историческими извержениями (NOAA/NCEI). Чаще расположены рядом с границами плит.",
    legend: [{ color: "#ef4444", label: "Вулкан" }],
    defaultEnabled: false,
  },
  {
    id: "earthquakes",
    category: "geology",
    title: "Землетрясения",
    description: "Землетрясения магнитудой 4.5+ за последний месяц (USGS) — реальный снимок, не онлайн-поток.",
    legend: [
      { color: "#fde047", label: "M 4.5–5.4" },
      { color: "#fb923c", label: "M 5.5–6.4" },
      { color: "#ef4444", label: "M 6.5+" },
    ],
    defaultEnabled: false,
  },
];

export function createDefaultLayerVisibility(): Record<string, boolean> {
  const result: Record<string, boolean> = {};
  for (const layer of LAYER_DEFINITIONS) result[layer.id] = layer.defaultEnabled;
  return result;
}

export function layersByCategory(): Array<{ category: LayerCategory; layers: LayerDefinition[] }> {
  const order: LayerCategory[] = ["political", "geology", "physical"];
  return order
    .map((category) => ({ category, layers: LAYER_DEFINITIONS.filter((l) => l.category === category) }))
    .filter((group) => group.layers.length > 0);
}
