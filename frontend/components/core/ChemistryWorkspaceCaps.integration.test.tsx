// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { ChemistryWorkspaceProvider, useChemistryWorkspace } from "./ChemistryWorkspaceProvider";

function renderWorkspace() {
  return renderHook(() => useChemistryWorkspace(), {
    wrapper: ({ children }) => <ChemistryWorkspaceProvider>{children}</ChemistryWorkspaceProvider>,
  });
}

describe("Stage S-4 — Chemistry Workspace Cap Integration Tests", () => {
  it("1. All 6 stock bottles start with capState = 'closed'", () => {
    const { result } = renderWorkspace();
    expect(result.current.state.stockBottles).toHaveLength(6);
    result.current.state.stockBottles.forEach((bottle) => {
      expect(bottle.capState).toBe("closed");
    });
  });

  it("2. toggleBottleCap toggles closed <-> open for a stock bottle", () => {
    const { result } = renderWorkspace();
    const waterId = "stock-water";
    expect(result.current.state.stockBottles.find((b) => b.id === waterId)?.capState).toBe("closed");

    act(() => {
      result.current.toggleBottleCap(waterId);
    });
    expect(result.current.state.stockBottles.find((b) => b.id === waterId)?.capState).toBe("open");

    act(() => {
      result.current.toggleBottleCap(waterId);
    });
    expect(result.current.state.stockBottles.find((b) => b.id === waterId)?.capState).toBe("closed");
  });

  it("3 & 5 & 6 & 7. Closed bottle cannot POUR_FROM_STOCK (mass & target contents remain unchanged)", () => {
    const { result } = renderWorkspace();
    const waterId = "stock-water";
    const beakerId = "beaker-1";

    const bottleBefore = result.current.state.stockBottles.find((b) => b.id === waterId);
    const beakerBefore = result.current.state.containers.find((c) => c.id === beakerId);

    act(() => {
      result.current.pourFromStockBottle(waterId, beakerId, 50);
    });

    const bottleAfter = result.current.state.stockBottles.find((b) => b.id === waterId);
    const beakerAfter = result.current.state.containers.find((c) => c.id === beakerId);

    expect(bottleAfter?.remainingGrams).toBe(bottleBefore?.remainingGrams);
    expect(beakerAfter?.data.contents).toEqual(beakerBefore?.data.contents);
  });

  it("8. Open bottle pours with mass conservation", () => {
    const { result } = renderWorkspace();
    const waterId = "stock-water";
    const beakerId = "beaker-1";

    act(() => {
      result.current.toggleBottleCap(waterId);
    });

    act(() => {
      result.current.pourFromStockBottle(waterId, beakerId, 50);
    });

    const bottleAfter = result.current.state.stockBottles.find((b) => b.id === waterId);
    const beakerAfter = result.current.state.containers.find((c) => c.id === beakerId);

    expect(bottleAfter?.remainingGrams).toBe(450);
    expect(beakerAfter?.data.contents.find((c) => c.substanceId === "water")?.grams).toBe(50);
  });

  it("11 & 18. Open bottle cannot be stored in cabinet slot", () => {
    const { result } = renderWorkspace();
    const waterId = "stock-water";
    const cabinetId = "cabinet-left-outer";

    // Open cabinet
    act(() => {
      result.current.toggleCabinet(cabinetId);
    });

    // Open bottle cap
    act(() => {
      result.current.toggleBottleCap(waterId);
    });

    // findAvailableStorageSlot should return null for open bottle
    const slot = result.current.findAvailableStorageSlot(waterId, cabinetId);
    expect(slot).toBeNull();

    // storeItemInCabinet should return false
    let stored = false;
    act(() => {
      stored = result.current.storeItemInCabinet(waterId, cabinetId);
    });
    expect(stored).toBe(false);
    expect(result.current.state.stockBottles.find((b) => b.id === waterId)?.storageSlotId).toBeNull();
  });

  it("12. Closed bottle can be stored in cabinet slot", () => {
    const { result } = renderWorkspace();
    const waterId = "stock-water";
    const cabinetId = "cabinet-left-outer";

    act(() => {
      result.current.toggleCabinet(cabinetId);
    });

    const slot = result.current.findAvailableStorageSlot(waterId, cabinetId);
    expect(slot).not.toBeNull();

    let stored = false;
    act(() => {
      stored = result.current.storeItemInCabinet(waterId, cabinetId);
    });
    expect(stored).toBe(true);
    expect(result.current.state.stockBottles.find((b) => b.id === waterId)?.storageSlotId).toBe(slot?.id);
  });

  it("19 & 20. Cabinet cannot be closed if inside contains an open bottle, but closes after closing cap", () => {
    const { result } = renderWorkspace();
    const waterId = "stock-water";
    const cabinetId = "cabinet-left-outer";

    act(() => {
      result.current.toggleCabinet(cabinetId);
    });

    act(() => {
      result.current.storeItemInCabinet(waterId, cabinetId);
    });

    // Open bottle inside cabinet
    act(() => {
      result.current.toggleBottleCap(waterId);
    });

    // Attempt to close cabinet
    act(() => {
      result.current.toggleCabinet(cabinetId);
    });
    // Cabinet remains open
    expect(result.current.state.cabinets.find((c) => c.id === cabinetId)?.isOpen).toBe(true);

    // Close bottle cap
    act(() => {
      result.current.toggleBottleCap(waterId);
    });

    // Now close cabinet succeeds
    act(() => {
      result.current.toggleCabinet(cabinetId);
    });
    expect(result.current.state.cabinets.find((c) => c.id === cabinetId)?.isOpen).toBe(false);
  });
});
