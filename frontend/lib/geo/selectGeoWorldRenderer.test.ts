import { describe, expect, it } from "vitest";
import { selectGeoWorldRenderer } from "./selectGeoWorldRenderer";

// G6.12 renderer-default flip — owner found the Learning Center "Войти"
// CTA (and every other dynamic simulation link — LessonCard, ContinueLearning,
// NextStep, WorldSection — none of which ever append a query string) still
// landed students on the old Three.js renderer, because the route defaulted
// to it whenever `?engine=maplibre` was absent. MapLibre is now the default;
// `?engine=legacy` is the only way back to the old renderer.
describe("selectGeoWorldRenderer", () => {
  it("no query param (real Learning Center CTA / lesson card behavior) → maplibre", () => {
    expect(selectGeoWorldRenderer(null)).toBe("maplibre");
  });

  it("?engine=legacy → legacy (dev/debug fallback, not surfaced in student UI)", () => {
    expect(selectGeoWorldRenderer("legacy")).toBe("legacy");
  });

  it("?engine=maplibre (old bookmarked/shared links from the G6.10-G6.11 comparison era) → still maplibre", () => {
    expect(selectGeoWorldRenderer("maplibre")).toBe("maplibre");
  });

  it("any unrecognized value → maplibre (fail toward the new default, not silently toward legacy)", () => {
    expect(selectGeoWorldRenderer("bogus")).toBe("maplibre");
    expect(selectGeoWorldRenderer("")).toBe("maplibre");
  });
});
