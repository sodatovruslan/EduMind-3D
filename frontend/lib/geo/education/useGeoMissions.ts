"use client";

// GeoWorld missions: three short tasks on the globe, in the same spirit as
// the tasks of the Electricity and Chemistry labs. This hook owns which
// mission is open, what has been completed and the XP; what counts as
// "done" inside a mission is decided from real actions on the globe
// (a click that lands on the right continent, on the place that holds a
// record, on the country whose outline is on the card) — nothing is ticked
// off by pressing a button.
//
// Every run reshuffles its questions, so a mission cannot be passed from
// memory of the previous attempt.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useOptionalAuth } from "@/lib/auth-context";
import { MATERIK_IDS, shuffledMateriki, type MaterikId } from "./continents";
import { RECORDS_PER_RUN, shuffledRecords, type GeoRecordId } from "./geo-records";
import { SHAPES_PER_RUN, shuffledShapes } from "./country-shapes";

export type GeoMissionId = "geo-mission-continents" | "geo-mission-records" | "geo-mission-shapes";

export interface GeoMissionDefinition {
  id: GeoMissionId;
  xpReward: number;
  /** How many things the student has to find in one run. */
  total: number;
}

export const GEO_MISSIONS: readonly GeoMissionDefinition[] = [
  { id: "geo-mission-continents", xpReward: 10, total: MATERIK_IDS.length },
  { id: "geo-mission-records", xpReward: 15, total: RECORDS_PER_RUN },
  { id: "geo-mission-shapes", xpReward: 20, total: SHAPES_PER_RUN },
];

/** Misses on the current question before the game offers to show the answer. */
export const MISSES_BEFORE_HINT = 2;

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
      // ids of missions that no longer exist are simply forgotten
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
  const [recordOrder, setRecordOrder] = useState<GeoRecordId[]>(() => shuffledRecords());
  const [foundRecords, setFoundRecords] = useState<GeoRecordId[]>([]);
  const [shapeOrder, setShapeOrder] = useState<string[]>(() => shuffledShapes());
  const [foundShapes, setFoundShapes] = useState<string[]>([]);
  /** Wrong clicks on the question that is open right now. */
  const [missesOnTarget, setMissesOnTarget] = useState(0);

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
      : mission.id === "geo-mission-records"
        ? foundRecords.length
        : foundShapes.length;
  const isComplete = done >= mission.total;

  // the thing to look for now: the first one in this run's order not found yet
  const targetContinent = useMemo(
    () => continentOrder.find((id) => !foundContinents.includes(id)) ?? null,
    [continentOrder, foundContinents]
  );
  const targetRecord = useMemo(() => recordOrder.find((id) => !foundRecords.includes(id)) ?? null, [recordOrder, foundRecords]);
  const targetShape = useMemo(() => shapeOrder.find((code) => !foundShapes.includes(code)) ?? null, [shapeOrder, foundShapes]);

  useEffect(() => {
    if (!isComplete || completedIds.has(mission.id)) return;
    setCompletedIds((prev) => new Set(prev).add(mission.id));
    setTotalXp((prev) => prev + mission.xpReward);
  }, [isComplete, mission, completedIds]);

  const resetMissionProgress = useCallback(() => {
    setContinentOrder(shuffledMateriki());
    setFoundContinents([]);
    setRecordOrder(shuffledRecords());
    setFoundRecords([]);
    setShapeOrder(shuffledShapes());
    setFoundShapes([]);
    setMissesOnTarget(0);
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
    setMissesOnTarget(0);
    setFoundContinents((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }, []);

  const markRecordFound = useCallback((id: GeoRecordId) => {
    setMissesOnTarget(0);
    setFoundRecords((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }, []);

  const markShapeFound = useCallback((adm0: string) => {
    setMissesOnTarget(0);
    setFoundShapes((prev) => (prev.includes(adm0) ? prev : [...prev, adm0]));
  }, []);

  /** A wrong click on the question that is open: after a couple of them the hint is offered. */
  const registerMiss = useCallback(() => setMissesOnTarget((prev) => prev + 1), []);

  /**
   * Park the open question and move to the next one. It is not written off
   * — it goes to the back of this run's queue and comes back later, so the
   * mission still asks for all of its answers, and a student stuck on Chile
   * is not stuck on it right now.
   */
  const skipTarget = useCallback(() => {
    setMissesOnTarget(0);
    const rotate = <T,>(queue: T[], item: T | null): T[] =>
      item === null || queue.length < 2 ? queue : [...queue.filter((x) => x !== item), item];
    if (mission.id === "geo-mission-records") {
      setRecordOrder((prev) => rotate(prev, targetRecord));
    } else if (mission.id === "geo-mission-shapes") {
      setShapeOrder((prev) => rotate(prev, targetShape));
    }
  }, [mission.id, targetRecord, targetShape]);

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
    // continents
    targetContinent,
    foundContinents,
    markContinentFound,
    // records
    recordOrder,
    targetRecord,
    foundRecords,
    markRecordFound,
    // country shapes
    shapeOrder,
    targetShape,
    foundShapes,
    markShapeFound,
    // shared
    missesOnTarget,
    hintOffered: missesOnTarget >= MISSES_BEFORE_HINT,
    registerMiss,
    skipTarget,
  };
}

export type GeoMissionsState = ReturnType<typeof useGeoMissions>;
