/**
 * Stage S-7 v2 — Sandbox Locomotion & Dynamic Room Bounds Helper (S7-V2.3)
 * Provides pure kinematic vector math, dynamic room interior boundary extraction,
 * spawn validation, and sliding wall collision resolution.
 */

export interface Vector2D {
  x: number;
  z: number;
}

export interface RoomInteriorBounds {
  minX: number; // Левая внутренняя грань (max.x левой стены)
  maxX: number; // Правая внутренняя грань (min.x правой стены)
  minZ: number; // Задняя внутренняя грань (max.z задней стены)
  maxZ: number; // Передняя внутренняя грань (min.z передней стены)
}

export function computeDirectionVectors(yawRad: number): {
  forward: Vector2D;
  right: Vector2D;
} {
  const sinYaw = Math.sin(yawRad);
  const cosYaw = Math.cos(yawRad);

  return {
    forward: { x: -sinYaw, z: -cosYaw },
    right: { x: cosYaw, z: -sinYaw },
  };
}

export function computeWorldMovementVector(
  inputVec: Vector2D,
  yawRad: number
): Vector2D {
  if (inputVec.x === 0 && inputVec.z === 0) return { x: 0, z: 0 };

  const len = Math.sqrt(inputVec.x * inputVec.x + inputVec.z * inputVec.z);
  const normX = inputVec.x / Math.max(1, len);
  const normZ = inputVec.z / Math.max(1, len);

  const { forward, right } = computeDirectionVectors(yawRad);

  const worldX = normX * right.x + normZ * forward.x;
  const worldZ = normX * right.z + normZ * forward.z;

  const worldLen = Math.sqrt(worldX * worldX + worldZ * worldZ);
  if (worldLen > 1) {
    return { x: worldX / worldLen, z: worldZ / worldLen };
  }

  return { x: worldX, z: worldZ };
}

/**
 * Валидация стартовой позиции спавна игрока внутри объёма комнаты
 */
export function isValidSpawnPosition(
  pos: [number, number],
  room: RoomInteriorBounds,
  playerRadius: number,
  skinWidth: number
): boolean {
  const minAllowedX = room.minX + playerRadius + skinWidth;
  const maxAllowedX = room.maxX - playerRadius - skinWidth;
  const minAllowedZ = room.minZ + playerRadius + skinWidth;
  const maxAllowedZ = room.maxZ - playerRadius - skinWidth;

  return (
    pos[0] >= minAllowedX &&
    pos[0] <= maxAllowedX &&
    pos[1] >= minAllowedZ &&
    pos[1] <= maxAllowedZ
  );
}

/**
 * Определение кинематического шага с полным предотвращением вылета за стены (Wall Collision Sliding & Clamping)
 */
export function resolveWallCollisions(
  currentPos: [number, number],
  requestedDelta: Vector2D,
  room: RoomInteriorBounds,
  playerRadius: number,
  skinWidth: number
): {
  nextPos: [number, number];
  resolvedDelta: Vector2D;
  blockedWall: "none" | "left" | "right" | "back" | "front" | "corner";
} {
  const minAllowedX = room.minX + playerRadius + skinWidth;
  const maxAllowedX = room.maxX - playerRadius - skinWidth;
  const minAllowedZ = room.minZ + playerRadius + skinWidth;
  const maxAllowedZ = room.maxZ - playerRadius - skinWidth;

  let nextX = currentPos[0] + requestedDelta.x;
  let nextZ = currentPos[1] + requestedDelta.z;
  let blockedX: "none" | "left" | "right" = "none";
  let blockedZ: "none" | "back" | "front" = "none";

  // Ограничение по оси X (Левая / Правая стена)
  if (nextX < minAllowedX) {
    nextX = minAllowedX;
    blockedX = "left";
  } else if (nextX > maxAllowedX) {
    nextX = maxAllowedX;
    blockedX = "right";
  }

  // Ограничение по оси Z (Задняя / Передняя стена)
  if (nextZ < minAllowedZ) {
    nextZ = minAllowedZ;
    blockedZ = "back";
  } else if (nextZ > maxAllowedZ) {
    nextZ = maxAllowedZ;
    blockedZ = "front";
  }

  let blockedWall: "none" | "left" | "right" | "back" | "front" | "corner" = "none";
  if (blockedX !== "none" && blockedZ !== "none") {
    blockedWall = "corner";
  } else if (blockedX !== "none") {
    blockedWall = blockedX;
  } else if (blockedZ !== "none") {
    blockedWall = blockedZ;
  }

  const resolvedDelta: Vector2D = {
    x: nextX - currentPos[0],
    z: nextZ - currentPos[1],
  };

  return {
    nextPos: [nextX, nextZ],
    resolvedDelta,
    blockedWall,
  };
}

export function calculateKinematicStep(
  currentPos: [number, number],
  inputVec: Vector2D,
  yawRad: number,
  speed: number,
  deltaSec: number,
  room?: RoomInteriorBounds,
  playerRadius: number = 0.35,
  skinWidth: number = 0.02
): {
  nextPos: [number, number];
  requestedDelta: Vector2D;
  resolvedDelta: Vector2D;
  blockedWall: "none" | "left" | "right" | "back" | "front" | "corner";
} {
  const worldMove = computeWorldMovementVector(inputVec, yawRad);
  const dist = speed * deltaSec;

  const requestedDelta: Vector2D = {
    x: worldMove.x * dist,
    z: worldMove.z * dist,
  };

  if (!room) {
    const nextPos: [number, number] = [
      currentPos[0] + requestedDelta.x,
      currentPos[1] + requestedDelta.z,
    ];
    return {
      nextPos,
      requestedDelta,
      resolvedDelta: requestedDelta,
      blockedWall: "none",
    };
  }

  const resolved = resolveWallCollisions(
    currentPos,
    requestedDelta,
    room,
    playerRadius,
    skinWidth
  );

  return {
    ...resolved,
    requestedDelta,
  };
}
