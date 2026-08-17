import { describe, expect, it } from "vitest";
import { normalizeCameraState } from "./camera-context";

// G6.11 §19 — "не равнять центр камеры с названием региона" (тест
// подтверждает только числовую нормализацию, никакой region-lookup здесь
// не происходит и не должен появиться без явного отдельного решения).
describe("GeoWorld G6.11 — normalizeCameraState", () => {
  function fakeMap(overrides: Partial<Record<"lng" | "lat" | "zoom" | "bearing" | "pitch", number>> = {}) {
    const { lng = 68.773879, lat = 38.560035, zoom = 11.532, bearing = 12.34, pitch = 60.11 } = overrides;
    return {
      getCenter: () => ({ lng, lat }),
      getZoom: () => zoom,
      getBearing: () => bearing,
      getPitch: () => pitch,
    };
  }

  it("возвращает только числовые примитивы (сериализуемый снимок, не ссылка на карту)", () => {
    const ctx = normalizeCameraState(fakeMap());
    expect(ctx).toEqual({ center: [68.7739, 38.56], zoom: 11.53, bearing: 12.3, pitch: 60.1 });
    expect(() => JSON.stringify(ctx)).not.toThrow();
  });

  it("округление не искажает знак/порядок величины координат (Памир — восток/север)", () => {
    const ctx = normalizeCameraState(fakeMap({ lng: 72.0, lat: 38.5 }));
    expect(ctx.center[0]).toBeCloseTo(72.0, 4);
    expect(ctx.center[1]).toBeCloseTo(38.5, 4);
  });
});
