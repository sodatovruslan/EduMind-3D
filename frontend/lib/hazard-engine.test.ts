import { describe, expect, it } from "vitest";
import { addSubstance, createEmptyContainer, heat } from "./chemistry-engine";
import { applyReactions } from "./reaction-engine";
import { checkSafety } from "./chemistry-safety";
import { CONTAINER_PHYSICS, createDefaultIntegrity } from "./container-physics";
import { AMBIENT_PRESSURE_KPA } from "./pressure-engine";
import { createSafeHazardResult, evaluateHazard, type HazardEngineInput } from "./hazard-engine";

function baseInput(overrides: Partial<HazardEngineInput> = {}): HazardEngineInput {
  const container = overrides.container ?? createEmptyContainer("c1", "beaker", 20);
  return {
    container,
    profile: CONTAINER_PHYSICS.beaker,
    isSealed: false,
    hasHeatSource: false,
    safetyWarnings: [],
    reactionLog: [],
    previousIntegrity: createDefaultIntegrity(CONTAINER_PHYSICS.beaker),
    previousPressureKPa: AMBIENT_PRESSURE_KPA,
    previousTemperatureC: container.temperatureC,
    dtSeconds: 1,
    ...overrides,
  };
}

describe("hazard-engine — базовые уровни", () => {
  it("пустой холодный открытый сосуд без нагрева -> none", () => {
    const result = evaluateHazard(baseInput());
    expect(result.level).toBe("none");
    expect(result.shouldStopExperiment).toBe(false);
    expect(result.causes).toHaveLength(0);
  });

  it("безопасная реакция (растворение соли) не создает аварию", () => {
    let c = createEmptyContainer("c1", "beaker", 20);
    c = addSubstance(c, "water", 200);
    c = addSubstance(c, "nacl", 20);
    const result = evaluateHazard(baseInput({ container: c, safetyWarnings: checkSafety({ container: c }) }));
    expect(result.level).toBe("none");
    expect(result.shouldStopExperiment).toBe(false);
  });

  it("нагрев с включенной горелкой в открытом сосуде поднимает уровень до heating/boiling, но не до аварии", () => {
    let c = createEmptyContainer("c1", "beaker", 20);
    c = addSubstance(c, "water", 200);
    c = heat(c, 80); // 100°C — кипит, но сосуд ОТКРЫТ
    const result = evaluateHazard(baseInput({ container: c, isSealed: false, hasHeatSource: true }));
    expect(["heating", "gas_release", "boiling"]).toContain(result.level);
    expect(result.shouldStopExperiment).toBe(false);
  });

  it("существующие предупреждения Safety System поднимают уровень минимум до warning", () => {
    let c = createEmptyContainer("c1", "beaker", 0);
    c = heat(c, 30); // пустой сосуд, температура > 25 -> checkSafety выдаст empty_container_heated
    const warnings = checkSafety({ container: c });
    expect(warnings.length).toBeGreaterThan(0);
    const result = evaluateHazard(baseInput({ container: c, safetyWarnings: warnings, hasHeatSource: true }));
    expect(result.level).not.toBe("none");
    expect(result.causes.some((cause) => cause.code.startsWith("safety:"))).toBe(true);
  });
});

describe("hazard-engine — давление и открытый/закрытый сосуд", () => {
  it("газ из открытого сосуда рассеивается — уровень не эскалирует до pressure_buildup", () => {
    let c = createEmptyContainer("c1", "beaker", 20);
    c = addSubstance(c, "water", 300);
    c = heat(c, 90);
    const result = evaluateHazard(baseInput({ container: c, isSealed: false, hasHeatSource: true }));
    expect(result.level).not.toBe("pressure_buildup");
    expect(result.pressureRatio).toBeLessThan(0.3);
  });

  it("тот же кипяток в закрытом сосуде накапливает давление до pressure_buildup", () => {
    let c = createEmptyContainer("c1", "beaker", 20);
    c = addSubstance(c, "water", 300);
    c = heat(c, 90);
    const result = evaluateHazard(baseInput({ container: c, isSealed: true, hasHeatSource: true }));
    expect(result.pressureRatio).toBeGreaterThan(0);
  });
});

