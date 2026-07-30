// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { ReactNode } from "react";
import { ChemistryWorkspaceProvider, useChemistryWorkspace } from "./ChemistryWorkspaceProvider";
import { checkSafety } from "../../lib/chemistry-safety";
import { buildChemistryAIContext } from "../../lib/chemistry-context-builder";
import { EXPERIMENTS, ExperimentStatus } from "../../lib/experiment-validator";

/**
 * Интеграционные тесты Hazard Simulation System (Stage 5.5 v2) — проверяют
 * реальные сценарии (безопасная реакция / открытый и закрытый сосуд /
 * повреждение / разрыв останавливает эксперимент / AI-контекст / reset)
 * через настоящий ChemistryWorkspaceProvider. Никаких моков Chemistry
 * Engine, Reaction Engine или Hazard Engine — все вызовы идут через тот же
 * reducer, что использует ChemistryWorldScene.
 */

function wrapper({ children }: { children: ReactNode }) {
  return <ChemistryWorkspaceProvider>{children}</ChemistryWorkspaceProvider>;
}

function tickManyTimes(hazardTick: (dt: number) => void, times: number, dt = 1) {
  for (let i = 0; i < times; i++) act(() => hazardTick(dt));
}

describe("Hazard — безопасные сценарии не создают аварию", () => {
  it("растворение соли в воде (безопасная реакция) не поднимает уровень опасности", () => {
    const { result } = renderHook(() => useChemistryWorkspace(), { wrapper });

    act(() => result.current.addSubstanceToContainer("beaker-1", "water", 200));
    act(() => result.current.addSubstanceToContainer("beaker-1", "nacl", 20));
    tickManyTimes(result.current.hazardTick, 3);

    const beaker = result.current.state.containers.find((c) => c.id === "beaker-1")!;
    expect(beaker.hazard.level).toBe("none");
    expect(beaker.hazard.shouldStopExperiment).toBe(false);
    expect(result.current.state.emergencyStop).toBeNull();
  });
});

describe("Hazard — открытый и закрытый сосуд", () => {
  it("газ из открытого сосуда рассеивается — давление не растет даже при устойчивом кипении", () => {
    const { result } = renderHook(() => useChemistryWorkspace(), { wrapper });
    const stand = result.current.state.tools.find((t) => t.kind === "stand")!;

    act(() => result.current.addSubstanceToContainer("beaker-1", "water", 300));
    act(() => result.current.moveItem("beaker-1", stand.position));
    act(() => result.current.toggleBurner("burner-1"));
    for (let i = 0; i < 10; i++) act(() => result.current.heatTick(9)); // до кипения
    tickManyTimes(result.current.hazardTick, 10);

    const beaker = result.current.state.containers.find((c) => c.id === "beaker-1")!;
    expect(beaker.isSealed).toBe(false);
    expect(beaker.hazard.pressureRatio).toBeLessThan(0.1);
    expect(beaker.hazard.level).not.toBe("pressure_buildup");
  });

  it("тот же кипяток в закрытом сосуде реально увеличивает давление", () => {
    const { result } = renderHook(() => useChemistryWorkspace(), { wrapper });
    const stand = result.current.state.tools.find((t) => t.kind === "stand")!;

    act(() => result.current.addSubstanceToContainer("beaker-1", "water", 300));
    act(() => result.current.moveItem("beaker-1", stand.position));
    act(() => result.current.toggleSeal("beaker-1"));
    act(() => result.current.toggleBurner("burner-1"));
    for (let i = 0; i < 10; i++) act(() => result.current.heatTick(9));
    tickManyTimes(result.current.hazardTick, 5);

    const beaker = result.current.state.containers.find((c) => c.id === "beaker-1")!;
    expect(beaker.isSealed).toBe(true);
    expect(beaker.hazard.pressureRatio).toBeGreaterThan(0);
    expect(beaker.hazard.gaugePressureKPa).toBeGreaterThan(0);
  });
});

describe("Hazard — повреждение и остановка эксперимента", () => {
  it("устойчивое избыточное давление в маленьком закрытом сосуде реально повреждает и останавливает эксперимент", () => {
    const { result } = renderHook(() => useChemistryWorkspace(), { wrapper });
    const stand = result.current.state.tools.find((t) => t.kind === "stand")!;

    act(() => result.current.addSubstanceToContainer("test-tube-1", "water", 40));
    act(() => result.current.moveItem("test-tube-1", stand.position));
    act(() => result.current.toggleSeal("test-tube-1"));
    act(() => result.current.toggleBurner("burner-1"));

    let iterations = 0;
    while (!result.current.state.emergencyStop && iterations < 400) {
      act(() => result.current.heatTick(2));
      act(() => result.current.hazardTick(1));
      iterations += 1;
    }

    expect(result.current.state.emergencyStop).not.toBeNull();
    expect(result.current.state.emergencyStop?.containerId).toBe("test-tube-1");
    expect(["container_rupture", "explosion"]).toContain(result.current.state.emergencyStop!.level);

    // после аварии горелка принудительно выключена
    expect(result.current.state.tools.find((t) => t.id === "burner-1")!.isOn).toBe(false);

    // и новые лабораторные действия реально заблокированы
    const massBefore = result.current.state.containers.find((c) => c.id === "beaker-1")!.data.contents.length;
    act(() => result.current.addSubstanceToContainer("beaker-1", "water", 100));
    const massAfter = result.current.state.containers.find((c) => c.id === "beaker-1")!.data.contents.length;
    expect(massAfter).toBe(massBefore);
  });
});

