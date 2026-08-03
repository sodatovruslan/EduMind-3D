import { describe, expect, it } from "vitest";
import {
  calculatePourGeometry,
  calculatePourRateMlPerSec,
  canPourNow,
  getOpeningLocalPosition,
  getSpoutLocalPosition,
  MIN_POUR_TILT_RAD,
  POUR_DISTANCE_THRESHOLD_M,
} from "./pour-engine";

describe("Stage S-5 — Spatial 3D Pour Engine Geometry & Flow", () => {
  it("returns valid local spout & opening positions for containers", () => {
    const stockSpout = getSpoutLocalPosition("stock_water");
    expect(stockSpout.y).toBeGreaterThan(0.2);
    expect(stockSpout.z).toBeGreaterThan(0.05);

    const beakerOpening = getOpeningLocalPosition("beaker");
    expect(beakerOpening.y).toBeGreaterThan(0.1);
    expect(beakerOpening.x).toBe(0);
    expect(beakerOpening.z).toBe(0);
  });

  it("calculatePourGeometry correctly computes distance and tilt state", () => {
    // Source held bottle placed directly above beaker
    const geom = calculatePourGeometry(
      [0, 1.2, 0], // heldPosition
      0, // rotationY
      Math.PI / 3, // tiltRad (~60 deg)
      "stock_water",
      [0, 0], // targetPosition
      1.0, // targetElevation
      "beaker"
    );

    expect(geom.isTilted).toBe(true);
    expect(geom.distanceM).toBeLessThan(POUR_DISTANCE_THRESHOLD_M);
    expect(geom.isWithinDistance).toBe(true);
    expect(geom.isWithinAlignment).toBe(true);
  });

  it("calculatePourRateMlPerSec scales flow rate from 0 at <45 deg up to max rate", () => {
    expect(calculatePourRateMlPerSec(0)).toBe(0);
    expect(calculatePourRateMlPerSec(Math.PI / 6)).toBe(0); // 30 deg -> 0
    expect(calculatePourRateMlPerSec(MIN_POUR_TILT_RAD)).toBeCloseTo(0, 5); // 45 deg -> start
    expect(calculatePourRateMlPerSec(Math.PI / 3)).toBeGreaterThan(5); // 60 deg -> ~6.6 ml/s
    expect(calculatePourRateMlPerSec(Math.PI / 2)).toBeGreaterThan(15); // 90 deg -> ~18.7 ml/s
  });

  it("canPourNow blocks pour when cap is closed, bottle is empty, not tilted, or too far", () => {
    const validGeom = calculatePourGeometry(
      [0, 1.2, 0],
      0,
      Math.PI / 3,
      "stock_water",
      [0, 0],
      1.0,
      "beaker"
    );

    // 1. Closed cap
    const capClosed = canPourNow(
      { id: "stock-water", capState: "closed", remainingGrams: 500 },
      validGeom
    );
    expect(capClosed.canPour).toBe(false);
    expect(capClosed.blockedReason).toBe("cap_closed");

    // 2. Open cap -> valid
    const openCap = canPourNow(
      { id: "stock-water", capState: "open", remainingGrams: 500 },
      validGeom
    );
    expect(openCap.canPour).toBe(true);
    expect(openCap.blockedReason).toBeNull();

    // 3. Empty bottle
    const emptyBottle = canPourNow(
      { id: "stock-water", capState: "open", remainingGrams: 0 },
      validGeom
    );
    expect(emptyBottle.canPour).toBe(false);
    expect(emptyBottle.blockedReason).toBe("empty");

    // 4. Too far away
    const farGeom = calculatePourGeometry(
      [3.0, 1.2, 3.0],
      0,
      Math.PI / 3,
      "stock_water",
      [0, 0],
      1.0,
      "beaker"
    );
    const farBottle = canPourNow(
      { id: "stock-water", capState: "open", remainingGrams: 500 },
      farGeom
    );
    expect(farBottle.canPour).toBe(false);
    expect(farBottle.blockedReason).toBe("too_far");
  });
});
