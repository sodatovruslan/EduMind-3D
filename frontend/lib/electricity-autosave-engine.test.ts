// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { electricityAutosaveEngine, loadElectricitySave } from "./electricity-autosave-engine";
import type { SerializeElectricitySaveOptions } from "./electricity-save-serializer";

/**
 * Stage S9.7 — Autosave Engine unit tests. Localstorage-only движок (см.
 * electricity-autosave-engine.ts) — в отличие от Chemistry's autosave-
 * engine.test.ts здесь не нужен mock сети (apiFetch), запись синхронна.
 */

function fakeStateGetter(
  overrides: Partial<Omit<SerializeElectricitySaveOptions, "saveId" | "simulationId" | "revision">> = {}
) {
  return () => ({
    components: [],
    connections: [],
    experimentId: "elec-beginner-measure-current",
    currentStepIndex: 0,
    completedStepIds: [],
    taskStatus: "in_progress" as const,
    startedAt: new Date(0).toISOString(),
    hintsUsed: 0,
    measurements: [],
    questionAnswers: {},
    observationsDraft: "",
    conclusionDraft: "",
    evidenceEvents: [],
    sessionObservations: {
      minVoltageV: 0,
      maxVoltageV: 0,
      minResistanceOhm: 0,
      maxResistanceOhm: 0,
      maxCurrentA: 0,
      maxBulbBrightness: 0,
      fuseBlownObserved: false,
      openCircuitObserved: false,
      shortCircuitObserved: false,
    },
    ...overrides,
  });
}

beforeEach(() => {
  window.localStorage.clear();
  vi.useFakeTimers();
});

afterEach(() => {
  electricityAutosaveEngine.destroy();
  vi.useRealTimers();
});

describe("electricity-autosave-engine — dirty-state debounce", () => {
  it("markDirty() без init() ничего не пишет (движок неактивен)", () => {
    electricityAutosaveEngine.markDirty();
    vi.advanceTimersByTime(5000);
    expect(loadElectricitySave("sim-1")).toBeNull();
  });

  it("серия быстрых markDirty() схлопывается в ОДНУ запись после debounce, а не спамит", () => {
    const writes: number[] = [];
    const getter = fakeStateGetter();
    electricityAutosaveEngine.init("save-1", "sim-1", 1, getter);

    for (let i = 0; i < 20; i++) {
      electricityAutosaveEngine.markDirty();
      vi.advanceTimersByTime(100); // всегда меньше debounce-окна (1500ms)
    }
    // ни одной записи ещё не должно быть — debounce постоянно сбрасывается
    expect(loadElectricitySave("sim-1")).toBeNull();

    vi.advanceTimersByTime(1500); // теперь debounce истекает один раз
    const saved = loadElectricitySave("sim-1");
    expect(saved).not.toBeNull();
    expect(saved!.revision).toBe(2); // initialRevision(1) + 1 успешный flush
    void writes;
  });

  it("реальные изменения после первого сохранения дают новую ревизию, а не спам", () => {
    electricityAutosaveEngine.init("save-1", "sim-1", 1, fakeStateGetter());
    electricityAutosaveEngine.markDirty();
    vi.advanceTimersByTime(1500);
    expect(loadElectricitySave("sim-1")!.revision).toBe(2);

    electricityAutosaveEngine.markDirty();
    vi.advanceTimersByTime(1500);
    expect(loadElectricitySave("sim-1")!.revision).toBe(3);
  });
});

describe("electricity-autosave-engine — статус/подписка", () => {
  it("переходы idle -> pending -> saved корректны и уведомляют подписчиков", () => {
    const seen: string[] = [];
    const unsubscribe = electricityAutosaveEngine.subscribe((s) => seen.push(s));

    expect(electricityAutosaveEngine.getStatus()).toBe("idle");
    electricityAutosaveEngine.init("save-1", "sim-1", 1, fakeStateGetter());
    electricityAutosaveEngine.markDirty();
    expect(electricityAutosaveEngine.getStatus()).toBe("pending");

    vi.advanceTimersByTime(1500);
    expect(electricityAutosaveEngine.getStatus()).toBe("saved");
    expect(seen).toEqual(["idle", "pending", "saving", "saved"]);
    unsubscribe();
  });

  it("uninit() останавливает таймеры и возвращает idle, не трогая уже записанный снимок", () => {
    electricityAutosaveEngine.init("save-1", "sim-1", 1, fakeStateGetter());
    electricityAutosaveEngine.markDirty();
    vi.advanceTimersByTime(1500);
    expect(loadElectricitySave("sim-1")).not.toBeNull();

    electricityAutosaveEngine.uninit();
    expect(electricityAutosaveEngine.getStatus()).toBe("idle");

    // после uninit() markDirty() снова no-op (saveId сброшен)
    electricityAutosaveEngine.markDirty();
    vi.advanceTimersByTime(30000);
    expect(loadElectricitySave("sim-1")!.revision).toBe(2); // не выросло дальше
  });
});

describe("electricity-autosave-engine — periodic safety net и защита от пустого состояния", () => {
  it("flush() при отсутствующем состоянии (getter вернул null) ничего не пишет и не тратит номер ревизии", () => {
    electricityAutosaveEngine.init("save-1", "sim-1", 1, () => null);
    electricityAutosaveEngine.markDirty();
    vi.advanceTimersByTime(1500);
    expect(loadElectricitySave("sim-1")).toBeNull();
  });

  it("периодический safety-net в конце концов сохраняет прогресс даже без явного вызова flush()", () => {
    electricityAutosaveEngine.init("save-1", "sim-1", 1, fakeStateGetter());
    electricityAutosaveEngine.markDirty();
    vi.advanceTimersByTime(20000); // periodic-интервал; debounce (1500ms) тоже успевает сработать внутри него
    expect(loadElectricitySave("sim-1")).not.toBeNull();
  });
});

describe("electricity-autosave-engine — revision из snapshot.revision при resume", () => {
  it("init() с initialRevision из существующего снимка продолжает нумерацию, а не начинает заново с 1", () => {
    electricityAutosaveEngine.init("save-1", "sim-1", 7, fakeStateGetter());
    electricityAutosaveEngine.markDirty();
    vi.advanceTimersByTime(1500);
    expect(loadElectricitySave("sim-1")!.revision).toBe(8);
  });
});
