// @vitest-environment jsdom
import { describe, expect, it, afterEach, beforeEach } from "vitest";
import { cleanup, renderHook, act } from "@testing-library/react";
import type { ReactNode } from "react";
import { addSubstance, createEmptyContainer, heat, type Container } from "../../lib/chemistry-engine";
import { CONTAINER_PHYSICS, createDefaultIntegrity } from "../../lib/container-physics";
import { AMBIENT_PRESSURE_KPA } from "../../lib/pressure-engine";
import { evaluateHazard, type HazardResult } from "../../lib/hazard-engine";
import type { LabStepContext } from "../../lib/chemistry-lab-catalog";
import { ChemistryLabExperienceProvider, useChemistryLabExperience } from "./ChemistryLabExperienceProvider";

afterEach(cleanup);

beforeEach(() => {
  window.localStorage.clear();
});

function makeHazard(container: Container, isSealed: boolean): HazardResult {
  const profile = CONTAINER_PHYSICS.beaker;
  return evaluateHazard({
    container,
    profile,
    isSealed,
    hasHeatSource: true,
    safetyWarnings: [],
    reactionLog: [],
    previousIntegrity: createDefaultIntegrity(profile),
    previousPressureKPa: AMBIENT_PRESSURE_KPA,
    previousTemperatureC: 20,
    dtSeconds: 1,
  });
}

function makeContext(overrides: Partial<LabStepContext> = {}): LabStepContext {
  const container = overrides.activeContainer ?? createEmptyContainer("beaker-1", "beaker", 20);
  return {
    activeContainerId: "beaker-1",
    activeContainer: container,
    isSealed: false,
    isOnStand: false,
    burnerOn: false,
    hazard: overrides.hazard ?? makeHazard(container, false),
    occurredReactionIds: [],
    allOccurredReactionIds: [],
    safetyWarnings: [],
    allContainers: [{ id: "beaker-1", data: container }],
    pourLog: [],
    maxTemperatureCObserved: container.temperatureC,
    maxPressureRatioObserved: 0,
    ...overrides,
  };
}

function wrapperFor(stepContext: LabStepContext) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <ChemistryLabExperienceProvider simulationId="sim-1" stepContext={stepContext}>
        {children}
      </ChemistryLabExperienceProvider>
    );
  };
}

describe("ChemistryLabExperienceProvider — режимы обучения", () => {
  it("по умолчанию режим guided, переключение реально меняет modeConfig", () => {
    const { result } = renderHook(() => useChemistryLabExperience(), { wrapper: wrapperFor(makeContext()) });
    expect(result.current.mode).toBe("guided");
    expect(result.current.modeConfig.showStepHighlighting).toBe(true);

    act(() => result.current.setMode("exam"));
    expect(result.current.mode).toBe("exam");
    expect(result.current.modeConfig.showStepHighlighting).toBe(false);
    expect(result.current.modeConfig.showFullHints).toBe(false);
  });
});

describe("ChemistryLabExperienceProvider — Guided Mode: шаги не продвигаются кнопкой без реального состояния", () => {
  it("advanceStep не двигается дальше, пока реальное условие шага (isOnStand) не выполнено", () => {
    const ctx = makeContext();
    const { result } = renderHook(() => useChemistryLabExperience(), { wrapper: wrapperFor(ctx) });

    act(() => result.current.selectExperiment("lab-beginner-heating-water"));
    expect(result.current.currentStepIndex).toBe(0);

    // шаг 0 (goal) всегда разблокирован — можно пройти
    act(() => result.current.advanceStep());
    expect(result.current.currentStepIndex).toBe(1);
    act(() => result.current.advanceStep()); // safety briefing
    expect(result.current.currentStepIndex).toBe(2);

    // шаг "prepare" требует isOnStand=true — сейчас false, advanceStep не должен продвинуть
    expect(result.current.isCurrentStepUnlocked).toBe(false);
    act(() => result.current.advanceStep());
    expect(result.current.currentStepIndex).toBe(2); // не продвинулось
  });

  it("полный сценарий: шаги продвигаются строго по реальным изменениям состояния до завершения", () => {
    let container: Container = createEmptyContainer("beaker-1", "beaker", 20);
    const box = { current: makeContext({ activeContainer: container }) };

    function Wrapper({ children }: { children: ReactNode }) {
      return (
        <ChemistryLabExperienceProvider simulationId="sim-1" stepContext={box.current}>
          {children}
        </ChemistryLabExperienceProvider>
      );
    }

    const { result, rerender } = renderHook(() => useChemistryLabExperience(), { wrapper: Wrapper });

    act(() => result.current.selectExperiment("lab-beginner-heating-water"));

    // goal -> safety
    act(() => result.current.advanceStep());
    // safety -> prepare
    act(() => result.current.advanceStep());
    expect(result.current.currentStep?.id).toBe("prepare");

    // поставили на штатив
    box.current = makeContext({ activeContainer: container, isOnStand: true });
    rerender();
    expect(result.current.isCurrentStepUnlocked).toBe(true);
    act(() => result.current.advanceStep()); // prepare -> add-water
    expect(result.current.currentStep?.id).toBe("add-water");

    // налили воду
    container = addSubstance(container, "water", 200);
    box.current = makeContext({ activeContainer: container, isOnStand: true });
    rerender();
    expect(result.current.isCurrentStepUnlocked).toBe(true);
    act(() => result.current.advanceStep()); // add-water -> heat
    expect(result.current.currentStep?.id).toBe("heat");

    // включили горелку
    box.current = makeContext({ activeContainer: container, isOnStand: true, burnerOn: true });
    rerender();
    act(() => result.current.advanceStep()); // heat -> observe
    expect(result.current.currentStep?.id).toBe("observe");

    // довели до кипения
    container = heat(container, 85); // 105°C
    box.current = makeContext({ activeContainer: container, isOnStand: true, burnerOn: true });
    rerender();
    expect(result.current.isCurrentStepUnlocked).toBe(true);
    act(() => result.current.advanceStep()); // observe -> explain
    act(() => result.current.advanceStep()); // explain -> finish
    expect(result.current.currentStep?.kind).toBe("finish");

    act(() => result.current.setConclusionDraft("Вода закипела при 100 градусах, как и ожидалось."));
    act(() => result.current.completeExperiment());

    expect(result.current.selectedExperiment).toBeNull();
    expect(result.current.notebookEntries).toHaveLength(1);
    expect(result.current.lastAssessment).not.toBeNull();
    expect(result.current.completedExperimentIds).toContain("lab-beginner-heating-water");
  });
});

