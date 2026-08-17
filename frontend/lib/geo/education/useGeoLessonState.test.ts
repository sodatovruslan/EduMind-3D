// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import { useGeoLessonState } from "./useGeoLessonState";
import { apiFetch, ApiError } from "@/lib/api";

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(),
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
}));

const mockedApiFetch = vi.mocked(apiFetch);

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

// G6.11 §3/§4 — эта логика renderer-independent (никакого MapLibre/Three.js
// импорта), поэтому юнит-тестируема без WebGL/jsdom-канваса — то, что было
// невозможно для GeoWorldScene.tsx целиком (R3F-компонент).
describe("GeoWorld G6.11 — useGeoLessonState (shared educational domain logic)", () => {
  it("exploreLayer: успешный запрос сохраняет результат и добавляет запись в actionsLog", async () => {
    mockedApiFetch.mockResolvedValueOnce({
      result: { layer: "crust", name: "Земная кора", depth_km: "0-35", temperature_c: "0-1000", state: "твердое", composition: "Базальт" },
    });

    const { result } = renderHook(() => useGeoLessonState("sim-1"));
    await act(async () => {
      await result.current.exploreLayer("crust");
    });

    expect(result.current.selectedLayer?.name).toBe("Земная кора");
    expect(result.current.selectedContinent).toBeNull();
    expect(result.current.actionsLog).toEqual([{ action_type: "explore_layer", layer: "crust" }]);
    expect(mockedApiFetch).toHaveBeenCalledWith(
      "/api/simulations/sim-1/action",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ action_type: "explore_layer", payload: { layer: "crust" } }) })
    );
  });

  it("exploreContinent: успешный запрос сохраняет континент и сбрасывает selectedLayer", async () => {
    mockedApiFetch
      .mockResolvedValueOnce({
        result: { layer: "crust", name: "Земная кора", depth_km: "0-35", temperature_c: "0-1000", state: "твердое", composition: "Базальт" },
      })
      .mockResolvedValueOnce({
        result: { continent: "asia", name: "Азия", area_million_km2: 44.6, population_millions: 4700, fact: "Самый большой континент." },
      });

    const { result } = renderHook(() => useGeoLessonState("sim-1"));
    await act(async () => {
      await result.current.exploreLayer("crust");
    });
    await act(async () => {
      await result.current.exploreContinent(38.5, 68.7);
    });

    expect(result.current.selectedContinent?.name).toBe("Азия");
    expect(result.current.selectedLayer).toBeNull();
    expect(result.current.actionsLog).toEqual([
      { action_type: "explore_layer", layer: "crust" },
      { action_type: "explore_continent", lat: 38.5, lng: 68.7 },
    ]);
  });

  it("exploreContinent: клик по океану (400) — честная ошибка, actionsLog не растёт", async () => {
    mockedApiFetch.mockRejectedValueOnce(new ApiError(400, "Здесь океан — суши нет"));

    const { result } = renderHook(() => useGeoLessonState("sim-1"));
    await act(async () => {
      await result.current.exploreContinent(0, -150);
    });

    expect(result.current.error).toBe("Здесь океан — суши нет");
    expect(result.current.actionsLog).toEqual([]);
  });

  it("completeAttempt: отправляет РЕАЛЬНЫЙ actionsLog на /complete и сохраняет score из ответа бэкенда", async () => {
    mockedApiFetch
      .mockResolvedValueOnce({
        result: { layer: "mantle", name: "Мантия", depth_km: "35-2890", temperature_c: "1000-3700", state: "пластичное", composition: "Силикаты" },
      })
      .mockResolvedValueOnce({ score: 25 });

    const { result } = renderHook(() => useGeoLessonState("sim-1"));
    await act(async () => {
      await result.current.exploreLayer("mantle");
    });
    await act(async () => {
      await result.current.completeAttempt();
    });

    expect(result.current.completionScore).toBe(25);
    const completeCall = mockedApiFetch.mock.calls.find(([url]) => String(url).includes("/complete"));
    expect(completeCall).toBeDefined();
    const body = JSON.parse(String((completeCall?.[1] as RequestInit)?.body));
    expect(body.actions_log).toEqual([{ action_type: "explore_layer", layer: "mantle" }]);
    expect(typeof body.duration_seconds).toBe("number");
  });

  it("triggerClimateScenario: не переотправляет действие, пока аномалия остаётся выше порога (та же логика, что GeoWorldScene.tsx)", async () => {
    mockedApiFetch.mockResolvedValue({
      result: { triggered: true, location: "Памир, Таджикистан", phenomenon: "Сель", description: "..." },
    });

    const { result } = renderHook(() => useGeoLessonState("sim-1"));
    await act(async () => {
      await result.current.triggerClimateScenario(3.5, 3.0);
    });
    await act(async () => {
      await result.current.triggerClimateScenario(4.0, 3.0);
    });

    // Один вызов, не два — "wasAboveThresholdRef" не даёт повторно
    // отыгрывать один и тот же сценарий, пока порог не был снова пересечён снизу.
    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
  });
});
