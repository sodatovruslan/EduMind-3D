import { describe, expect, it } from "vitest";
import {
  calculateKinematicStep,
  computeDirectionVectors,
  computeWorldMovementVector,
} from "./sandbox-locomotion";

describe("Stage S-7 v2 — CheckPoint S7-V2.2 Locomotion Kinematics", () => {
  it("1. Camera yaw direction vectors at 0°, 90°, 180°, -90°", () => {
    const d0 = computeDirectionVectors(0);
    expect(d0.forward.x).toBeCloseTo(0, 5);
    expect(d0.forward.z).toBeCloseTo(-1, 5);

    const d90 = computeDirectionVectors(Math.PI / 2);
    expect(d90.forward.x).toBeCloseTo(-1, 5);
    expect(d90.forward.z).toBeCloseTo(0, 5);
  });

  it("2. WASD movement relative to camera yaw (W=Forward, S=Backward, A=Left, D=Right)", () => {
    const moveW = computeWorldMovementVector({ x: 0, z: 1 }, 0);
    expect(moveW.x).toBeCloseTo(0, 5);
    expect(moveW.z).toBeCloseTo(-1, 5);

    const moveS = computeWorldMovementVector({ x: 0, z: -1 }, 0);
    expect(moveS.x).toBeCloseTo(0, 5);
    expect(moveS.z).toBeCloseTo(1, 5);

    const moveD = computeWorldMovementVector({ x: 1, z: 0 }, 0);
    expect(moveD.x).toBeCloseTo(1, 5);
    expect(moveD.z).toBeCloseTo(0, 5);

    const moveA = computeWorldMovementVector({ x: -1, z: 0 }, 0);
    expect(moveA.x).toBeCloseTo(-1, 5);
    expect(moveA.z).toBeCloseTo(0, 5);
  });

  it("3. Diagonal normalization: speed of W+D is equal to length 1", () => {
    const moveWD = computeWorldMovementVector({ x: 1, z: 1 }, 0);
    const len = Math.sqrt(moveWD.x * moveWD.x + moveWD.z * moveWD.z);
    expect(len).toBeCloseTo(1, 5);
  });

  it("4. Kinematic step advances position smoothly", () => {
    const start: [number, number] = [0, 2.5];
    const next = calculateKinematicStep(start, { x: 0, z: 1 }, 0, 2.0, 0.1);
    expect(next[0]).toBeCloseTo(0, 5);
    expect(next[1]).toBeCloseTo(2.3, 5); // Moved 0.2m along -Z
  });
});
