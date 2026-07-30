// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, renderHook, act, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import {
  ChemistryWorkspaceProvider,
  useChemistryWorkspace,
  isContainerOnStand,
} from "./ChemistryWorkspaceProvider";
import { ChemistryDragProvider, useChemistryDrag } from "./ChemistryDragProvider";
import { aggregateStateOf, totalMassG } from "../../lib/chemistry-engine";
import { checkSafety } from "../../lib/chemistry-safety";

/**
 * Интеграционные тесты Stage 5.5 — проверяют реальные сценарии
 * взаимодействия (drag / drop-пролив / нагрев / реакция / safety) через
 * настоящий ChemistryWorkspaceProvider + ChemistryDragProvider. Никаких
 * моков Chemistry Engine / Reaction Engine / Experiment Validator — все
 * вызовы идут через тот же reducer, что использует ChemistryWorldScene.
 */

afterEach(cleanup);

function workspaceWrapper({ children }: { children: ReactNode }) {
  return <ChemistryWorkspaceProvider>{children}</ChemistryWorkspaceProvider>;
}

describe("Drag (ChemistryDragProvider)", () => {
  it("отслеживает захват и отпускание предмета", () => {
    const { result } = renderHook(() => useChemistryDrag(), {
      wrapper: ({ children }) => <ChemistryDragProvider>{children}</ChemistryDragProvider>,
    });

    expect(result.current.draggingId).toBeNull();

    act(() => result.current.startDrag("stock-nacl"));
    expect(result.current.draggingId).toBe("stock-nacl");

    act(() => result.current.stopDrag());
    expect(result.current.draggingId).toBeNull();
  });

  it("сбрасывает драг по глобальному pointerup вне канваса (защита от зависшего состояния)", () => {
    const { result } = renderHook(() => useChemistryDrag(), {
      wrapper: ({ children }) => <ChemistryDragProvider>{children}</ChemistryDragProvider>,
    });

    act(() => result.current.startDrag("beaker-1"));
    expect(result.current.draggingId).toBe("beaker-1");

    act(() => {
      window.dispatchEvent(new PointerEvent("pointerup"));
    });
    expect(result.current.draggingId).toBeNull();
  });

  it("сбрасывает драг по Escape", () => {
    const { result } = renderHook(() => useChemistryDrag(), {
      wrapper: ({ children }) => <ChemistryDragProvider>{children}</ChemistryDragProvider>,
    });

    act(() => result.current.startDrag("flask-1"));
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(result.current.draggingId).toBeNull();
  });
});

describe("Drop / добавление вещества (реальный Chemistry Engine)", () => {
  it("растворяет соль в воде реальным addSubstance — масса и объем растут по фактическому расчету", () => {
    const { result } = renderHook(() => useChemistryWorkspace(), { wrapper: workspaceWrapper });

    act(() => result.current.addSubstanceToContainer("beaker-1", "water", 200));
    act(() => result.current.addSubstanceToContainer("beaker-1", "nacl", 20));

    const beaker = result.current.state.containers.find((c) => c.id === "beaker-1")!;
    expect(totalMassG(beaker.data)).toBeCloseTo(220, 5);
    // 20г NaCl полностью растворяется в 200г воды (порог растворимости
    // NaCl намного выше) — осадка быть не должно
    expect(beaker.data.precipitate.length).toBe(0);
  });

  it("реально ограничивает растворение по порогу солей — избыток уходит в precipitate", () => {
    const { result } = renderHook(() => useChemistryWorkspace(), { wrapper: workspaceWrapper });

    // немного воды и много соли — часть обязана остаться нерастворенной
    act(() => result.current.addSubstanceToContainer("beaker-1", "water", 10));
    act(() => result.current.addSubstanceToContainer("beaker-1", "nacl", 100));

    const beaker = result.current.state.containers.find((c) => c.id === "beaker-1")!;
    expect(beaker.data.precipitate.length).toBeGreaterThan(0);
  });
});

describe("Pour (реальный pour + сохранение массы)", () => {
  it("переливает содержимое между сосудами с сохранением массы", () => {
    const { result } = renderHook(() => useChemistryWorkspace(), { wrapper: workspaceWrapper });

    act(() => result.current.addSubstanceToContainer("test-tube-1", "water", 50));
    const sourceBefore = result.current.state.containers.find((c) => c.id === "test-tube-1")!;
    const massBefore = totalMassG(sourceBefore.data);

    act(() => result.current.pourInto("test-tube-1", "beaker-1"));

    const source = result.current.state.containers.find((c) => c.id === "test-tube-1")!;
    const target = result.current.state.containers.find((c) => c.id === "beaker-1")!;

    expect(totalMassG(source.data)).toBeCloseTo(0, 5);
    expect(totalMassG(target.data)).toBeCloseTo(massBefore, 5);
  });
});

