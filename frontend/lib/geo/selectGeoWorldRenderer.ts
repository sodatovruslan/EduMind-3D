// G6.12 renderer-default flip — extracted as a pure function so the
// "which GeoWorld renderer for this request" decision is unit-testable
// without mounting the heavy `app/(immersive)/geo3d/[id]/page.tsx` client
// component (SWR + useSearchParams + two full WebGL scene components —
// no other immersive route in this codebase unit-tests its page.tsx for
// exactly that reason, see chemistry_world/electricity_lab/simlab).
export type GeoWorldRenderer = "maplibre" | "legacy";

/**
 * MapLibre is the default production renderer for every student entry
 * point (Learning Center "Войти", lesson cards, `/geo3d/{id}` with no
 * query string — none of them ever append `?engine=...`). The old
 * Three.js cutaway renderer stays reachable ONLY via an explicit
 * `?engine=legacy` — a dev/debug fallback, not something surfaced in
 * student UI.
 */
export function selectGeoWorldRenderer(engineParam: string | null): GeoWorldRenderer {
  return engineParam === "legacy" ? "legacy" : "maplibre";
}
