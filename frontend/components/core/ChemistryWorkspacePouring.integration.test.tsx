// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { ChemistryWorkspaceProvider, useChemistryWorkspace } from "./ChemistryWorkspaceProvider";
import {
  calculatePourGeometry,
  calculatePourRateMlPerSec,
  canPourNow,
  MIN_POUR_TILT_RAD,
} from "../../lib/pour-engine";

function renderWorkspace() {
  return renderHook(() => useChemistryWorkspace(), {
    wrapper: ({ children }) => <ChemistryWorkspaceProvider>{children}</ChemistryWorkspaceProvider>,
  });
}

describe("Stage S-5 — Continuous 3D Held Pouring Integration Tests", () => {
  it("1. Closed cap blocks continuous pouring", () => {
    const { result } = renderWorkspace();
    const waterId = "stock-water";
    const beakerId = "beaker-1";

    const geom = calculatePourGeometry(
      [0, 1.2, 0],
      0,
      Math.PI / 3, // tilted 60 deg
      "stock_water",
      [0, 0],
      1.0,
      "beaker"
    );

    const check = canPourNow(
      {
        id: waterId,
        capState: result.current.state.stockBottles.find((b) => b.id === waterId)?.capState,
        remainingGrams: 500,
      },
      geom
    );

    expect(check.canPour).toBe(false);
    expect(check.blockedReason).toBe("cap_closed");
  });

  it("2. Open cap with tilt >= 45° and distance <= 0.35m allows pouring", () => {
    const { result } = renderWorkspace();
    const waterId = "stock-water";

    act(() => {
      result.current.toggleBottleCap(waterId);
    });

    const bottle = result.current.state.stockBottles.find((b) => b.id === waterId)!;
    expect(bottle.capState).toBe("open");

    const geom = calculatePourGeometry(
      [0, 1.2, 0],
      0,
      Math.PI / 3,
      "stock_water",
      [0, 0],
      1.0,
      "beaker"
    );

    const check = canPourNow({ id: bottle.id, capState: bottle.capState, remainingGrams: bottle.remainingGrams }, geom);
    expect(check.canPour).toBe(true);
    expect(check.blockedReason).toBeNull();
  });

  it("3. Continuous multi-frame pour conserves total mass and volume", () => {
    const { result } = renderWorkspace();
    const waterId = "stock-water";
    const beakerId = "beaker-1";

    act(() => {
      result.current.toggleBottleCap(waterId);
    });

    const rate = calculatePourRateMlPerSec(Math.PI / 3); // ~15 ml/s
    const deltaSec = 0.5; // 0.5s tick
    const deltaGrams = rate * deltaSec; // ~7.5g

    act(() => {
      result.current.pourFromStockBottle(waterId, beakerId, deltaGrams);
    });

    const bottle = result.current.state.stockBottles.find((b) => b.id === waterId)!;
    const beaker = result.current.state.containers.find((c) => c.id === beakerId)!;

    expect(bottle.remainingGrams).toBeCloseTo(500 - deltaGrams, 3);
    expect(beaker.data.contents.find((c) => c.substanceId === "water")?.grams).toBeCloseTo(deltaGrams, 3);

    // Sum of mass conserved
    expect(bottle.remainingGrams + (beaker.data.contents.find((c) => c.substanceId === "water")?.grams ?? 0)).toBeCloseTo(500, 3);
  });

  it("4. Straightening bottle (<45°) stops flow instantly", () => {
    const geom = calculatePourGeometry(
      [0, 1.2, 0],
      0,
      Math.PI / 6, // 30 deg (<45 deg)
      "stock_water",
      [0, 0],
      1.0,
      "beaker"
    );

    const check = canPourNow({ id: "stock-water", capState: "open", remainingGrams: 500 }, geom);
    expect(check.canPour).toBe(false);
    expect(check.blockedReason).toBe("not_tilted");
    expect(calculatePourRateMlPerSec(Math.PI / 6)).toBe(0);
  });

  it("5. Distance separation (>0.35m) stops flow instantly", () => {
    const geom = calculatePourGeometry(
      [2.5, 1.2, 2.5], // 3.5m away
      0,
      Math.PI / 3,
      "stock_water",
      [0, 0],
      1.0,
      "beaker"
    );

    const check = canPourNow({ id: "stock-water", capState: "open", remainingGrams: 500 }, geom);
    expect(check.canPour).toBe(false);
    expect(check.blockedReason).toBe("too_far");
  });
});
