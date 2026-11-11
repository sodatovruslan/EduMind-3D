"use client";

// GeoWorld missions: three short tasks on the globe, in the same spirit as
// the tasks of the Electricity and Chemistry labs. This hook owns which
// mission is open, what has been completed and the XP; what counts as
// "done" inside a mission is decided from real actions on the globe
// (a click that lands on the right continent, a volcano actually opened, a
// layer actually explored) — nothing is ticked off by pressing a button.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useOptionalAuth } from "@/lib/auth-context";
import { MATERIK_IDS, shuffledMateriki, type MaterikId } from "./continents";
import type { EarthLayerKey } from "./useGeoLessonState";

export type GeoMissionId = "geo-mission-continents" | "geo-mission-volcanoes" | "geo-mission-core";

export interface GeoMissionDefinition {
  id: GeoMissionId;
  xpReward: number;
  /** How many things the student has to find/open/explore. */
  total: number;
}

export const VOLCANOES_TO_OPEN = 3;
export const EARTH_LAYER_KEYS: readonly EarthLayerKey[] = ["crust", "mantle", "outer_core", "inner_core"];

export const GEO_MISSIONS: readonly GeoMissionDefinition[] = [
  { id: "geo-mission-continents", xpReward: 10, total: MATERIK_IDS.length },
  { id: "geo-mission-volcanoes", xpReward: 15, total: VOLCANOES_TO_OPEN },
  { id: "geo-mission-core", xpReward: 20, total: EARTH_LAYER_KEYS.length },
];

interface StoredMissionProgress {
  missionIndex: number;
  completedIds: string[];
  totalXp: number;
}

function progressKey(userId: string | undefined, simulationId: string): string {
  return `edumind:geo-missions:${userId ?? "anon"}:${simulationId}`;
}

function loadProgress(key: string): StoredMissionProgress | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredMissionProgress;
    const known = new Set<string>(GEO_MISSIONS.map((m) => m.id));
    return {
      missionIndex: Math.min(Math.max(0, Math.floor(parsed.missionIndex ?? 0)), GEO_MISSIONS.length - 1),
      completedIds: (parsed.completedIds ?? []).filter((id) => known.has(id)),
      totalXp: Math.max(0, Number(parsed.totalXp) || 0),
    };
  } catch {
    return null;
  }
}

export function useGeoMissions(simulationId: string) {
  const auth = useOptionalAuth();
  const storageKey = progressKey(auth?.user?.id, simulationId);
  const [stored] = useState(() => loadProgress(storageKey));
  const [missionIndex, setMissionIndex] = useState(stored?.missionIndex ?? 0);
  const [completedIds, setCompletedIds] = useState<Set<string>>(() => new Set(stored?.completedIds ?? []));
  const [totalXp, setTotalXp] = useState(stored?.totalXp ?? 0);

  // progress inside the open mission — starts over whenever a mission is (re)opened
  const [continentOrder, setContinentOrder] = useState<MaterikId[]>(() => shuffledMateriki());
  const [foundContinents, setFoundContinents] = useState<MaterikId[]>([]);
  const [openedVolcanoes, setOpenedVolcanoes] = useState<string[]>([]);
  const [exploredLayers, setExploredLayers] = useState<EarthLayerKey[]>([]);

  useEffect(() => {
    try {
      const data: StoredMissionProgress = { missionIndex, completedIds: Array.from(completedIds), totalXp };
      window.localStorage.setItem(storageKey, JSON.stringify(data));
    } catch {
      // private mode / full storage — progress just will not survive a reload
    }
  }, [storageKey, missionIndex, completedIds, totalXp]);

  const mission = GEO_MISSIONS[missionIndex];
  const done =
    mission.id === "geo-mission-continents"
      ? foundContinents.length
      : mission.id === "geo-mission-volcanoes"
        ? Math.min(openedVolcanoes.length, VOLCANOES_TO_OPEN)
        : exploredLayers.length;
  const isComplete = done >= mission.total;

  // the continent to look for now: the first one in this run's order that is not found yet
  const targetContinent = useMemo(
    () => continentOrder.find((id) => !foundContinents.includes(id)) ?? null,
    [continentOrder, foundContinents]
  );

  useEffect(() => {
    if (!isComplete || completedIds.has(mission.id)) return;
    setCompletedIds((prev) => new Set(prev).add(mission.id));
    setTotalXp((prev) => prev + mission.xpReward);
  }, [isComplete, mission, completedIds]);

  const resetMissionProgress = useCallback(() => {
    setContinentOrder(shuffledMateriki());
    setFoundContinents([]);
    setOpenedVolcanoes([]);
    setExploredLayers([]);
  }, []);

  const isMissionUnlocked = useCallback(
    (index: number) => index >= 0 && index < GEO_MISSIONS.length && (index === 0 || completedIds.has(GEO_MISSIONS[index - 1].id)),
    [completedIds]
  );

  const goToMission = useCallback(
    (index: number) => {
      if (!isMissionUnlocked(index)) return;
      resetMissionProgress();
      setMissionIndex(index);
    },
    [isMissionUnlocked, resetMissionProgress]
  );

  const advance = useCallback(() => {
    if (missionIndex >= GEO_MISSIONS.length - 1) return;
    resetMissionProgress();
    setMissionIndex(missionIndex + 1);
  }, [missionIndex, resetMissionProgress]);

  const markContinentFound = useCallback((id: MaterikId) => {
    setFoundContinents((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }, []);

  const markVolcanoOpened = useCallback((name: string) => {
    setOpenedVolcanoes((prev) => (prev.includes(name) ? prev : [...prev, name]));
  }, []);

  const markLayerExplored = useCallback((layer: EarthLayerKey) => {
    setExploredLayers((prev) => (prev.includes(layer) ? prev : [...prev, layer]));
  }, []);

  return {
    missionIndex,
    mission,
    totalXp,
    done,
    isComplete,
    isLastMission: missionIndex === GEO_MISSIONS.length - 1,
    completedMissionIds: Array.from(completedIds),
    isMissionUnlocked,
    goToMission,
    advance,
    targetContinent,
    foundContinents,
    openedVolcanoes,
    exploredLayers,
    markContinentFound,
    markVolcanoOpened,
    markLayerExplored,
  };
}

export type GeoMissionsState = ReturnType<typeof useGeoMissions>;