describe("ChemistryLabExperienceProvider — completeExperiment отклоняет незавершенный эксперимент", () => {
  it("не создает запись в журнале, если реальное условие isComplete не выполнено", () => {
    const ctx = makeContext(); // холодный пустой сосуд — заведомо не кипит
    const { result } = renderHook(() => useChemistryLabExperience(), { wrapper: wrapperFor(ctx) });

    act(() => result.current.selectExperiment("lab-beginner-heating-water"));
    act(() => result.current.completeExperiment());

    expect(result.current.notebookEntries).toHaveLength(0);
    expect(result.current.selectedExperiment?.id).toBe("lab-beginner-heating-water"); // остались в эксперименте
  });
});

describe("ChemistryLabExperienceProvider — Лабораторный журнал персистентен (localStorage)", () => {
  it("сохраняет запись в localStorage, доступную после нового монтирования провайдера", () => {
    let container: Container = createEmptyContainer("beaker-1", "beaker", 20);
    container = addSubstance(container, "water", 200);
    container = heat(container, 85);
    const ctx = makeContext({ activeContainer: container, isOnStand: true, burnerOn: true });

    const { result } = renderHook(() => useChemistryLabExperience(), { wrapper: wrapperFor(ctx) });
    act(() => result.current.selectExperiment("lab-beginner-heating-water"));
    act(() => result.current.completeExperiment());
    expect(result.current.notebookEntries).toHaveLength(1);

    cleanup();

    const { result: result2 } = renderHook(() => useChemistryLabExperience(), { wrapper: wrapperFor(makeContext()) });
    expect(result2.current.notebookEntries).toHaveLength(1);
    expect(result2.current.notebookEntries[0].experimentId).toBe("lab-beginner-heating-water");
  });
});

describe("ChemistryLabExperienceProvider — разблокировка сложности через реальный прогресс", () => {
  it("intermediate недоступен, пока не пройден ни один beginner-эксперимент, и открывается после", () => {
    let container: Container = createEmptyContainer("beaker-1", "beaker", 20);
    const ctxEmpty = makeContext({ activeContainer: container });
    const { result } = renderHook(() => useChemistryLabExperience(), { wrapper: wrapperFor(ctxEmpty) });

    const intermediateExp = result.current.catalog.find((e) => e.id === "lab-intermediate-exothermic")!;
    expect(result.current.isExperimentUnlockedFor(intermediateExp)).toBe(false);

    container = addSubstance(container, "water", 200);
    container = heat(container, 85);
    const ctxHot = makeContext({ activeContainer: container, isOnStand: true, burnerOn: true });

    const { result: result2 } = renderHook(() => useChemistryLabExperience(), { wrapper: wrapperFor(ctxHot) });
    act(() => result2.current.selectExperiment("lab-beginner-heating-water"));
    act(() => result2.current.completeExperiment());

    const { result: result3 } = renderHook(() => useChemistryLabExperience(), { wrapper: wrapperFor(makeContext()) });
    expect(result3.current.isExperimentUnlockedFor(intermediateExp)).toBe(true);
  });
});
