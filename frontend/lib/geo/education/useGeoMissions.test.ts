// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import { GEO_MISSIONS, MISSES_BEFORE_HINT, useGeoMissions } from "./useGeoMissions";
import { MATERIK_IDS } from "./continents";

// Mission progression is plain state: no map, no WebGL, no backend. The
// globe decides WHAT was clicked; this hook only decides what it is worth.

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

beforeEach(() => {
  window.localStorage.clear();
});

const STORAGE_KEY = "edumind:geo-missions:anon:sim-1";

function findAllContinents(result: { current: ReturnType<typeof useGeoMissions> }) {
  for (const _ of MATERIK_IDS) {
    const target = result.current.targetContinent;
    if (!target) break;
    act(() => result.current.markContinentFound(target));
  }
}

describe("useGeoMissions — the three missions", () => {
  it("starts on the first mission, with the other two locked", () => {
    const { result } = renderHook(() => useGeoMissions("sim-1"));
    expect(result.current.mission.id).toBe("geo-mission-continents");
    expect(result.current.isMissionUnlocked(0)).toBe(true);
    expect(result.current.isMissionUnlocked(1)).toBe(false);
    expect(result.current.isMissionUnlocked(2)).toBe(false);
    expect(result.current.totalXp).toBe(0);
  });

  it("completing a mission awards its XP once and unlocks the next one", () => {
    const { result } = renderHook(() => useGeoMissions("sim-1"));
    findAllContinents(result);

    expect(result.current.isComplete).toBe(true);
    expect(result.current.done).toBe(MATERIK_IDS.length);
    expect(result.current.totalXp).toBe(GEO_MISSIONS[0].xpReward);
    expect(result.current.isMissionUnlocked(1)).toBe(true);

    // marking an already found continent again changes nothing
    act(() => result.current.markContinentFound(MATERIK_IDS[0]));
    expect(result.current.totalXp).toBe(GEO_MISSIONS[0].xpReward);
  });

  it("advance moves to the records mission with a clean slate", () => {
    const { result } = renderHook(() => useGeoMissions("sim-1"));
    findAllContinents(result);
    act(() => result.current.advance());

    expect(result.current.mission.id).toBe("geo-mission-records");
    expect(result.current.done).toBe(0);
    expect(result.current.foundContinents).toEqual([]);
    expect(result.current.targetRecord).not.toBeNull();
    expect(result.current.recordOrder).toHaveLength(GEO_MISSIONS[1].total);
  });

  it("records and shapes are counted from their own answers", () => {
    const { result } = renderHook(() => useGeoMissions("sim-1"));
    findAllContinents(result);
    act(() => result.current.advance());

    const order = [...result.current.recordOrder];
    expect(result.current.targetRecord).toBe(order[0]);
    act(() => result.current.markRecordFound(order[0]));
    expect(result.current.done).toBe(1);
    expect(result.current.targetRecord).toBe(order[1]);

    for (const id of order.slice(1)) act(() => result.current.markRecordFound(id));
    expect(result.current.isComplete).toBe(true);
    expect(result.current.totalXp).toBe(GEO_MISSIONS[0].xpReward + GEO_MISSIONS[1].xpReward);

    act(() => result.current.advance());
    expect(result.current.mission.id).toBe("geo-mission-shapes");
    const shapes = [...result.current.shapeOrder];
    expect(shapes).toHaveLength(GEO_MISSIONS[2].total);
    for (const code of shapes) act(() => result.current.markShapeFound(code));
    expect(result.current.isComplete).toBe(true);
    expect(result.current.isLastMission).toBe(true);
  });

  it("offers the hint only after a few misses, and a right answer clears the count", () => {
    const { result } = renderHook(() => useGeoMissions("sim-1"));
    findAllContinents(result);
    act(() => result.current.advance());

    expect(result.current.hintOffered).toBe(false);
    for (let i = 0; i < MISSES_BEFORE_HINT; i++) act(() => result.current.registerMiss());
    expect(result.current.hintOffered).toBe(true);

    act(() => result.current.markRecordFound(result.current.targetRecord!));
    expect(result.current.missesOnTarget).toBe(0);
    expect(result.current.hintOffered).toBe(false);
  });

  it("skipping parks the question at the end of the run instead of dropping it", () => {
    const { result } = renderHook(() => useGeoMissions("sim-1"));
    findAllContinents(result);
    act(() => result.current.advance());

    const order = [...result.current.recordOrder];
    act(() => result.current.skipTarget());

    expect(result.current.recordOrder).toHaveLength(order.length);
    expect(result.current.recordOrder[result.current.recordOrder.length - 1]).toBe(order[0]);
    expect(result.current.targetRecord).toBe(order[1]);
    // the mission still asks for every answer
    expect(result.current.mission.total).toBe(order.length);
  });

  it("a locked mission cannot be opened from the stepper", () => {
    const { result } = renderHook(() => useGeoMissions("sim-1"));
    act(() => result.current.goToMission(2));
    expect(result.current.mission.id).toBe("geo-mission-continents");
  });
});

describe("useGeoMissions — progress that survives a reload", () => {
  it("writes the finished missions and the XP, and reads them back", () => {
    const first = renderHook(() => useGeoMissions("sim-1"));
    findAllContinents(first.result);
    act(() => first.result.current.advance());
    cleanup();

    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY)!);
    expect(stored.completedIds).toEqual(["geo-mission-continents"]);
    expect(stored.missionIndex).toBe(1);

    const second = renderHook(() => useGeoMissions("sim-1"));
    expect(second.result.current.mission.id).toBe("geo-mission-records");
    expect(second.result.current.totalXp).toBe(GEO_MISSIONS[0].xpReward);
    expect(second.result.current.isMissionUnlocked(1)).toBe(true);
    // a run always starts over: the questions are drawn again
    expect(second.result.current.done).toBe(0);
  });

  it("forgets missions that no longer exist and clamps a stale index", () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ missionIndex: 7, completedIds: ["geo-mission-volcanoes", "geo-mission-continents"], totalXp: 25 })
    );
    const { result } = renderHook(() => useGeoMissions("sim-1"));
    expect(result.current.missionIndex).toBe(GEO_MISSIONS.length - 1);
    expect(result.current.completedMissionIds).toEqual(["geo-mission-continents"]);
    expect(result.current.totalXp).toBe(25);
  });

  it("broken storage is ignored, not thrown", () => {
    window.localStorage.setItem(STORAGE_KEY, "{not json");
    const { result } = renderHook(() => useGeoMissions("sim-1"));
    expect(result.current.mission.id).toBe("geo-mission-continents");
    expect(result.current.totalXp).toBe(0);
  });
});