describe("Heating (реальный heatTick + isContainerOnStand)", () => {
  it("нагревает только сосуд, реально стоящий на штативе, и только если горелка включена", () => {
    const { result } = renderHook(() => useChemistryWorkspace(), { wrapper: workspaceWrapper });

    const stand = result.current.state.tools.find((t) => t.kind === "stand")!;
    const beakerBefore = result.current.state.containers.find((c) => c.id === "beaker-1")!;
    expect(isContainerOnStand(beakerBefore, result.current.state.tools)).toBe(false);

    // без горелки и не на штативе — heatTick не должен ничего греть
    act(() => result.current.heatTick(50));
    expect(result.current.state.containers.find((c) => c.id === "beaker-1")!.data.temperatureC).toBe(20);

    act(() => result.current.moveItem("beaker-1", stand.position));
    act(() => result.current.toggleBurner("burner-1"));

    const beakerOnStand = result.current.state.containers.find((c) => c.id === "beaker-1")!;
    expect(isContainerOnStand(beakerOnStand, result.current.state.tools)).toBe(true);

    act(() => result.current.heatTick(30));
    const heated = result.current.state.containers.find((c) => c.id === "beaker-1")!;
    expect(heated.data.temperatureC).toBeCloseTo(50, 5);
  });

  it("доводит воду до кипения реальным расчетом aggregateStateOf", () => {
    const { result } = renderHook(() => useChemistryWorkspace(), { wrapper: workspaceWrapper });
    const stand = result.current.state.tools.find((t) => t.kind === "stand")!;

    act(() => result.current.addSubstanceToContainer("beaker-1", "water", 100));
    act(() => result.current.moveItem("beaker-1", stand.position));
    act(() => result.current.toggleBurner("burner-1"));
    act(() => result.current.heatTick(90)); // 20°C -> 110°C, выше точки кипения воды

    const beaker = result.current.state.containers.find((c) => c.id === "beaker-1")!;
    expect(aggregateStateOf(beaker.data)).toBe("gas");
  });
});

describe("Reaction (реальный Reaction Engine через reducer)", () => {
  it("нейтрализация HCl + NaOH реально срабатывает и попадает в reactionLog", () => {
    const { result } = renderHook(() => useChemistryWorkspace(), { wrapper: workspaceWrapper });

    act(() => result.current.addSubstanceToContainer("beaker-1", "hcl", 50));
    act(() => result.current.addSubstanceToContainer("beaker-1", "naoh", 50));

    const beaker = result.current.state.containers.find((c) => c.id === "beaker-1")!;
    const loggedForBeaker = result.current.state.reactionLog.filter((e) => e.containerId === "beaker-1");

    expect(loggedForBeaker.some((e) => e.reactionId === "neutralization-hcl-naoh")).toBe(true);
    // после нейтрализации в сосуде должна появиться реально произведенная соль
    expect(beaker.data.contents.some((a) => a.substanceId === "nacl")).toBe(true);
  });
});

describe("Safety (реальный Safety System против реального состояния сосуда)", () => {
  it("checkSafety реагирует на нагрев пустого сосуда", () => {
    const { result } = renderHook(() => useChemistryWorkspace(), { wrapper: workspaceWrapper });
    const stand = result.current.state.tools.find((t) => t.kind === "stand")!;

    act(() => result.current.moveItem("beaker-1", stand.position));
    act(() => result.current.toggleBurner("burner-1"));
    act(() => result.current.heatTick(10));

    const beaker = result.current.state.containers.find((c) => c.id === "beaker-1")!;
    const warnings = checkSafety({ container: beaker.data, firstAddedOrder: result.current.state.firstAddedOrder["beaker-1"] });
    expect(warnings.some((w) => w.code === "empty_container_heated")).toBe(true);
  });

  it("checkSafety не выдумывает предупреждения там, где их реально нет", () => {
    const { result } = renderHook(() => useChemistryWorkspace(), { wrapper: workspaceWrapper });

    act(() => result.current.addSubstanceToContainer("beaker-1", "water", 200));
    act(() => result.current.addSubstanceToContainer("beaker-1", "nacl", 20));

    const beaker = result.current.state.containers.find((c) => c.id === "beaker-1")!;
    const warnings = checkSafety({ container: beaker.data, firstAddedOrder: result.current.state.firstAddedOrder["beaker-1"] });
    expect(warnings).toHaveLength(0);
  });
});

describe("Совместная работа ChemistryWorkspaceProvider + ChemistryDragProvider", () => {
  function CombinedHarness() {
    const workspace = useChemistryWorkspace();
    const drag = useChemistryDrag();
    return (
      <div>
        <div data-testid="dragging-id">{drag.draggingId ?? "none"}</div>
        <div data-testid="beaker-mass">{totalMassG(workspace.state.containers[0].data)}</div>
        <button
          data-testid="grab-and-pour"
          onClick={() => {
            drag.startDrag("test-tube-1");
            workspace.addSubstanceToContainer("test-tube-1", "water", 30);
            workspace.pourInto("test-tube-1", "beaker-1");
            drag.stopDrag();
          }}
        >
          grab
        </button>
      </div>
    );
  }

  it("полный цикл захват -> добавление -> перелив -> отпускание через оба провайдера разом", () => {
    render(
      <ChemistryWorkspaceProvider>
        <ChemistryDragProvider>
          <CombinedHarness />
        </ChemistryDragProvider>
      </ChemistryWorkspaceProvider>
    );

    expect(screen.getByTestId("dragging-id").textContent).toBe("none");
    expect(screen.getByTestId("beaker-mass").textContent).toBe("0");

    act(() => {
      screen.getByTestId("grab-and-pour").click();
    });

    expect(screen.getByTestId("dragging-id").textContent).toBe("none");
    expect(screen.getByTestId("beaker-mass").textContent).toBe("30");
  });
});
