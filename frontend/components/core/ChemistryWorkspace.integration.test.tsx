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
import { aggregateStateOf, totalMassG, totalVolumeMl } from "../../lib/chemistry-engine";
import { EXPERIMENTS } from "../../lib/experiment-validator";
import { checkSafety } from "../../lib/chemistry-safety";
import { getSlot } from "../../lib/storage-slots";

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
  it("атомарно переносит воду и NaCl из stock bottles, сохраняет массу/объём и обновляет validator", () => {
    const { result } = renderHook(() => useChemistryWorkspace(), { wrapper: workspaceWrapper });
    const dissolution = EXPERIMENTS[0];
    const initialWater = result.current.state.stockBottles.find((b) => b.id === "stock-water")!;
    const initialSalt = result.current.state.stockBottles.find((b) => b.id === "stock-nacl")!;
    const conservedMassBefore = initialWater.remainingGrams + initialSalt.remainingGrams;
    const conservedWaterVolumeBefore = initialWater.remainingGrams / 1.0;

    act(() => {
      result.current.toggleBottleCap("stock-water");
      result.current.toggleBottleCap("stock-nacl");
    });

    act(() => result.current.pourFromStockBottle("stock-water", "beaker-1", 100));
    let beaker = result.current.state.containers.find((c) => c.id === "beaker-1")!;
    let water = result.current.state.stockBottles.find((b) => b.id === "stock-water")!;
    expect(water.remainingGrams).toBeCloseTo(400, 5);
    expect(totalVolumeMl(beaker.data)).toBeCloseTo(100, 5);
    expect(water.remainingGrams / 1.0 + totalVolumeMl(beaker.data)).toBeCloseTo(conservedWaterVolumeBefore, 5);
    expect(dissolution.validate({ container: beaker.data, occurredReactionIds: [] }).errors.some((e) => e.code === "no_water")).toBe(false);

    act(() => result.current.pourFromStockBottle("stock-nacl", "beaker-1", 20));
    beaker = result.current.state.containers.find((c) => c.id === "beaker-1")!;
    expect(beaker.data.contents.find((x) => x.substanceId === "nacl")?.grams).toBeCloseTo(20, 5);
    expect(beaker.data.precipitate).toHaveLength(0);
    expect(dissolution.validate({ container: beaker.data, occurredReactionIds: [] }).completed).toBe(true);

    act(() => result.current.pourFromStockBottle("stock-nacl", "beaker-1", 20));
    beaker = result.current.state.containers.find((c) => c.id === "beaker-1")!;
    water = result.current.state.stockBottles.find((b) => b.id === "stock-water")!;
    const salt = result.current.state.stockBottles.find((b) => b.id === "stock-nacl")!;
    expect(beaker.data.contents.find((x) => x.substanceId === "nacl")?.grams).toBeCloseTo(36, 5);
    expect(beaker.data.precipitate.find((x) => x.substanceId === "nacl")?.grams).toBeCloseTo(4, 5);
    expect(dissolution.validate({ container: beaker.data, occurredReactionIds: [] }).completed).toBe(false);

    const conservedMassAfter = water.remainingGrams + salt.remainingGrams + totalMassG(beaker.data);
    expect(conservedMassAfter).toBeCloseTo(conservedMassBefore, 5);
  });

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
  it("перемещённый штатив задаёт новую heating proximity без привязки к исходной позиции", () => {
    const { result } = renderHook(() => useChemistryWorkspace(), { wrapper: workspaceWrapper });
    const originalStand = result.current.state.tools.find((tool) => tool.id === "stand-1")!;
    const movedStandPosition: [number, number] = [-2.8, 0.8];

    act(() => result.current.setItemTransform("stand-1", movedStandPosition, originalStand.rotationY));
    act(() => result.current.moveItem("beaker-1", originalStand.position));
    expect(
      isContainerOnStand(
        result.current.state.containers.find((container) => container.id === "beaker-1")!,
        result.current.state.tools
      )
    ).toBe(false);

    act(() => result.current.moveItem("beaker-1", movedStandPosition));
    expect(
      isContainerOnStand(
        result.current.state.containers.find((container) => container.id === "beaker-1")!,
        result.current.state.tools
      )
    ).toBe(true);

    act(() => result.current.toggleBurner("burner-1"));
    act(() => result.current.heatTick(12));
    expect(result.current.state.containers.find((container) => container.id === "beaker-1")!.data.temperatureC).toBe(32);
  });

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

