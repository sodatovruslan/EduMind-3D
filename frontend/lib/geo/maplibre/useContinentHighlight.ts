"use client";

// Tints whole continents on the MapLibre globe for the "find the continents"
// mission: green for the ones already found, a short red flash for a wrong
// click. Composes on top of the base style the same way
// useEarthScienceLayers does — its own source and layers, added once.
import { useEffect } from "react";
import type { CountryCollection, MaterikId } from "@/lib/geo/education/continents";

const SOURCE_ID = "mission-materiki";
const FOUND_LAYER_ID = "mission-materik-found";
const WRONG_LAYER_ID = "mission-materik-wrong";
const NOTHING = "__nothing__";

export interface UseContinentHighlightOptions {
  getMap: () => any;
  mapReady: boolean;
  /** Country outlines tagged with MATERIK (see tagCountriesWithMaterik); null until loaded. */
  countries: CountryCollection | null;
  /** Off outside the continents mission: the tint is hidden, not removed. */
  enabled: boolean;
  found: readonly MaterikId[];
  wrong: MaterikId | null;
}

export function useContinentHighlight({ getMap, mapReady, countries, enabled, found, wrong }: UseContinentHighlightOptions): void {
  useEffect(() => {
    const map = getMap();
    if (!map || !mapReady || !countries) return;
    let cancelled = false;

    function apply(): boolean {
      if (cancelled || getMap() !== map) return true;
      try {
        if (!map.getSource(SOURCE_ID)) {
          map.addSource(SOURCE_ID, { type: "geojson", data: countries });
          // under the country names, so labels stay readable over the tint
          const before = map.getLayer("country-label") ? "country-label" : undefined;
          map.addLayer(
            { id: FOUND_LAYER_ID, type: "fill", source: SOURCE_ID, paint: { "fill-color": "#34d399", "fill-opacity": 0.34 } },
            before
          );
          map.addLayer(
            { id: WRONG_LAYER_ID, type: "fill", source: SOURCE_ID, paint: { "fill-color": "#f87171", "fill-opacity": 0.42 } },
            before
          );
        }
        const visibility = enabled ? "visible" : "none";
        map.setLayoutProperty(FOUND_LAYER_ID, "visibility", visibility);
        map.setLayoutProperty(WRONG_LAYER_ID, "visibility", visibility);
        map.setFilter(FOUND_LAYER_ID, ["in", ["get", "MATERIK"], ["literal", found.length > 0 ? [...found] : [NOTHING]]]);
        map.setFilter(WRONG_LAYER_ID, ["==", ["get", "MATERIK"], wrong ?? NOTHING]);
        return true;
      } catch {
        // the style is not ready for new sources yet — try again once the map settles
        return false;
      }
    }

    if (!apply()) map.once("idle", apply);
    return () => {
      cancelled = true;
    };
  }, [getMap, mapReady, countries, enabled, found, wrong]);
}
