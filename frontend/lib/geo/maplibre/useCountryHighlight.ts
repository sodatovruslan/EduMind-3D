"use client";

// Tints single countries on the MapLibre globe for the "guess the country
// by its shape" mission: green for the ones already recognised, a short red
// flash for a wrong click. Same composition as useContinentHighlight — its
// own source and layers added once over the base style — but filtered by
// the country code instead of the continent.
import { useEffect } from "react";
import type { CountryCollection } from "@/lib/geo/education/continents";

const SOURCE_ID = "mission-countries";
const FOUND_LAYER_ID = "mission-country-found";
const WRONG_LAYER_ID = "mission-country-wrong";
const NOTHING = "__nothing__";

export interface UseCountryHighlightOptions {
  getMap: () => any;
  mapReady: boolean;
  /** Country outlines; null until loaded. */
  countries: CountryCollection | null;
  /** Off outside the mission: the tint is hidden, not removed. */
  enabled: boolean;
  /** ADM0_A3 codes already answered. */
  found: readonly string[];
  /** ADM0_A3 of the last wrong click, flashed red. */
  wrong: string | null;
}

export function useCountryHighlight({ getMap, mapReady, countries, enabled, found, wrong }: UseCountryHighlightOptions): void {
  useEffect(() => {
    const map = getMap();
    if (!map || !mapReady || !countries) return;
    let cancelled = false;

    function apply(): boolean {
      if (cancelled || getMap() !== map) return true;
      try {
        if (!map.getSource(SOURCE_ID)) {
          map.addSource(SOURCE_ID, { type: "geojson", data: countries });
          const before = map.getLayer("country-label") ? "country-label" : undefined;
          map.addLayer(
            { id: FOUND_LAYER_ID, type: "fill", source: SOURCE_ID, paint: { "fill-color": "#34d399", "fill-opacity": 0.4 } },
            before
          );
          map.addLayer(
            { id: WRONG_LAYER_ID, type: "fill", source: SOURCE_ID, paint: { "fill-color": "#f87171", "fill-opacity": 0.45 } },
            before
          );
        }
        const visibility = enabled ? "visible" : "none";
        map.setLayoutProperty(FOUND_LAYER_ID, "visibility", visibility);
        map.setLayoutProperty(WRONG_LAYER_ID, "visibility", visibility);
        map.setFilter(FOUND_LAYER_ID, ["in", ["get", "ADM0_A3"], ["literal", found.length > 0 ? [...found] : [NOTHING]]]);
        map.setFilter(WRONG_LAYER_ID, ["==", ["get", "ADM0_A3"], wrong ?? NOTHING]);
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
