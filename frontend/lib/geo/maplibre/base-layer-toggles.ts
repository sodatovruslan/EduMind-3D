// G6.12 §28/§29 — реальные (не декоративные) BASE-переключатели для
// перегруппированной панели слоёв (Labels/Terrain). Satellite (Esri)
// сознательно НЕ входит сюда — остаётся ровно там, где уже есть (dev-only
// кнопка в MapLibreGlobeCanvas), т.к. §55 задания прямо запрещает трогать
// imagery-лицензирование/делать Esri обычным production-переключателем.
import { DEFAULT_TERRAIN_EXAGGERATION } from "./terrain";

const LABEL_LAYER_IDS = ["borders-line", "country-label", "city-point", "city-label"];

export function setLabelsVisible(map: any, visible: boolean): void {
  for (const id of LABEL_LAYER_IDS) {
    if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
  }
}

export function setTerrainVisible(map: any, visible: boolean): void {
  if (map.getLayer("hillshade")) map.setLayoutProperty("hillshade", "visibility", visible ? "visible" : "none");
  map.setTerrain(visible ? { source: "aws-terrarium", exaggeration: DEFAULT_TERRAIN_EXAGGERATION } : null);
}
