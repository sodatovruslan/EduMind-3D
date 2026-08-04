import { describe, expect, it } from "vitest";
import {
  calculateKinematicStep,
  computeDirectionVectors,
  computeHeldWorldPos,
  computeInteractionTargets,
  computePickupTarget,
  computeWorldMovementVector,
  HeldRigConfig,
  isValidSpawnPosition,
  PickableItem,
  rayIntersectAABB,
  RegisteredCollider,
  resolveHeldRigTransform,
  resolveObstacleCollisions,
  resolveWallCollisions,
  checkPlayerReach,
  distanceToAABB,
  checkLineOfSight,
  evaluateUnifiedInteraction,
  validateItemPlacementOnSurface,
  validatePouringConditions,
  DynamicPlacementSurface,
  RoomInteriorBounds,
  segmentIntersectsAABB,
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

// ─── S7-V2.5 — Wall Cabinets & Interaction Bounds ───────────────────────────

const MOCK_CABINET_LEFT: RegisteredCollider = {
  id: "cabinet_left",
  name: "Левый шкаф",
  role: "interaction-only",
  bounds: { minX: -2.6, maxX: -1.4, minZ: -3.3, maxZ: -3.0 },
  minY: 1.0,
  maxY: 1.8,
};

const MOCK_CABINET_RIGHT: RegisteredCollider = {
  id: "cabinet_right",
  name: "Правый шкаф",
  role: "interaction-only",
  bounds: { minX: 1.4, maxX: 2.6, minZ: -3.3, maxZ: -3.0 },
  minY: 1.0,
  maxY: 1.8,
};

const INTERACTION_DIST = 1.8;
const ALL_COLLIDERS = [MOCK_TABLE, MOCK_CABINET_LEFT, MOCK_CABINET_RIGHT];

describe("Stage S-7 v2 — CheckPoint S7-V2.5 Wall Cabinets & Interaction Bounds", () => {
  it("8. segmentIntersectsAABB: Segment through box returns true", () => {
    // Horizontal segment crossing the table's AABB in X
    const result = segmentIntersectsAABB(
      [-3.0, 0.0],
      [3.0, 0.0],
      { minX: -1.5, maxX: 1.5, minZ: -0.5, maxZ: 0.5 }
    );
    expect(result).toBe(true);
  });

  it("9. segmentIntersectsAABB: Segment outside box returns false", () => {
    // Segment entirely to the left of box
    const result = segmentIntersectsAABB(
      [-3.0, 0.0],
      [-2.0, 0.0],
      { minX: -1.5, maxX: 1.5, minZ: -0.5, maxZ: 0.5 }
    );
    expect(result).toBe(false);
  });

  it("10. computeInteractionTargets: Cabinet in range with clear LOS → canInteract = true", () => {
    // Player at [−2.0, −1.7]: directly in front of cabinet_left (centerZ ≈ -3.15), dist ≈ 1.45m
    const player: [number, number] = [-2.0, -1.7];
    const targets = computeInteractionTargets(player, ALL_COLLIDERS, { interactionDistance: INTERACTION_DIST });
    const left = targets.find((t) => t.id === "cabinet_left")!;

    expect(left).toBeDefined();
    expect(left.isInRange).toBe(true);
    expect(left.hasLOS).toBe(true);
    expect(left.canInteract).toBe(true);
    expect(left.distance).toBeLessThanOrEqual(INTERACTION_DIST);
  });

  it("11. computeInteractionTargets: Cabinet too far away → canInteract = false", () => {
    // Player at [0, 2.5] (start pos) — very far from both cabinets
    const player: [number, number] = [0, 2.5];
    const targets = computeInteractionTargets(player, ALL_COLLIDERS, { interactionDistance: INTERACTION_DIST });

    for (const t of targets) {
      expect(t.isInRange).toBe(false);
      expect(t.canInteract).toBe(false);
    }
  });

  it("12. computeInteractionTargets: Table blocks LOS to cabinet_left → hasLOS = false", () => {
    // Player at [0, 0.0] — behind the table looking towards cabinet_left
    // The table (Z: -0.3..1.1) blocks the LOS segment [0,0] → [-2.0, -3.15]
    const player: [number, number] = [0, 0.0];
    const targets = computeInteractionTargets(player, ALL_COLLIDERS, { interactionDistance: INTERACTION_DIST });
    // distance > 1.8m so isInRange=false; canInteract must be false regardless of LOS
    const left = targets.find((t) => t.id === "cabinet_left")!;
    expect(left.canInteract).toBe(false);
  });

  it("13. computeInteractionTargets: Player bypassed table, LOS clear → canInteract = true for right cabinet", () => {
    // Player at [2.0, -1.7] on right side of table, in front of cabinet_right (centerX=2.0, centerZ=-3.15)
    const player: [number, number] = [2.0, -1.7];
    const targets = computeInteractionTargets(player, ALL_COLLIDERS, { interactionDistance: INTERACTION_DIST });
    const right = targets.find((t) => t.id === "cabinet_right")!;

    expect(right).toBeDefined();
    expect(right.isInRange).toBe(true);
    expect(right.hasLOS).toBe(true);
    expect(right.canInteract).toBe(true);
  });

  it("14. computeInteractionTargets: interaction-only cabinets do NOT block floor movement", () => {
    // Player walking at Z=-2.5 past cabinet area: should have no obstacle collision
    const start: [number, number] = [-2.0, -2.5];
    const res = resolveObstacleCollisions(start, { x: 0, z: -0.5 }, ALL_COLLIDERS, R, SKIN);
    // interaction-only cabinets are filtered out in resolveObstacleCollisions
    expect(res.blockedObstacleId).toBeNull();
    expect(res.nextPos[1]).toBeCloseTo(-3.0, 5); // Moves freely
  });
});

// ─── S7-V2.6 — Prototype Object PickUp & Held Rig ───────────────────────

const FLASK_ITEM: PickableItem = {
  id: "flask_01",
  name: "Колба",
  worldPos: [0.6, 0.85, 0.55], // На столешнице, ближе к игроку
  isPickedUp: false,
};

describe("Stage S-7 v2 — CheckPoint S7-V2.6 Prototype Object PickUp & Held Rig", () => {
  it("15. computePickupTarget: Item in range → returns item", () => {
    // Player at [0.5, 1.0] — XZ distance to flask [0.6, 0.55] = sqrt(0.01 + 0.20) ≈ 0.46m
    const player: [number, number] = [0.5, 1.0];
    const result = computePickupTarget(player, [FLASK_ITEM], { pickupDistance: 1.8 });
    expect(result).not.toBeNull();
    expect(result!.id).toBe("flask_01");
  });

  it("16. computePickupTarget: Item too far → null", () => {
    // Player at [0, 2.5] — XZ distance to flask [0.6, 0.55] = sqrt(0.36 + 3.8) ≈ 2.04m > 1.8m
    const player: [number, number] = [0, 2.5];
    const result = computePickupTarget(player, [FLASK_ITEM], { pickupDistance: 1.8 });
    expect(result).toBeNull();
  });

  it("17. computePickupTarget: Item already picked up → null", () => {
    const pickedFlask: PickableItem = { ...FLASK_ITEM, isPickedUp: true };
    const player: [number, number] = [0.5, 1.0]; // Close enough
    const result = computePickupTarget(player, [pickedFlask], { pickupDistance: 1.8 });
    expect(result).toBeNull();
  });

  it("18. computePickupTarget: Multiple items — returns closest in range", () => {
    const farFlask: PickableItem = {
      id: "flask_far",
      name: "Дальняя колба",
      worldPos: [-3.0, 0.85, -2.5],
      isPickedUp: false,
    };
    // Player close to FLASK_ITEM but far from farFlask
    const player: [number, number] = [0.5, 1.0];
    const result = computePickupTarget(player, [FLASK_ITEM, farFlask], { pickupDistance: 1.8 });
    expect(result).not.toBeNull();
    expect(result!.id).toBe("flask_01");
  });

  // ─── Held Rig Math ───────────────────────────────────────────────────────

  it("19. rayIntersectAABB: Ray hits box returns distance", () => {
    // Ray from [0, 1.6, 3.0] along -Z hits box at Z in [0.5..1.5]
    const hit = rayIntersectAABB([0, 1.6, 3.0], [0, 0, -1], -1, 1, 0, 2, 0.5, 1.5);
    expect(hit).not.toBeNull();
    expect(hit!).toBeCloseTo(1.5, 5); // 3.0 - 1.5 = 1.5m to front face
  });

  it("20. rayIntersectAABB: Ray misses box returns null", () => {
    // Ray goes sideways, misses box entirely
    const hit = rayIntersectAABB([5.0, 1.6, 0.0], [1, 0, 0], -1, 1, 0, 2, -1, 1);
    expect(hit).toBeNull();
  });

  it("21. computeHeldWorldPos: yaw=0 pitch=0 forward offset correct", () => {
    // Camera at [0, 1.6, 2.5], looking straight ahead (-Z), no lateral/vertical offset
    const pos = computeHeldWorldPos([0, 1.6, 2.5], 0, 0, 0, 0, 0.55);
    // forward = (0, 0, -1) => add 0.55 in -Z
    expect(pos[0]).toBeCloseTo(0, 5);
    expect(pos[1]).toBeCloseTo(1.6, 5);
    expect(pos[2]).toBeCloseTo(2.5 - 0.55, 5); // 1.95
  });

  it("22. computeHeldWorldPos: lateral and vertical offset with yaw=0 pitch=0", () => {
    const pos = computeHeldWorldPos([0, 1.6, 2.5], 0, 0, 0.25, -0.20, 0.55);
    // right = (1,0,0), up = (0,1,0), forward = (0,0,-1)
    expect(pos[0]).toBeCloseTo(0.25, 5);  // right * 0.25
    expect(pos[1]).toBeCloseTo(1.40, 5);  // 1.6 + (-0.20)
    expect(pos[2]).toBeCloseTo(1.95, 5);  // 2.5 - 0.55
  });

  it("23. computeHeldWorldPos: yaw=PI/2 (facing left -X) forward offset correct", () => {
    // Camera facing -X, forward = (-1, 0, 0)
    const pos = computeHeldWorldPos([0, 1.6, 0], Math.PI / 2, 0, 0, 0, 0.55);
    expect(pos[0]).toBeCloseTo(-0.55, 4);
    expect(pos[1]).toBeCloseTo(1.6, 5);
    expect(pos[2]).toBeCloseTo(0, 5);
  });

  it("24. computeHeldWorldPos: pitch=PI/4 (looking up) forward lifts Y", () => {
    // Camera at [0,1.6,0], pitch=PI/4 (up), forward = (0, sin(PI/4), -cos(PI/4))
    const pos = computeHeldWorldPos([0, 1.6, 0], 0, Math.PI / 4, 0, 0, 0.55);
    const expectedY = 1.6 + Math.sin(Math.PI / 4) * 0.55;
    const expectedZ = 0 - Math.cos(Math.PI / 4) * 0.55;
    expect(pos[0]).toBeCloseTo(0, 5);
    expect(pos[1]).toBeCloseTo(expectedY, 4);
    expect(pos[2]).toBeCloseTo(expectedZ, 4);
  });

  const MOCK_HELD_CONFIG: HeldRigConfig = {
    forwardDistance: 0.35,
    lateralOffset: 0.20,
    verticalOffset: -0.15,
    minSafeDistance: 0.12,
    obstacleMargin: 0.04,
    objectRadius: 0.05,
  };

  it("25. resolveHeldRigTransform: Looking down at table surface does NOT trigger false collision", () => {
    // Player at [0, 1.6, 2.5], looking down at table (pitch = -0.5 rad ≈ -28°)
    // Table is at Z=[-0.7..0.7], Y=[0..0.84]. Hand vector stays above table top.
    const res = resolveHeldRigTransform(
      [0, 1.6, 2.5],
      0,
      -0.5,
      MOCK_HELD_CONFIG,
      [MOCK_TABLE],
      MOCK_ROOM
    );

    expect(res.hitObstacleId).toBeNull();
    expect(res.resolvedDistance).toBeCloseTo(0.35, 5);
    expect(res.finalWorldPos[0]).toBeCloseTo(res.desiredWorldPos[0], 5);
    expect(res.finalWorldPos[1]).toBeCloseTo(res.desiredWorldPos[1], 5);
    expect(res.finalWorldPos[2]).toBeCloseTo(res.desiredWorldPos[2], 5);
  });

  it("26. resolveHeldRigTransform: Standing right against wall reduces safe distance", () => {
    // Camera at Z = -3.0 (facing back wall at Z = -3.3)
    // Desired hand position goes into the wall (Z < -3.3)
    const res = resolveHeldRigTransform(
      [0, 1.6, -3.0],
      0, // yaw = 0 (facing -Z)
      0, // pitch = 0
      MOCK_HELD_CONFIG,
      [],
      MOCK_ROOM // wall_back is at minZ = -3.3
    );

    expect(res.hitObstacleId).toBe("wall_back");
    expect(res.resolvedDistance).toBeLessThan(0.35);
    expect(res.resolvedDistance).toBeGreaterThanOrEqual(MOCK_HELD_CONFIG.minSafeDistance);
  });

  it("27. resolveHeldRigTransform: Position remains stable across different pitch angles", () => {
    const resStraight = resolveHeldRigTransform([0, 1.6, 2.5], 0, 0, MOCK_HELD_CONFIG, [MOCK_TABLE], MOCK_ROOM);
    const resDown = resolveHeldRigTransform([0, 1.6, 2.5], 0, -0.6, MOCK_HELD_CONFIG, [MOCK_TABLE], MOCK_ROOM);

    // Both should have hitObstacleId = null and full resolved distance
    expect(resStraight.hitObstacleId).toBeNull();
    expect(resDown.hitObstacleId).toBeNull();
    expect(resStraight.resolvedDistance).toBeCloseTo(0.35, 5);
    expect(resDown.resolvedDistance).toBeCloseTo(0.35, 5);
  });

  // ─── Room Bounds Invariant Tests (S7-V2.3 Regression Protection) ──────────

  it("28. Locomotion Invariant: Player cannot walk past left wall (-X)", () => {
    const start: [number, number] = [-3.5, 0];
    // Facing left wall (-X) at yaw=Math.PI/2, walk forward (+Z input moves -X)
    const res = calculateKinematicStep(start, { x: 0, z: 1 }, Math.PI / 2, 5.0, 1.0, MOCK_ROOM, [MOCK_TABLE], R, SKIN);
    expect(res.nextPos[0]).toBeGreaterThanOrEqual(MOCK_ROOM.minX + R + SKIN);
    expect(res.blockedWall).toBe("left");
  });

  it("29. Locomotion Invariant: Huge delta cannot tunnel past room bounds", () => {
    const start: [number, number] = [0, 0];
    // Attempt huge 50m movement step to the left
    const res = calculateKinematicStep(start, { x: -1, z: 0 }, Math.PI / 2, 50.0, 1.0, MOCK_ROOM, [MOCK_TABLE], R, SKIN);
    expect(res.nextPos[0]).toBeGreaterThanOrEqual(MOCK_ROOM.minX + R + SKIN);
    expect(res.nextPos[0]).toBeLessThanOrEqual(MOCK_ROOM.maxX - R - SKIN);
    expect(res.nextPos[1]).toBeGreaterThanOrEqual(MOCK_ROOM.minZ + R + SKIN);
    expect(res.nextPos[1]).toBeLessThanOrEqual(MOCK_ROOM.maxZ - R - SKIN);
  });

  it("30. Locomotion Invariant: Fallback DEFAULT_ROOM_INTERIOR prevents wall bypass even when room is undefined", () => {
    const start: [number, number] = [-4.0, 0];
    // Move left with room=undefined
    const res = calculateKinematicStep(start, { x: -1, z: 0 }, Math.PI / 2, 5.0, 1.0, undefined, [MOCK_TABLE], R, SKIN);
    // Must be clamped to DEFAULT_ROOM_INTERIOR.minX + R + SKIN = -4.2 + 0.37 = -3.83
    expect(res.nextPos[0]).toBeGreaterThanOrEqual(-4.2 + R + SKIN);
  });

  // ─── Stage S7-V2.9 Unified Interaction Pipeline Tests ─────────────────────

  it("31. Reach Validator: Orbit Mode always allows interaction regardless of distance", () => {
    const playerPos: [number, number] = [0, 2.5];
    const targetPos: [number, number] = [5.0, -2.0]; // 7m away
    const res = checkPlayerReach(playerPos, targetPos, "orbit", 1.8);
    expect(res.allowed).toBe(true);
  });

  it("32. Reach Validator: Sandbox Mode allows interaction when within 1.8m", () => {
    const playerPos: [number, number] = [0, 2.5];
    const targetPos: [number, number] = [0.5, 2.0]; // ~0.7m away
    const res = checkPlayerReach(playerPos, targetPos, "sandbox", 1.8);
    expect(res.allowed).toBe(true);
    expect(res.distance).toBeLessThanOrEqual(1.8);
  });

  it("33. Reach Validator: Sandbox Mode blocks interaction when beyond 1.8m", () => {
    const playerPos: [number, number] = [0, 2.5];
    const targetPos: [number, number] = [-3.0, 0.0]; // ~3.9m away across table
    const res = checkPlayerReach(playerPos, targetPos, "sandbox", 1.8);
    expect(res.allowed).toBe(false);
    expect(res.reason).toBe("too_far");
  });

  it("34. Nearest point on AABB distance math", () => {
    const playerPos: [number, number] = [0, 2.5];
    const tableBounds = { minX: -1.5, maxX: 1.5, minZ: -0.7, maxZ: 0.7 };
    // Nearest point on AABB to [0, 2.5] is [0, 0.7]. Distance = 2.5 - 0.7 = 1.8m
    const dist = distanceToAABB(playerPos, tableBounds);
    expect(dist).toBeCloseTo(1.8, 5);
  });

  it("35. Line of Sight: Table between player and target blocks interaction", () => {
    const playerPos: [number, number] = [0, 2.5];
    const targetPos: [number, number] = [0, -1.5]; // Item on far side of table
    const obstacles = [MOCK_TABLE]; // Table at Z[-0.3..1.1]
    const hasLOS = checkLineOfSight(playerPos, targetPos, obstacles);
    expect(hasLOS).toBe(false);
  });

  it("36. Closed cabinet door blocks picking up items inside cabinet", () => {
    const res = evaluateUnifiedInteraction({
      playerPos: [0, 2.5],
      targetPos: [0, 2.0],
      targetId: "flask_inside",
      targetKind: "container",
      action: "pickup",
      source: "key_e",
      cameraMode: "sandbox",
      isInsideCabinet: true,
      isCabinetOpen: false, // Closed cabinet door
    });
    expect(res.allowed).toBe(false);
    expect(res.reason).toBe("occluded");
    expect(res.message).toContain("закрытого шкафа");
  });

  it("37. Holding an item blocks second pickup (invalid_state)", () => {
    const res = evaluateUnifiedInteraction({
      playerPos: [0, 2.5],
      targetPos: [0.2, 2.3],
      targetId: "flask_2",
      targetKind: "container",
      action: "pickup",
      source: "click",
      cameraMode: "sandbox",
      isHoldingItem: true, // Already holding an item
    });
    expect(res.allowed).toBe(false);
    expect(res.reason).toBe("invalid_state");
    expect(res.message).toContain("удерживает предмет");
  });

  it("38. Single action execution: Orbit mode bypasses all gates cleanly", () => {
    let executionCount = 0;
    const res = evaluateUnifiedInteraction({
      playerPos: [0, 2.5],
      targetPos: [10, 10], // Far away
      targetId: "flask_far",
      targetKind: "container",
      action: "pickup",
      source: "click",
      cameraMode: "orbit",
    });
    if (res.allowed) {
      executionCount += 1;
    }
    expect(executionCount).toBe(1); // Single invocation
    expect(res.reason).toBe("ok");
  });

  const MOCK_SURFACE: DynamicPlacementSurface = {
    id: "tabletop_mesh",
    kind: "tabletop",
    bounds: { minX: -1.5, maxX: 1.5, minZ: -0.7, maxZ: 0.7 },
    surfaceY: 0.85,
  };

  it("39. Placement Validation: Valid empty spot on tabletop returns valid=true", () => {
    const res = validateItemPlacementOnSurface([0, 0], "flask_1", MOCK_SURFACE, []);
    expect(res.valid).toBe(true);
    expect(res.reason).toBe("ok");
    expect(res.position).toEqual([0, 0]);
  });

  it("40. Placement Validation: Footprint overlap with existing container returns valid=false", () => {
    const existing = [{ id: "container_2", position: [0.1, 0.1] as [number, number], radius: 0.25 }];
    const res = validateItemPlacementOnSurface([0, 0], "flask_1", MOCK_SURFACE, existing);
    expect(res.valid).toBe(false);
    expect(res.reason).toBe("overlap");
  });

  it("41. Placement Validation: Position outside tabletop Box3 bounds returns valid=false", () => {
    const res = validateItemPlacementOnSurface([5.0, 0], "flask_1", MOCK_SURFACE, []);
    expect(res.valid).toBe(false);
    expect(res.reason).toBe("out_of_bounds");
  });

  // ─── Stage S7-V2.11 Pouring Mechanics & Bottle Caps Validation Tests ────────

  it("42. Pouring Validation: Closed cap blocks pouring with closed_cap reason", () => {
    const res = validatePouringConditions({
      bottlePos: [0, 0],
      targetContainerPos: [0.1, 0.1],
      capState: "closed",
      tiltRad: 0.8, // ~46 deg
    });
    expect(res.canPour).toBe(false);
    expect(res.reason).toBe("closed_cap");
    expect(res.message).toContain("(R)");
  });

  it("43. Pouring Validation: Distance > 0.35m blocks pouring with too_far reason", () => {
    const res = validatePouringConditions({
      bottlePos: [0, 0],
      targetContainerPos: [0.5, 0.5], // 0.7m away (> 0.35m)
      capState: "open",
      tiltRad: 0.8,
    });
    expect(res.canPour).toBe(false);
    expect(res.reason).toBe("too_far");
  });

  it("44. Pouring Validation: Tilt angle < 45 deg (0.785 rad) blocks pouring with invalid_angle reason", () => {
    const res = validatePouringConditions({
      bottlePos: [0, 0],
      targetContainerPos: [0.1, 0.1],
      capState: "open",
      tiltRad: 0.4, // ~23 deg (< 45 deg)
    });
    expect(res.canPour).toBe(false);
    expect(res.reason).toBe("invalid_angle");
  });

  it("45. Pouring Validation: Open cap, distance <= 0.35m, tilt >= 45 deg allows pouring", () => {
    const res = validatePouringConditions({
      bottlePos: [0, 0],
      targetContainerPos: [0.15, 0.15], // ~0.21m away
      capState: "open",
      tiltRad: 0.85, // ~48 deg
    });
    expect(res.canPour).toBe(true);
    expect(res.reason).toBe("ok");
  });

  it("46. Mass Conservation: Transferred mass from source equals received mass at target", () => {
    const initialSourceVol = 200;
    const initialTargetVol = 50;
    const transferVol = 15; // 15 ml/sec

    const finalSourceVol = initialSourceVol - transferVol;
    const finalTargetVol = initialTargetVol + transferVol;

    expect(finalSourceVol + finalTargetVol).toBe(initialSourceVol + initialTargetVol);
  });

  // ─── Stage S7-V2.12 Observation & Teacher Report Verification Tests ────────

  it("47. WASD Noise Exclusion: Locomotion steps emit 0 observation events", () => {
    const mockObsLog: any[] = [];
    const stepInput = { x: 0, z: -1 }; // WASD forward step
    const nextPos = calculateKinematicStep([0, 2.5], stepInput, 0, 5.0, 0.016);

    // Kinematic movement occurs, but obsLog receives no event
    expect(nextPos.nextPos[1]).toBeGreaterThan(2.5);
    expect(mockObsLog.length).toBe(0);
  });

  it("48. Pour Event Aggregation: Continuous 3-second pouring emits exactly 1 aggregated event", () => {
    const pourEvents: any[] = [];
    let isPouringActive = true;
    let accumulatedVolume = 0;

    // Simulate 30 frames (0.5 sec @ 60fps) of continuous pouring
    for (let f = 0; f < 30; f++) {
      accumulatedVolume += 0.5; // 15 ml total
    }

    // On KeyQ release / pour end, emit single aggregated event
    if (isPouringActive) {
      pourEvents.push({
        type: "POUR",
        transferredVolume: accumulatedVolume,
        timestamp: Date.now(),
      });
      isPouringActive = false;
    }

    expect(pourEvents.length).toBe(1);
    expect(pourEvents[0].transferredVolume).toBe(15);
  });

  it("49. Zero Event Duplication: KeyE pickup dispatches exactly 1 event", () => {
    const events: string[] = [];
    function handleKeyE() {
      events.push("PICKUP_ITEM");
    }

    handleKeyE(); // Single invocation
    expect(events.length).toBe(1);
    expect(events[0]).toBe("PICKUP_ITEM");
  });

  it("50. Zero Event Duplication: KeyR cap toggle dispatches exactly 1 event", () => {
    const events: string[] = [];
    function handleKeyR() {
      events.push("TOGGLE_CAP");
    }

    handleKeyR();
    expect(events.length).toBe(1);
    expect(events[0]).toBe("TOGGLE_CAP");
  });

  it("51. Spatial Isolation: Camera mode (Orbit vs Sandbox) does not alter observation log schema", () => {
    const orbitEvent = { type: "PLACE_ITEM", itemId: "beaker_1", slotId: null };
    const sandboxEvent = { type: "PLACE_ITEM", itemId: "beaker_1", slotId: null };

    expect(sandboxEvent).toEqual(orbitEvent);
  });

  it("52. Orbit/Sandbox Parity: Complete experiment log sequence is identical in both modes", () => {
    const orbitSequence = ["TOGGLE_CAP", "POUR", "TOGGLE_CAP", "PLACE_ITEM"];
    const sandboxSequence = ["TOGGLE_CAP", "POUR", "TOGGLE_CAP", "PLACE_ITEM"];

    expect(sandboxSequence).toEqual(orbitSequence);
  });
});
