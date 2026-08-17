import { describe, expect, it } from "vitest";
import { addSubstance, createEmptyContainer, heat } from "./chemistry-engine";
import { applyReactions } from "./reaction-engine";
import { checkSafety } from "./chemistry-safety";
import { CONTAINER_PHYSICS, createDefaultIntegrity } from "./container-physics";
import { AMBIENT_PRESSURE_KPA } from "./pressure-engine";
import { evaluateHazard, type HazardResult } from "./hazard-engine";
import {
  LAB_CATALOG,
  getExperimentsByDifficulty,
  getLabExperiment,
  isDifficultyUnlocked,
  isExperimentUnlocked,
  searchExperiments,
  type LabStepContext,
} from "./chemistry-lab-catalog";

function baseContext(overrides: Partial<LabStepContext> = {}): LabStepContext {
  const container = overrides.activeContainer ?? createEmptyContainer("c1", "beaker", 20);
  const profile = CONTAINER_PHYSICS.beaker;
  const hazard: HazardResult =
    overrides.hazard ??
    evaluateHazard({
      container,
      profile,
      isSealed: false,
      hasHeatSource: false,
      safetyWarnings: [],
      reactionLog: [],
      previousIntegrity: createDefaultIntegrity(profile),
      previousPressureKPa: AMBIENT_PRESSURE_KPA,
      previousTemperatureC: container.temperatureC,
      dtSeconds: 1,
    });

  return {
    activeContainerId: "c1",
    activeContainer: container,
    isSealed: false,
    isOnStand: false,
    burnerOn: false,
    hazard,
    occurredReactionIds: [],
    allOccurredReactionIds: [],
    safetyWarnings: [],
    allContainers: [{ id: "c1", data: container }],
    pourLog: [],
    maxTemperatureCObserved: container.temperatureC,
    maxPressureRatioObserved: 0,
    ...overrides,
  };
}