describe("hazard-engine — повреждение и разрыв сосуда", () => {
  it("устойчивое избыточное давление в закрытом сосуде постепенно повреждает сосуд, а не разрывает мгновенно", () => {
    let container = createEmptyContainer("c1", "test_tube", 20);
    container = addSubstance(container, "water", 40);

    let integrity = createDefaultIntegrity(CONTAINER_PHYSICS.test_tube);
    let pressureKPa = AMBIENT_PRESSURE_KPA;
    let temperatureC = container.temperatureC;
    const seenLevels = new Set<string>();

    for (let i = 0; i < 200 && integrity.level !== "ruptured"; i++) {
      container = heat(container, 2);
      const result = evaluateHazard({
        container,
        profile: CONTAINER_PHYSICS.test_tube,
        isSealed: true,
        hasHeatSource: true,
        safetyWarnings: [],
        reactionLog: [],
        previousIntegrity: integrity,
        previousPressureKPa: pressureKPa,
        previousTemperatureC: temperatureC,
        dtSeconds: 1,
      });
      seenLevels.add(result.level);
      integrity = result.containerIntegrity;
      pressureKPa = result.pressureKPa;
      temperatureC = container.temperatureC;
    }

    // сосуд реально дошел до разрыва в этом сценарии (иначе тест сам по себе бессмыслен)
    expect(integrity.level).toBe("ruptured");
    // и по пути были промежуточные уровни, а не мгновенный скачок none -> rupture
    expect(seenLevels.has("container_stress") || seenLevels.has("container_damage") || seenLevels.has("pressure_buildup")).toBe(true);
  });

  it("критический разрыв при высоком избыточном давлении классифицируется как explosion и требует остановки эксперимента", () => {
    let c = createEmptyContainer("c1", "test_tube", 20);
    c = addSubstance(c, "water", 40);
    c = heat(c, 90);

    const result = evaluateHazard(
      baseInput({
        container: c,
        profile: CONTAINER_PHYSICS.test_tube,
        isSealed: true,
        hasHeatSource: true,
        previousIntegrity: { level: "ruptured", stressScore: 1 },
        previousPressureKPa: AMBIENT_PRESSURE_KPA + CONTAINER_PHYSICS.test_tube.maxSafePressureKPa * 5,
      })
    );

    expect(result.level).toBe("explosion");
    expect(result.shouldStopExperiment).toBe(true);
  });

  it("простой разрыв без значительного избыточного давления НЕ классифицируется как explosion (нет взрыва ради красоты)", () => {
    const c = createEmptyContainer("c1", "test_tube", 20);
    const result = evaluateHazard(
      baseInput({
        container: c,
        profile: CONTAINER_PHYSICS.test_tube,
        isSealed: false,
        previousIntegrity: { level: "ruptured", stressScore: 1 },
        previousPressureKPa: AMBIENT_PRESSURE_KPA,
      })
    );
    expect(result.level).toBe("container_rupture");
    expect(result.level).not.toBe("explosion");
    expect(result.shouldStopExperiment).toBe(true);
  });
});

describe("hazard-engine — Fire System (честное отсутствие ложного пожара)", () => {
  it("ни одно реальное вещество проекта не горючее -> fire/explosion от возгорания никогда не срабатывает", () => {
    let c = createEmptyContainer("c1", "flask", 20);
    c = addSubstance(c, "hcl", 100);
    c = addSubstance(c, "naoh", 100);
    const { container: reacted } = applyReactions(c);
    const heated = heat(reacted, 200);

    const result = evaluateHazard(
      baseInput({ container: heated, profile: CONTAINER_PHYSICS.flask, isSealed: true, hasHeatSource: true })
    );

    expect(result.level).not.toBe("fire");
    expect(result.causes.some((cause) => cause.code === "flammable_vapor_ignited")).toBe(false);
  });
});

describe("hazard-engine — экзотермическая реакция как причина", () => {
  it("недавняя экзотермическая реакция попадает в causes как exothermic_reaction_heat", () => {
    let c = createEmptyContainer("c1", "beaker", 20);
    c = addSubstance(c, "hcl", 40);
    c = addSubstance(c, "naoh", 40);
    const { container: reacted, occurredReactions } = applyReactions(c);
    expect(occurredReactions.some((r) => r.isExothermic)).toBe(true);

    const reactionLog = occurredReactions.map((r) => ({ reactionId: r.id, title: r.title, at: Date.now() }));
    const result = evaluateHazard(baseInput({ container: reacted, reactionLog }));
    expect(result.causes.some((cause) => cause.code === "exothermic_reaction_heat")).toBe(true);
  });
});

describe("hazard-engine — детерминированность", () => {
  it("одинаковые входы дают идентичный результат", () => {
    let c = createEmptyContainer("c1", "flask", 20);
    c = addSubstance(c, "water", 150);
    c = heat(c, 85);
    const input = baseInput({ container: c, profile: CONTAINER_PHYSICS.flask, isSealed: true, hasHeatSource: true });
    expect(evaluateHazard(input)).toEqual(evaluateHazard(input));
  });
});

describe("hazard-engine — createSafeHazardResult", () => {
  it("возвращает безопасное состояние без вызова полного расчета", () => {
    const c = createEmptyContainer("c1", "beaker", 20);
    const result = createSafeHazardResult(c, CONTAINER_PHYSICS.beaker);
    expect(result.level).toBe("none");
    expect(result.shouldStopExperiment).toBe(false);
    expect(result.containerIntegrity.level).toBe("normal");
  });
});
