/**
 * Stage S-7 v2 — Sandbox Locomotion & Universal Obstacle Collisions (S7-V2.4)
 * Provides pure kinematic vector math, room bounds clamping, tunneling protection (substepping),
 * and universal "floor-obstacle" Box3 collision resolution with kinematic sliding.
 */

export interface Vector2D {
  x: number;
  z: number;
}

export type CollisionRole =
  | "room-boundary"     // Границы стен комнаты
  | "floor-obstacle"    // Напольные коллизионные объекты (столы, тумбы)
  | "interaction-only"  // Настенные шкафы (для reach-дистанции <= 1.8m, но без напольной коллизии)
  | "non-collidable";   // Декоративные визуальные меши

export interface RegisteredCollider {
  id: string;
  name: string;
  role: CollisionRole;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  minY: number;
  maxY: number;
}

export interface RoomInteriorBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
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
 * Валидация спавна игрока с учётом комнат и всех floor-obstacle препятствий
 */
export function isValidSpawnPosition(
  pos: [number, number],
  room: RoomInteriorBounds,
  obstacles: RegisteredCollider[] = [],
  playerRadius: number = 0.35,
  skinWidth: number = 0.02
): boolean {
  const minAllowedX = room.minX + playerRadius + skinWidth;
  const maxAllowedX = room.maxX - playerRadius - skinWidth;
  const minAllowedZ = room.minZ + playerRadius + skinWidth;
  const maxAllowedZ = room.maxZ - playerRadius - skinWidth;

  if (
    pos[0] < minAllowedX ||
    pos[0] > maxAllowedX ||
    pos[1] < minAllowedZ ||
    pos[1] > maxAllowedZ
  ) {
    return false;
  }

  // Проверка пересечения со всеми floor-obstacle
  for (const obs of obstacles) {
    if (obs.role !== "floor-obstacle") continue;

    const expMinX = obs.bounds.minX - playerRadius - skinWidth;
    const expMaxX = obs.bounds.maxX + playerRadius + skinWidth;
    const expMinZ = obs.bounds.minZ - playerRadius - skinWidth;
    const expMaxZ = obs.bounds.maxZ + playerRadius + skinWidth;

    if (
      pos[0] > expMinX &&
      pos[0] < expMaxX &&
      pos[1] > expMinZ &&
      pos[1] < expMaxZ
    ) {
      return false;
    }
  }

  return true;
}

/**
 * Разрешение коллизий со стенами комнаты (Room Boundary Clamping)
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

  if (nextX < minAllowedX) {
    nextX = minAllowedX;
    blockedX = "left";
  } else if (nextX > maxAllowedX) {
    nextX = maxAllowedX;
    blockedX = "right";
  }

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

  return {
    nextPos: [nextX, nextZ],
    resolvedDelta: { x: nextX - currentPos[0], z: nextZ - currentPos[1] },
    blockedWall,
  };
}

/**
 * Универсальное разрешение кинематических коллизий напольной мебели (Universal Floor Obstacles)
 * Позволяет кинематически скользить вдоль граней любых объектов роли "floor-obstacle".
 */
export function resolveObstacleCollisions(
  currentPos: [number, number],
  requestedDelta: Vector2D,
  obstacles: RegisteredCollider[],
  playerRadius: number,
  skinWidth: number
): {
  nextPos: [number, number];
  resolvedDelta: Vector2D;
  blockedObstacleId: string | null;
  blockedSide: "none" | "front" | "back" | "left" | "right" | "corner";
} {
  let posX = currentPos[0];
  let posZ = currentPos[1];
  let targetX = posX + requestedDelta.x;
  let targetZ = posZ + requestedDelta.z;

  let blockedObstacleId: string | null = null;
  let blockedSide: "none" | "front" | "back" | "left" | "right" | "corner" = "none";

  const activeObstacles = obstacles.filter((o) => o.role === "floor-obstacle");

  // Независимая проверка и отсечение оси X
  for (const obs of activeObstacles) {
    const expMinX = obs.bounds.minX - playerRadius - skinWidth;
    const expMaxX = obs.bounds.maxX + playerRadius + skinWidth;
    const expMinZ = obs.bounds.minZ - playerRadius - skinWidth;
    const expMaxZ = obs.bounds.maxZ + playerRadius + skinWidth;

    // Проверяем, находится ли текущий Z внутри расширенной Z-зоны препятствия
    if (posZ > expMinZ && posZ < expMaxZ) {
      // Попытка шагнуть влево сквозь правую грань объекта
      if (posX >= expMaxX && targetX < expMaxX) {
        targetX = expMaxX;
        blockedObstacleId = obs.id;
        blockedSide = "right";
      }
      // Попытка шагнуть вправо сквозь левую грань объекта
      else if (posX <= expMinX && targetX > expMinX) {
        targetX = expMinX;
        blockedObstacleId = obs.id;
        blockedSide = "left";
      }
    }
  }

  // Независимая проверка и отсечение оси Z
  for (const obs of activeObstacles) {
    const expMinX = obs.bounds.minX - playerRadius - skinWidth;
    const expMaxX = obs.bounds.maxX + playerRadius + skinWidth;
    const expMinZ = obs.bounds.minZ - playerRadius - skinWidth;
    const expMaxZ = obs.bounds.maxZ + playerRadius + skinWidth;

    // Проверяем, находится ли обновлённый X (targetX) внутри расширенной X-зоны
    if (targetX > expMinX && targetX < expMaxX) {
      // Попытка шагнуть назад (вперёд по Z) сквозь переднюю грань (minZ)
      if (posZ <= expMinZ && targetZ > expMinZ) {
        targetZ = expMinZ;
        blockedObstacleId = obs.id;
        blockedSide = blockedSide !== "none" ? "corner" : "front";
      }
      // Попытка шагнуть вперёд (назад по Z) сквозь заднюю грань (maxZ)
      else if (posZ >= expMaxZ && targetZ < expMaxZ) {
        targetZ = expMaxZ;
        blockedObstacleId = obs.id;
        blockedSide = blockedSide !== "none" ? "corner" : "back";
      }
    }
  }

  return {
    nextPos: [targetX, targetZ],
    resolvedDelta: { x: targetX - currentPos[0], z: targetZ - currentPos[1] },
    blockedObstacleId,
    blockedSide,
  };
}