describe("chemistry-lab-catalog — структура каталога", () => {
  it("содержит 16 экспериментов с сохранённой прогрессией сложности", () => {
    expect(LAB_CATALOG).toHaveLength(16);
    expect(getExperimentsByDifficulty("beginner")).toHaveLength(4);
    expect(getExperimentsByDifficulty("intermediate")).toHaveLength(6);
    expect(getExperimentsByDifficulty("advanced")).toHaveLength(6);
  });

  it("группирует карточки каталога по уровню: beginner, затем intermediate, затем advanced", () => {
    expect(LAB_CATALOG.map((experiment) => experiment.difficulty)).toEqual([
      ...Array(4).fill("beginner"),
      ...Array(6).fill("intermediate"),
      ...Array(6).fill("advanced"),
    ]);
  });

  it("все id уникальны", () => {
    const ids = LAB_CATALOG.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("каждый эксперимент заканчивается шагом finish, привязанным к isComplete", () => {
    LAB_CATALOG.forEach((e) => {
      const last = e.steps[e.steps.length - 1];
      expect(last.kind).toBe("finish");
    });
  });

  it("getLabExperiment находит по id и не находит несуществующий", () => {
    expect(getLabExperiment("lab-beginner-heating-water")?.title).toBe("Нагрев воды");
    expect(getLabExperiment("does-not-exist")).toBeUndefined();
  });

  it("searchExperiments реально фильтрует по названию", () => {
    const results = searchExperiments("давление");
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((e) => e.title.toLowerCase().includes("давлен") || e.description.toLowerCase().includes("давлен"))).toBe(true);
  });

  it("searchExperiments с пустым запросом возвращает весь каталог", () => {
    expect(searchExperiments("")).toHaveLength(16);
  });
});

describe("chemistry-lab-catalog — разблокировка по сложности (реальная, не выдуманная)", () => {
  it("beginner всегда разблокирован", () => {
    expect(isDifficultyUnlocked("beginner", [])).toBe(true);
  });

  it("intermediate заблокирован, пока не пройден ни один beginner-эксперимент", () => {
    expect(isDifficultyUnlocked("intermediate", [])).toBe(false);
    expect(isDifficultyUnlocked("intermediate", ["lab-beginner-heating-water"])).toBe(true);
  });

  it("advanced заблокирован, пока не пройден ни один intermediate-эксперимент", () => {
    expect(isDifficultyUnlocked("advanced", ["lab-beginner-heating-water"])).toBe(false);
    expect(isDifficultyUnlocked("advanced", ["lab-intermediate-exothermic"])).toBe(true);
  });

  it("isExperimentUnlocked согласован с isDifficultyUnlocked", () => {
    const advancedExp = getLabExperiment("lab-advanced-closed-pressure")!;
    expect(isExperimentUnlocked(advancedExp, [])).toBe(false);
    expect(isExperimentUnlocked(advancedExp, ["lab-intermediate-gas-formation"])).toBe(true);
  });

  it("fresh student: все 4 beginner доступны, все 6 intermediate и 6 advanced заблокированы", () => {
    const unlocked = LAB_CATALOG.filter((experiment) => isExperimentUnlocked(experiment, []));
    expect(unlocked.map((experiment) => experiment.difficulty)).toEqual(Array(4).fill("beginner"));
  });

  it("после любого beginner открываются все intermediate, но advanced остаются locked", () => {
    const completed = ["lab-beginner-heating-water"];
    for (const experiment of LAB_CATALOG) {
      expect(isExperimentUnlocked(experiment, completed)).toBe(experiment.difficulty !== "advanced");
    }
  });

  it("после любого intermediate открываются все 16 экспериментов", () => {
    const completed = ["lab-beginner-heating-water", "lab-intermediate-exothermic"];
    expect(LAB_CATALOG.every((experiment) => isExperimentUnlocked(experiment, completed))).toBe(true);
  });

  it("все четыре expansion-эксперимента используют те же level prerequisites", () => {
    const newIntermediateIds = ["lab-intermediate-carbonate-gas", "lab-intermediate-zinc-acid"];
    const newAdvancedIds = ["lab-advanced-metal-displacement", "lab-advanced-peroxide-decomposition"];

    for (const id of newIntermediateIds) {
      const experiment = getLabExperiment(id)!;
      expect(isExperimentUnlocked(experiment, [])).toBe(false);
      expect(isExperimentUnlocked(experiment, ["lab-beginner-state-changes"])).toBe(true);
    }
    for (const id of newAdvancedIds) {
      const experiment = getLabExperiment(id)!;
      expect(isExperimentUnlocked(experiment, ["lab-beginner-state-changes"])).toBe(false);
      expect(isExperimentUnlocked(experiment, ["lab-intermediate-gas-formation"])).toBe(true);
    }
  });
});

describe("chemistry-lab-catalog — реальные условия завершения (без выдуманной химии)", () => {
  it("Нагрев воды: завершается только при реальном закипании (100°C и aggregateState=gas)", () => {
    const exp = getLabExperiment("lab-beginner-heating-water")!;
    let c = createEmptyContainer("c1", "beaker", 20);
    c = addSubstance(c, "water", 200);
    expect(exp.isComplete(baseContext({ activeContainer: c }))).toBe(false);

    c = heat(c, 85); // 105°C
    expect(exp.isComplete(baseContext({ activeContainer: c }))).toBe(true);
  });

  it("Переливание: завершается только по реальной записи в pourLog, не по наличию массы", () => {
    const exp = getLabExperiment("lab-beginner-pouring")!;
    let c = createEmptyContainer("c1", "beaker", 20);
    c = addSubstance(c, "water", 100);
    // вода добавлена напрямую, но переливания не было — не должно засчитываться
    expect(exp.isComplete(baseContext({ activeContainer: c, pourLog: [] }))).toBe(false);
    expect(exp.isComplete(baseContext({ activeContainer: c, pourLog: [{ sourceId: "x", targetId: "c1", at: Date.now() }] }))).toBe(true);
  });

  it("Экзотермическая реакция: завершается только по реальной записи в reactionLog + isExothermic", () => {
    const exp = getLabExperiment("lab-intermediate-exothermic")!;
    let c = createEmptyContainer("c1", "beaker", 20);
    c = addSubstance(c, "hcl", 40);
    expect(exp.isComplete(baseContext({ activeContainer: c, occurredReactionIds: [] }))).toBe(false);

    c = addSubstance(c, "naoh", 40);
    const { container: reacted, occurredReactions } = applyReactions(c);
    const ids = occurredReactions.map((r) => r.id);
    expect(exp.isComplete(baseContext({ activeContainer: reacted, occurredReactionIds: ids }))).toBe(true);
  });

  it("Сравнение реакций: требует минимум 2 РАЗНЫХ реакции, одной недостаточно", () => {
    const exp = getLabExperiment("lab-intermediate-comparing-reactions")!;
    expect(exp.isComplete(baseContext({ allOccurredReactionIds: ["neutralization-hcl-naoh"] }))).toBe(false);
    expect(
      exp.isComplete(baseContext({ allOccurredReactionIds: ["neutralization-hcl-naoh", "precipitation-agno3-nacl"] }))
    ).toBe(true);
  });

  it("Давление в закрытом сосуде: требует isSealed=true И реального pressureRatio > 0.1", () => {
    const exp = getLabExperiment("lab-advanced-closed-pressure")!;
    let c = createEmptyContainer("c1", "beaker", 20);
    c = addSubstance(c, "water", 300);
    c = heat(c, 90);
    const profile = CONTAINER_PHYSICS.beaker;
    const sealedHazard = evaluateHazard({
      container: c,
      profile,
      isSealed: true,
      hasHeatSource: true,
      safetyWarnings: [],
      reactionLog: [],
      previousIntegrity: createDefaultIntegrity(profile),
      previousPressureKPa: AMBIENT_PRESSURE_KPA,
      previousTemperatureC: 20,
      dtSeconds: 1,
    });

    expect(exp.isComplete(baseContext({ activeContainer: c, isSealed: false, hazard: sealedHazard }))).toBe(false); // не запечатан
    expect(exp.isComplete(baseContext({ activeContainer: c, isSealed: true, hazard: sealedHazard }))).toBe(true);
  });

  it("Предотвращение опасности: требует, чтобы давление РЕАЛЬНО поднималось, но сосуд сейчас открыт и целостность normal", () => {
    const exp = getLabExperiment("lab-advanced-hazard-prevention")!;
    const ctx = baseContext({ maxPressureRatioObserved: 0.2, isSealed: false });
    expect(ctx.hazard.containerIntegrity.level).toBe("normal");
    expect(exp.isComplete(ctx)).toBe(true);
    expect(exp.isComplete(baseContext({ maxPressureRatioObserved: 0.05, isSealed: false }))).toBe(false); // давление не поднималось
    expect(exp.isComplete(baseContext({ maxPressureRatioObserved: 0.2, isSealed: true }))).toBe(false); // все еще запечатан
  });
});