describe("Stage S-3 — единый spatial/storage контракт", () => {
  it("инициализирует все переносимые семейства единым набором spatial-полей", () => {
    const { result } = renderHook(() => useChemistryWorkspace(), { wrapper: workspaceWrapper });

    for (const item of [
      ...result.current.state.containers,
      ...result.current.state.stockBottles,
      ...result.current.state.tools,
    ]) {
      expect(item.position).toHaveLength(2);
      expect(Number.isFinite(item.elevation)).toBe(true);
      expect(Number.isFinite(item.rotationY)).toBe(true);
      expect(item.storageSlotId === null || typeof item.storageSlotId === "string").toBe(true);
    }
  });

  it("считает storageSlotId источником истины и ставит flask точно в transform слота", () => {
    const { result } = renderHook(() => useChemistryWorkspace(), { wrapper: workspaceWrapper });
    const flask = result.current.state.containers.find((item) => item.id === "flask-1")!;
    const slot = getSlot("cabinet-left-inner-slot-1")!;

    expect(flask.storageSlotId).toBe(slot.id);
    expect(flask.position).toEqual(slot.position);
    expect(flask.elevation).toBe(slot.elevation);
    expect(flask.rotationY).toBe(slot.rotationY);
    expect(result.current.state.cabinets.find((cabinet) => cabinet.id === slot.cabinetId)?.isOpen).toBe(false);
  });

  it("атомарно освобождает слот при pickup и Escape восстанавливает полный origin без изменения химии", () => {
    const { result } = renderHook(() => useChemistryWorkspace(), { wrapper: workspaceWrapper });
    const before = result.current.state.containers.find((item) => item.id === "flask-1")!;
    const origin = {
      position: [...before.position] as [number, number],
      elevation: before.elevation,
      rotationY: before.rotationY,
      storageSlotId: before.storageSlotId,
    };
    const chemistryBefore = JSON.stringify(before.data);

    act(() => result.current.releaseItemFromSlot("flask-1"));
    expect(result.current.state.containers.find((item) => item.id === "flask-1")!.storageSlotId).toBeNull();

    act(() =>
      result.current.setItemTransform("flask-1", origin.position, origin.rotationY, {
        elevation: origin.elevation,
        storageSlotId: origin.storageSlotId,
      })
    );
    const restored = result.current.state.containers.find((item) => item.id === "flask-1")!;
    expect(restored).toMatchObject(origin);
    expect(JSON.stringify(restored.data)).toBe(chemistryBefore);
  });

  it("хранит Container, StockBottle и ToolItem одной операцией и сохраняет их функциональное состояние", () => {
    const { result } = renderHook(() => useChemistryWorkspace(), { wrapper: workspaceWrapper });

    act(() => result.current.toggleCabinet("cabinet-left-outer"));
    const waterBefore = result.current.state.stockBottles.find((item) => item.id === "stock-water")!;
    const remainingBefore = waterBefore.remainingGrams;
    let stored = false;
    act(() => {
      stored = result.current.storeItemInCabinet("stock-water", "cabinet-left-outer");
    });
    const waterAfter = result.current.state.stockBottles.find((item) => item.id === "stock-water")!;
    expect(stored).toBe(true);
    expect(waterAfter.storageSlotId).toBe("cabinet-left-outer-slot-1");
    expect(waterAfter.remainingGrams).toBe(remainingBefore);

    act(() => result.current.toggleCabinet("cabinet-right-inner"));
    act(() => {
      stored = result.current.storeItemInCabinet("pipette-1", "cabinet-right-inner");
    });
    const pipette = result.current.state.tools.find((item) => item.id === "pipette-1")!;
    expect(stored).toBe(true);
    expect(pipette.storageSlotId).toBe("cabinet-right-inner-slot-1");

    act(() => result.current.toggleCabinet("cabinet-left-inner"));
    act(() => result.current.releaseItemFromSlot("flask-1"));
    act(() => {
      stored = result.current.storeItemInCabinet("flask-1", "cabinet-left-inner");
    });
    expect(stored).toBe(true);
    expect(result.current.state.containers.find((item) => item.id === "flask-1")!.storageSlotId).toBe(
      "cabinet-left-inner-slot-1"
    );
  });

  it("отклоняет закрытый, занятый и несовместимый слот без частичного изменения предмета", () => {
    const { result } = renderHook(() => useChemistryWorkspace(), { wrapper: workspaceWrapper });
    const thermometerBefore = result.current.state.tools.find((item) => item.id === "thermometer-1")!;
    let stored = true;

    act(() => {
      stored = result.current.storeItemInCabinet("thermometer-1", "cabinet-right-inner");
    });
    expect(stored).toBe(false);

    act(() => result.current.toggleCabinet("cabinet-right-inner"));
    act(() => {
      stored = result.current.storeItemInCabinet("pipette-1", "cabinet-right-inner");
    });
    expect(stored).toBe(true);
    act(() => {
      stored = result.current.storeItemInCabinet("thermometer-1", "cabinet-right-inner");
    });
    expect(stored).toBe(false);
    expect(result.current.state.tools.find((item) => item.id === "thermometer-1")).toEqual(thermometerBefore);

    act(() => result.current.toggleCabinet("cabinet-left-outer"));
    const acidBefore = result.current.state.stockBottles.find((item) => item.id === "stock-hcl")!;
    act(() => {
      stored = result.current.storeItemInCabinet("stock-hcl", "cabinet-left-outer");
    });
    expect(stored).toBe(false);
    expect(result.current.state.stockBottles.find((item) => item.id === "stock-hcl")).toEqual(acidBefore);

    act(() => result.current.toggleCabinet("cabinet-right-outer"));
    const standBefore = result.current.state.tools.find((item) => item.id === "stand-1")!;
    act(() => {
      stored = result.current.storeItemInCabinet("stand-1", "cabinet-right-outer");
    });
    expect(stored).toBe(false);
    expect(result.current.state.tools.find((item) => item.id === "stand-1")).toEqual(standBefore);
  });

  it("table placement очищает storageSlotId и сохраняет table elevation", () => {
    const { result } = renderHook(() => useChemistryWorkspace(), { wrapper: workspaceWrapper });

    act(() =>
      result.current.setItemTransform("flask-1", [1.2, -0.7], 0.4, {
        elevation: 0.05,
        storageSlotId: null,
      })
    );
    const flask = result.current.state.containers.find((item) => item.id === "flask-1")!;
    expect(flask).toMatchObject({
      position: [1.2, -0.7],
      rotationY: 0.4,
      elevation: 0.05,
      storageSlotId: null,
    });
  });
});
