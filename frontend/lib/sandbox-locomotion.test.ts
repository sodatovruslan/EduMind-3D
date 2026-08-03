import { describe, expect, it } from "vitest";
import {
  calculateKinematicStep,
  computeDirectionVectors,
  computeWorldMovementVector,
  isValidSpawnPosition,
  RegisteredCollider,
  resolveObstacleCollisions,
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

const MOCK_TABLE: RegisteredCollider = {
  id: "main_table",
  name: "Главный стол",
  role: "floor-obstacle",
  bounds: { minX: -1.5, maxX: 1.5, minZ: -0.3, maxZ: 1.1 },
  minY: 0,
  maxY: 0.88,
};

describe("Stage S-7 v2 — CheckPoint S7-V2.4 Dynamic Furniture Collision & Kinematic Sliding", () => {
  it("1. Camera yaw direction vectors", () => {
    const d0 = computeDirectionVectors(0);
    expect(d0.forward.x).toBeCloseTo(0, 5);
    expect(d0.forward.z).toBeCloseTo(-1, 5);
  });

  it("2. Valid and Invalid Spawn Position Check with Obstacles", () => {
    const validPos: [number, number] = [0, 2.5];
    expect(isValidSpawnPosition(validPos, MOCK_ROOM, [MOCK_TABLE], R, SKIN)).toBe(true);

    // Spawn inside expanded table bounds (X[-1.87..1.87], Z[-0.67..1.47])
    const invalidInsideTable: [number, number] = [0, 0.5];
    expect(isValidSpawnPosition(invalidInsideTable, MOCK_ROOM, [MOCK_TABLE], R, SKIN)).toBe(false);
  });

  it("3. Obstacle collision: Direct walk forward (+Z) into table front edge is blocked", () => {
    const start: [number, number] = [0, -1.0];
    const requested = { x: 0, z: 0.8 }; // Walk towards table minZ (-0.3)
    const res = resolveObstacleCollisions(start, requested, [MOCK_TABLE], R, SKIN);

    expect(res.blockedObstacleId).toBe("main_table");
    expect(res.blockedSide).toBe("front");
    expect(res.nextPos[1]).toBeCloseTo(-0.3 - R - SKIN, 5); // Clamped at -0.67
  });

  it("4. Obstacle collision: Diagonal slide along table front edge", () => {
    const start: [number, number] = [0, -0.67];
    const requested = { x: 0.3, z: 0.2 }; // Walk diagonal
    const res = resolveObstacleCollisions(start, requested, [MOCK_TABLE], R, SKIN);

    expect(res.blockedObstacleId).toBe("main_table");
    expect(res.nextPos[0]).toBeCloseTo(0.3, 5); // Slides along X
    expect(res.nextPos[1]).toBeCloseTo(-0.67, 5); // Z stays clamped
  });

  it("5. Walking around table on left & right sides is 100% free", () => {
    // Left side of expanded table (X < -1.87)
    const startLeft: [number, number] = [-2.0, -1.0];
    const resLeft = resolveObstacleCollisions(startLeft, { x: 0, z: 1.5 }, [MOCK_TABLE], R, SKIN);
    expect(resLeft.blockedObstacleId).toBeNull();
    expect(resLeft.nextPos[1]).toBeCloseTo(0.5, 5);

    // Right side of expanded table (X > 1.87)
    const startRight: [number, number] = [2.0, -1.0];
    const resRight = resolveObstacleCollisions(startRight, { x: 0, z: 1.5 }, [MOCK_TABLE], R, SKIN);
    expect(resRight.blockedObstacleId).toBeNull();
    expect(resRight.nextPos[1]).toBeCloseTo(0.5, 5);
  });

  it("6. Tunneling protection test (Substepping): Large movement delta cannot tunnel through table", () => {
    const start: [number, number] = [0, -2.0];
    // Attempt huge leap straight through the table (from Z = -2.0 to Z = 2.0)
    const res = calculateKinematicStep(
      start,
      { x: 0, z: -1 }, // S key moves +Z towards table when yaw=0
      0, // Yaw=0
      10.0, // High speed
      0.5, // Large delta
      MOCK_ROOM,
      [MOCK_TABLE],
      R,
      SKIN
    );

    expect(res.blockedObstacleId).toBe("main_table");
    expect(res.nextPos[1]).toBeCloseTo(-0.67, 5); // Stopped strictly at front edge of table
  });

  it("7. Wall Clamping & Obstacle Clamping combined", () => {
    const start: [number, number] = [0, 2.5];
    const res = calculateKinematicStep(start, { x: 0, z: 1 }, 0, 2.5, 0.1, MOCK_ROOM, [MOCK_TABLE], R, SKIN);
    expect(res.nextPos[1]).toBeLessThan(2.5); // Normal step forward towards table
  });
});