describe("Hazard — AI-контекст получает только детерминированные причины", () => {
  it("buildChemistryAIContext с реальным hazard содержит причины и уровень, посчитанные Hazard Engine, а не выдуманные", () => {
    const { result } = renderHook(() => useChemistryWorkspace(), { wrapper });
    const stand = result.current.state.tools.find((t) => t.kind === "stand")!;

    act(() => result.current.addSubstanceToContainer("beaker-1", "water", 300));
    act(() => result.current.moveItem("beaker-1", stand.position));
    act(() => result.current.toggleSeal("beaker-1"));
    act(() => result.current.toggleBurner("burner-1"));
    for (let i = 0; i < 10; i++) act(() => result.current.heatTick(9));
    tickManyTimes(result.current.hazardTick, 5);

    const beaker = result.current.state.containers.find((c) => c.id === "beaker-1")!;
    const experiment = EXPERIMENTS[0];
    const ctx = buildChemistryAIContext({
      experiment,
      experimentStatus: ExperimentStatus.IN_PROGRESS,
      container: beaker.data,
      occurredReactionIds: [],
      validation: { completed: false, errors: [], warnings: [], measurements: {} },
      safetyWarnings: checkSafety({ container: beaker.data }),
      hazard: beaker.hazard,
      accidentLog: result.current.state.accidentLog,
    });

    expect(ctx.hazard).not.toBeNull();
    expect(ctx.hazard?.level).toBe(beaker.hazard.level);
    expect(ctx.hazard?.isSealed).toBe(true);
    expect(ctx.hazard?.pressureRatio).toBeCloseTo(beaker.hazard.pressureRatio, 5);
    // причины пришли ровно из HazardResult.causes, AI ничего не придумывает
    expect(ctx.hazard?.causes.map((c) => c.code)).toEqual(beaker.hazard.causes.map((c) => c.code));
  });
});

describe("Hazard — UI не вызывает Reaction Engine повторно ради эффектов", () => {
  it("многократные вызовы hazardTick не создают новых записей в reactionLog", () => {
    const { result } = renderHook(() => useChemistryWorkspace(), { wrapper });

    act(() => result.current.addSubstanceToContainer("beaker-1", "hcl", 40));
    act(() => result.current.addSubstanceToContainer("beaker-1", "naoh", 40));

    const countAfterReaction = result.current.state.reactionLog.length;
    expect(countAfterReaction).toBeGreaterThan(0);

    tickManyTimes(result.current.hazardTick, 20, 0.4);

    expect(result.current.state.reactionLog.length).toBe(countAfterReaction);
  });
});

describe("Hazard — Debug отображает реальные значения (без WebGL — проверяем сами данные, которые читает оверлей)", () => {
  it("поля hazard, которые показывает Hazard Debug Mode, реально посчитаны, а не нулевые заглушки", () => {
    const { result } = renderHook(() => useChemistryWorkspace(), { wrapper });
    const stand = result.current.state.tools.find((t) => t.kind === "stand")!;

    act(() => result.current.addSubstanceToContainer("beaker-1", "water", 300));
    act(() => result.current.moveItem("beaker-1", stand.position));
    act(() => result.current.toggleSeal("beaker-1"));
    act(() => result.current.toggleBurner("burner-1"));
    for (let i = 0; i < 10; i++) act(() => result.current.heatTick(9));
    tickManyTimes(result.current.hazardTick, 5);

    const beaker = result.current.state.containers.find((c) => c.id === "beaker-1")!;
    expect(beaker.hazard.temperatureC).toBeGreaterThan(100);
    expect(beaker.hazard.pressureKPa).toBeGreaterThan(101.325);
    expect(beaker.hazard.gasAmountG).toBeGreaterThan(0);
    expect(beaker.hazard.freeVolumeMl).toBeGreaterThan(0);
    expect(beaker.hazard.temperatureRatio).toBeGreaterThan(0);
    expect(beaker.hazard.containerIntegrity.level).toBeDefined();
  });
});

describe("Hazard — reset полностью очищает аварию", () => {
  it("resetExperiment возвращает лабораторию в чистое безопасное состояние после аварии", () => {
    const { result } = renderHook(() => useChemistryWorkspace(), { wrapper });
    const stand = result.current.state.tools.find((t) => t.kind === "stand")!;

    act(() => result.current.addSubstanceToContainer("test-tube-1", "water", 40));
    act(() => result.current.moveItem("test-tube-1", stand.position));
    act(() => result.current.toggleSeal("test-tube-1"));
    act(() => result.current.toggleBurner("burner-1"));

    let iterations = 0;
    while (!result.current.state.emergencyStop && iterations < 400) {
      act(() => result.current.heatTick(2));
      act(() => result.current.hazardTick(1));
      iterations += 1;
    }
    expect(result.current.state.emergencyStop).not.toBeNull();

    act(() => result.current.resetExperiment());

    expect(result.current.state.emergencyStop).toBeNull();
    expect(result.current.state.accidentLog).toHaveLength(0);
    const freshTestTube = result.current.state.containers.find((c) => c.id === "test-tube-1")!;
    expect(freshTestTube.data.contents).toHaveLength(0);
    expect(freshTestTube.integrity.level).toBe("normal");
    expect(freshTestTube.isSealed).toBe(false);

    // и новый эксперимент реально можно начать — действия снова проходят
    act(() => result.current.addSubstanceToContainer("beaker-1", "water", 50));
    const beaker = result.current.state.containers.find((c) => c.id === "beaker-1")!;
    expect(beaker.data.contents.length).toBeGreaterThan(0);
  });
});
