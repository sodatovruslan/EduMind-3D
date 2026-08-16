"use client";

// G6.11 §3/§4 — renderer-independent GeoWorld educational domain logic.
// Educational state (actions log, score, selections) does NOT live inside
// MapLibre (or Three.js) internals — this hook owns it, talking to the SAME
// backend contract (`/api/simulations/{id}/action`, `/complete`) that
// `components/scenes/GeoWorldScene.tsx` already uses. The request/response
// shapes and actionsLog entry format are copied verbatim from that
// already-shipped, already-tested code — not reinvented — so a completion
// produced here scores identically via the existing `compute_score`
// backend logic (`grader_service.py`, matches `actions_log[].action_type`
// against `simulation.config.expected_steps`, order-preserving, extra
// actions not penalized).
//
// Deliberately NOT wired into GeoWorldScene.tsx itself in this stage (same
// risk posture as G6.10 leaving the spike untouched) — GeoWorldScene keeps
// its own inline copy of this logic, this hook is consumed ONLY by the new
// MapLibre lesson. Both call the same backend, so behavior is provably
// equivalent without touching the already-approved production renderer.
import { useCallback, useRef, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";

export type EarthLayerKey = "crust" | "mantle" | "outer_core" | "inner_core";

export interface LayerResult {
  layer: string;
  name: string;
  depth_km: string;
  temperature_c: string;
  state: string;
  composition: string;
}

export interface ContinentResult {
  continent: string;
  name: string;
  area_million_km2: number;
  population_millions: number;
  fact: string;
}

export interface ClimateResult {
  triggered: boolean;
  location: string | null;
  phenomenon: string | null;
  description: string;
}

export function useGeoLessonState(simulationId: string) {
  const [actionsLog, setActionsLog] = useState<Record<string, unknown>[]>([]);
  const [selectedLayer, setSelectedLayer] = useState<LayerResult | null>(null);
  const [selectedContinent, setSelectedContinent] = useState<ContinentResult | null>(null);
  const [climateResult, setClimateResult] = useState<ClimateResult | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completionScore, setCompletionScore] = useState<number | null>(null);
  const mountedAtRef = useRef(Date.now());
  const wasAboveThresholdRef = useRef(false);

  const exploreLayer = useCallback(
    async (layer: EarthLayerKey) => {
      setError(null);
      setIsSubmitting(true);
      try {
        const response = await apiFetch<{ result: LayerResult }>(`/api/simulations/${simulationId}/action`, {
          method: "POST",
          body: JSON.stringify({ action_type: "explore_layer", payload: { layer } }),
        });
        setSelectedLayer(response.result);
        setSelectedContinent(null);
        setActionsLog((prev) => [...prev, { action_type: "explore_layer", layer }]);
        return response.result;
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Не удалось получить информацию о слое");
        return null;
      } finally {
        setIsSubmitting(false);
      }
    },
    [simulationId]
  );

  const exploreContinent = useCallback(
    async (lat: number, lng: number) => {
      setError(null);
      setIsSubmitting(true);
      try {
        const response = await apiFetch<{ result: ContinentResult }>(`/api/simulations/${simulationId}/action`, {
          method: "POST",
          body: JSON.stringify({ action_type: "explore_continent", payload: { lat, lng } }),
        });
        setSelectedContinent(response.result);
        setSelectedLayer(null);
        setActionsLog((prev) => [...prev, { action_type: "explore_continent", lat, lng }]);
        return response.result;
      } catch (err) {
        // Тот же текст, что уже показывает GeoWorldScene.tsx при клике по
        // океану ("Здесь океан...") — тот же backend-контракт, тот же UX.
        setError(err instanceof ApiError ? err.message : "Здесь океан — попробуй кликнуть по суше");
        return null;
      } finally {
        setIsSubmitting(false);
      }
    },
    [simulationId]
  );

  const triggerClimateScenario = useCallback(
    async (temperatureAnomaly: number, thresholdC: number) => {
      const isAboveThreshold = temperatureAnomaly >= thresholdC;
      if (!isAboveThreshold) {
        wasAboveThresholdRef.current = false;
        setClimateResult(null);
        return null;
      }
      if (wasAboveThresholdRef.current) return climateResult;
      wasAboveThresholdRef.current = true;

      try {
        const response = await apiFetch<{ result: ClimateResult }>(`/api/simulations/${simulationId}/action`, {
          method: "POST",
          body: JSON.stringify({ action_type: "trigger_climate_scenario", payload: { temperature_anomaly: temperatureAnomaly } }),
        });
        setClimateResult(response.result);
        setActionsLog((prev) => [...prev, { action_type: "trigger_climate_scenario", temperature_anomaly: temperatureAnomaly }]);
        return response.result;
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Не удалось рассчитать климатический сценарий");
        return null;
      }
    },
    [simulationId, climateResult]
  );

  const completeAttempt = useCallback(async () => {
    setError(null);
    try {
      const result = await apiFetch<{ score: number | null }>(`/api/simulations/${simulationId}/complete`, {
        method: "POST",
        body: JSON.stringify({
          actions_log: actionsLog,
          duration_seconds: Math.round((Date.now() - mountedAtRef.current) / 1000),
        }),
      });
      setCompletionScore(result.score);
      return result.score;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось завершить попытку");
      return null;
    }
  }, [simulationId, actionsLog]);

  return {
    actionsLog,
    selectedLayer,
    selectedContinent,
    climateResult,
    isSubmitting,
    error,
    completionScore,
    exploreLayer,
    exploreContinent,
    triggerClimateScenario,
    completeAttempt,
  };
}
