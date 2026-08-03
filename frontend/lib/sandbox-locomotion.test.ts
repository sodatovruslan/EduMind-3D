import { describe, expect, it } from "vitest";
import {
  calculateKinematicStep,
  computeDirectionVectors,
  computeWorldMovementVector,
  isValidSpawnPosition,
  resolveWallCollisions,
  RoomInteriorBounds,
} from "./sandbox-locomotion";

const MOCK_ROOM: RoomInteriorBounds = {
  minX: -4.2,
  maxX: 4.2,
  minZ: -3.2,
  maxZ: 3.2,
};
const R = 0.35;
const SKIN = 0.02;

describe("Stage S-7 v2 — CheckPoint S7-V2.3 Dynamic Room Bounds & Wall Collisions", () => {
  it("1. Camera yaw direction vectors", () => {
    const d0 = computeDirectionVectors(0);
    expect(d0.forward.x).toBeCloseTo(0, 5);
    expect(d0.forward.z).toBeCloseTo(-1, 5);
  });

  it("2. Valid and Invalid Spawn Position Check", () => {
    const validPos: [number, number] = [0, 2.5];
    expect(isValidSpawnPosition(validPos, MOCK_ROOM, R, SKIN)).toBe(true);

    const invalidLeft: [number, number] = [-4.0, 0];
    expect(isValidSpawnPosition(invalidLeft, MOCK_ROOM, R, SKIN)).toBe(false);

    const invalidBack: [number, number] = [0, -3.0];
    expect(isValidSpawnPosition(invalidBack, MOCK_ROOM, R, SKIN)).toBe(false);
  });

  it("3. Wall collision: Left wall blocks movement X", () => {
    const start: [number, number] = [-3.8, 0];
    const requested = { x: -0.5, z: 0 };
    const res = resolveWallCollisions(start, requested, MOCK_ROOM, R, SKIN);

    expect(res.blockedWall).toBe("left");
    expect(res.nextPos[0]).toBeCloseTo(-4.2 + R + SKIN, 5); // -3.83
  });

  it("4. Wall collision: Right wall blocks movement X", () => {
    const start: [number, number] = [3.8, 0];
    const requested = { x: 0.5, z: 0 };
    const res = resolveWallCollisions(start, requested, MOCK_ROOM, R, SKIN);

    expect(res.blockedWall).toBe("right");
    expect(res.nextPos[0]).toBeCloseTo(4.2 - R - SKIN, 5); // 3.83
  });

  it("5. Wall collision: Back wall blocks movement Z", () => {
    const start: [number, number] = [0, -2.8];
    const requested = { x: 0, z: -0.5 };
    const res = resolveWallCollisions(start, requested, MOCK_ROOM, R, SKIN);

    expect(res.blockedWall).toBe("back");
    expect(res.nextPos[1]).toBeCloseTo(-3.2 + R + SKIN, 5); // -2.83
  });

  it("6. Wall collision: Front wall blocks movement Z", () => {
    const start: [number, number] = [0, 2.8];
    const requested = { x: 0, z: 0.5 };
    const res = resolveWallCollisions(start, requested, MOCK_ROOM, R, SKIN);

    expect(res.blockedWall).toBe("front");
    expect(res.nextPos[1]).toBeCloseTo(3.2 - R - SKIN, 5); // 2.83
  });

  it("7. Diagonal sliding along Back Wall: Z is blocked, X moves smoothly", () => {
    const start: [number, number] = [0, -2.83];
    const requested = { x: 0.2, z: -0.2 };
    const res = resolveWallCollisions(start, requested, MOCK_ROOM, R, SKIN);

    expect(res.blockedWall).toBe("back");
    expect(res.nextPos[0]).toBeCloseTo(0.2, 5); // Moves along X
    expect(res.nextPos[1]).toBeCloseTo(-2.83, 5); // Z stays clamped
  });

  it("8. Moving away from wall: Unblocked immediately", () => {
    const start: [number, number] = [-3.83, 0];
    const requested = { x: 0.2, z: 0 }; // Move right away from left wall
    const res = resolveWallCollisions(start, requested, MOCK_ROOM, R, SKIN);

    expect(res.blockedWall).toBe("none");
    expect(res.nextPos[0]).toBeCloseTo(-3.63, 5);
  });

  it("9. Corner Clamping: Clamped inside both X and Z", () => {
    const start: [number, number] = [-3.8, -2.8];
    const requested = { x: -0.5, z: -0.5 };
    const res = resolveWallCollisions(start, requested, MOCK_ROOM, R, SKIN);

    expect(res.blockedWall).toBe("corner");
    expect(res.nextPos[0]).toBeCloseTo(-3.83, 5);
    expect(res.nextPos[1]).toBeCloseTo(-2.83, 5);
  });

  it("10. Tunnel Prevention (Large Delta): Clamped strictly inside room bounds", () => {
    const start: [number, number] = [0, 0];
    const requested = { x: 10.0, z: -10.0 }; // Massive delta
    const res = resolveWallCollisions(start, requested, MOCK_ROOM, R, SKIN);

    expect(res.blockedWall).toBe("corner");
    expect(res.nextPos[0]).toBeLessThanOrEqual(3.83);
    expect(res.nextPos[1]).toBeGreaterThanOrEqual(-2.83);
  });
});