/**
 * Главный кинематический шаг с поддержкой субстеппинга (Substepping) против туннелирования
 */
export function calculateKinematicStep(
  currentPos: [number, number],
  inputVec: Vector2D,
  yawRad: number,
  speed: number,
  deltaSec: number,
  room?: RoomInteriorBounds,
  obstacles: RegisteredCollider[] = [],
  playerRadius: number = 0.35,
  skinWidth: number = 0.02
): {
  nextPos: [number, number];
  requestedDelta: Vector2D;
  resolvedDelta: Vector2D;
  blockedWall: "none" | "left" | "right" | "back" | "front" | "corner";
  blockedObstacleId: string | null;
  blockedObstacleSide: "none" | "front" | "back" | "left" | "right" | "corner";
} {
  const worldMove = computeWorldMovementVector(inputVec, yawRad);
  const totalDist = speed * deltaSec;

  const requestedDelta: Vector2D = {
    x: worldMove.x * totalDist,
    z: worldMove.z * totalDist,
  };

  // Вычисление субстеппинга для защиты от туннелирования
  const maxSubStepDist = Math.max(0.05, playerRadius * 0.5);
  const numSubSteps = Math.max(1, Math.ceil(totalDist / maxSubStepDist));
  const subDelta: Vector2D = {
    x: requestedDelta.x / numSubSteps,
    z: requestedDelta.z / numSubSteps,
  };

  let currPos: [number, number] = [currentPos[0], currentPos[1]];
  let finalBlockedWall: "none" | "left" | "right" | "back" | "front" | "corner" = "none";
  let finalBlockedObstacleId: string | null = null;
  let finalBlockedObstacleSide: "none" | "front" | "back" | "left" | "right" | "corner" = "none";

  for (let i = 0; i < numSubSteps; i++) {
    // 2. Коллизии с напольной мебелью (floor-obstacle)
    const obsRes = resolveObstacleCollisions(
      currPos,
      subDelta,
      obstacles,
      playerRadius,
      skinWidth
    );

    // 3. Коллизии со стенами комнаты (Room Boundaries)
    let wallRes: { nextPos: [number, number]; blockedWall: "none" | "left" | "right" | "back" | "front" | "corner" } = { nextPos: obsRes.nextPos, blockedWall: "none" };
    if (room) {
      const deltaFromObs: Vector2D = {
        x: obsRes.nextPos[0] - currPos[0],
        z: obsRes.nextPos[1] - currPos[1],
      };
      const wRes = resolveWallCollisions(currPos, deltaFromObs, room, playerRadius, skinWidth);
      wallRes = { nextPos: wRes.nextPos, blockedWall: wRes.blockedWall };
      if (wRes.blockedWall !== "none") finalBlockedWall = wRes.blockedWall;
    }

    if (obsRes.blockedObstacleId) {
      finalBlockedObstacleId = obsRes.blockedObstacleId;
      finalBlockedObstacleSide = obsRes.blockedSide;
    }

    currPos = obsRes.nextPos;
  }

  return {
    nextPos: currPos,
    requestedDelta,
    resolvedDelta: { x: currPos[0] - currentPos[0], z: currPos[1] - currentPos[1] },
    blockedWall: finalBlockedWall,
    blockedObstacleId: finalBlockedObstacleId,
    blockedObstacleSide: finalBlockedObstacleSide,
  };
}
