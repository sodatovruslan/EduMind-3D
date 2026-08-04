/**
 * Stage S-7 v2 — Sandbox Locomotion, Obstacle Collisions & Interaction Bounds (S7-V2.5)
 * Provides pure kinematic vector math, room bounds clamping, tunneling protection (substepping),
 * universal "floor-obstacle" Box3 collision resolution with kinematic sliding,
 * and "interaction-only" reach/LOS detection for wall cabinets.
 */

import type { CameraMode, InteractionCheckResult } from "./chemistry-lab-modes";

export interface Vector2D {
  x: number;
  z: number;
}

export type CollisionRole =
  | "room-boundary"     // Границы стен комнаты
  | "floor-obstacle"    // Напольные коллизионные объекты (столы, тумбы)
  | "interaction-only"  // Настенные шкафы (для reach-дистанции <= 1.8m, но без напольной коллизии)
  | "non-collidable";   // Декоративные визуальные меши

export const SANDBOX_CONFIG = {
  interactionDistance: 1.8,
  eyeHeight: 1.5,
  defaultFov: 65,
  playerRadius: 0.20,
  skinWidth: 0.01,
};

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
  playerRadius: number = 0.20,
  skinWidth: number = 0.01
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

export const DEFAULT_ROOM_INTERIOR: RoomInteriorBounds = {
  minX: -4.2,
  maxX: 4.2,
  minZ: -3.2,
  maxZ: 3.2,
};

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
  playerRadius: number = 0.20,
  skinWidth: number = 0.01
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

  // Использование переданных границ или глобального дефолта
  const effectiveRoom = room ?? DEFAULT_ROOM_INTERIOR;

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
    // 1. Коллизии с напольной мебелью (floor-obstacle)
    const obsRes = resolveObstacleCollisions(
      currPos,
      subDelta,
      obstacles,
      playerRadius,
      skinWidth
    );

    // 2. Коллизии со стенами комнаты (Room Boundaries)
    const deltaFromObs: Vector2D = {
      x: obsRes.nextPos[0] - currPos[0],
      z: obsRes.nextPos[1] - currPos[1],
    };
    const wallRes = resolveWallCollisions(currPos, deltaFromObs, effectiveRoom, playerRadius, skinWidth);
    if (wallRes.blockedWall !== "none") finalBlockedWall = wallRes.blockedWall;

    if (obsRes.blockedObstacleId) {
      finalBlockedObstacleId = obsRes.blockedObstacleId;
      finalBlockedObstacleSide = obsRes.blockedSide;
    }

    // ВАЖНО: позиция на каждом подшаге обновляется результатом РАЗРЕШЕНИЯ СТЕН
    currPos = wallRes.nextPos;
  }

  // 3. Жёсткая проверка инварианта позиционирования (Requirement 3)
  const minAllowedX = effectiveRoom.minX + playerRadius + skinWidth;
  const maxAllowedX = effectiveRoom.maxX - playerRadius - skinWidth;
  const minAllowedZ = effectiveRoom.minZ + playerRadius + skinWidth;
  const maxAllowedZ = effectiveRoom.maxZ - playerRadius - skinWidth;

  if (currPos[0] < minAllowedX || currPos[0] > maxAllowedX || currPos[1] < minAllowedZ || currPos[1] > maxAllowedZ) {
    console.error(`[CRITICAL_LOCOMOTION_VIOLATION] Position [${currPos[0]}, ${currPos[1]}] out of bounds X[${minAllowedX}..${maxAllowedX}] Z[${minAllowedZ}..${maxAllowedZ}]. Enforcing invariant clamp.`);
    currPos[0] = Math.max(minAllowedX, Math.min(maxAllowedX, currPos[0]));
    currPos[1] = Math.max(minAllowedZ, Math.min(maxAllowedZ, currPos[1]));
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

// ─── S7-V2.5: Interaction Bounds (Wall Cabinets) ─────────────────────────────

export interface InteractionTarget {
  id: string;
  name: string;
  distance: number;      // Дистанция от игрока до центра шкафа (XZ)
  isInRange: boolean;    // distance <= interactionDistance
  hasLOS: boolean;       // Нет floor-obstacle, перекрывающего отрезок игрок→шкаф
  canInteract: boolean;  // isInRange && hasLOS
  centerX: number;
  centerZ: number;
}

/**
 * Проверяет пересечение 2D-отрезка [p1→p2] с прямоугольником AABB.
 * Используется для LOS-проверки: блокирует ли floor-obstacle прямую видимость
 * от игрока до шкафа (interaction-only).
 */
export function segmentIntersectsAABB(
  p1: [number, number],
  p2: [number, number],
  box: { minX: number; maxX: number; minZ: number; maxZ: number }
): boolean {
  // Cohen–Sutherland / параметрическое отсечение Liang–Barsky
  const dx = p2[0] - p1[0];
  const dz = p2[1] - p1[1];

  let tMin = 0;
  let tMax = 1;

  // Отсечение по X
  if (Math.abs(dx) < 1e-9) {
    // Вертикальный отрезок (по Z)
    if (p1[0] < box.minX || p1[0] > box.maxX) return false;
  } else {
    const t1 = (box.minX - p1[0]) / dx;
    const t2 = (box.maxX - p1[0]) / dx;
    tMin = Math.max(tMin, Math.min(t1, t2));
    tMax = Math.min(tMax, Math.max(t1, t2));
    if (tMin > tMax) return false;
  }

  // Отсечение по Z
  if (Math.abs(dz) < 1e-9) {
    // Горизонтальный отрезок (по X)
    if (p1[1] < box.minZ || p1[1] > box.maxZ) return false;
  } else {
    const t1 = (box.minZ - p1[1]) / dz;
    const t2 = (box.maxZ - p1[1]) / dz;
    tMin = Math.max(tMin, Math.min(t1, t2));
    tMax = Math.min(tMax, Math.max(t1, t2));
    if (tMin > tMax) return false;
  }

  return true;
}

/**
 * Вычисляет список интерактивных целей (interaction-only шкафов) в зоне досягаемости.
 * Учитывает дистанцию и LOS-проверку через floor-obstacle коллайдеры.
 */
export function computeInteractionTargets(
  playerPos: [number, number],
  colliders: RegisteredCollider[],
  config: { interactionDistance: number }
): InteractionTarget[] {
  const { interactionDistance } = config;

  const interactables = colliders.filter((c) => c.role === "interaction-only");
  const floorObstacles = colliders.filter((c) => c.role === "floor-obstacle");

  return interactables.map((cab) => {
    const centerX = (cab.bounds.minX + cab.bounds.maxX) / 2;
    const centerZ = (cab.bounds.minZ + cab.bounds.maxZ) / 2;

    const dx = centerX - playerPos[0];
    const dz = centerZ - playerPos[1];
    const distance = Math.sqrt(dx * dx + dz * dz);
    const isInRange = distance <= interactionDistance;

    // LOS: проверяем пересечение отрезка игрок→шкаф с каждым floor-obstacle
    let hasLOS = true;
    if (isInRange) {
      const p1: [number, number] = [playerPos[0], playerPos[1]];
      const p2: [number, number] = [centerX, centerZ];
      for (const obs of floorObstacles) {
        if (segmentIntersectsAABB(p1, p2, obs.bounds)) {
          hasLOS = false;
          break;
        }
      }
    }

    return {
      id: cab.id,
      name: cab.name,
      distance,
      isInRange,
      hasLOS,
      canInteract: isInRange && hasLOS,
      centerX,
      centerZ,
    };
  });
}

// ─── S7-V2.6: Pickable Items & Held Rig ──────────────────────────────────────

export interface PickableItem {
  id: string;
  name: string;
  /** Three.js world position (X, Y, Z) */
  worldPos: [number, number, number];
  isPickedUp: boolean;
}

/**
 * Находит первый доступный для подбора объект в зоне досягаемости игрока (XZ).
 * LOS не проверяется — объект лежит на поверхности препятствия (стол),
 * физическая дистанция служит достаточным гейтом.
 */
export function computePickupTarget(
  playerPos: [number, number],
  items: PickableItem[],
  config: { pickupDistance: number }
): PickableItem | null {
  const { pickupDistance } = config;

  for (const item of items) {
    if (item.isPickedUp) continue;

    const dx = item.worldPos[0] - playerPos[0];
    const dz = item.worldPos[2] - playerPos[1];
    const distance = Math.sqrt(dx * dx + dz * dz);

    if (distance <= pickupDistance) {
      return item;
    }
  }

  return null;
}

/**
 * Вычисляет мировую позицию Held-объекта из параметров камеры (чистая математика).
 * Использует формулы camera forward/right/up из yaw/pitch (порядок YXZ как в Three.js FPS).
 *
 * forward = (-sin(yaw)*cos(pitch), sin(pitch), -cos(yaw)*cos(pitch))
 * right   = (cos(yaw), 0, -sin(yaw))
 * up      = (sin(yaw)*sin(pitch), cos(pitch), cos(yaw)*sin(pitch))
 */
export function computeHeldWorldPos(
  cameraPos: [number, number, number],
  yawRad: number,
  pitchRad: number,
  offsetX: number,    // правое смещение (+ = вправо)
  offsetY: number,    // вертикальное смещение (+ = вверх)
  forwardDist: number // расстояние вперёд по оси камеры (+ = от камеры)
): [number, number, number] {
  const sy = Math.sin(yawRad);
  const cy = Math.cos(yawRad);
  const sp = Math.sin(pitchRad);
  const cp = Math.cos(pitchRad);

  // Единичные векторы камеры (YXZ euler)
  const rX = cy;       const rY = 0;   const rZ = -sy;        // right
  const uX = sy * sp;  const uY = cp;  const uZ = cy * sp;    // up
  const fX = -sy * cp; const fY = sp;  const fZ = -cy * cp;   // forward

  return [
    cameraPos[0] + rX * offsetX + uX * offsetY + fX * forwardDist,
    cameraPos[1] + rY * offsetX + uY * offsetY + fY * forwardDist,
    cameraPos[2] + rZ * offsetX + uZ * offsetY + fZ * forwardDist,
  ];
}

/**
 * Параметрическое пересечение луча с 3D AABB (Liang–Barsky).
 * Возвращает расстояние до первой точки входа (>=0) или null.
 */
export function rayIntersectAABB(
  origin: [number, number, number],
  dir: [number, number, number],
  minX: number, maxX: number,
  minY: number, maxY: number,
  minZ: number, maxZ: number
): number | null {
  let tMin = 0;
  let tMax = Infinity;

  const slabs: [number, number, number, number][] = [
    [dir[0], origin[0], minX, maxX],
    [dir[1], origin[1], minY, maxY],
    [dir[2], origin[2], minZ, maxZ],
  ];

  for (const [d, o, lo, hi] of slabs) {
    if (Math.abs(d) < 1e-9) {
      if (o < lo || o > hi) return null;
    } else {
      const t1 = (lo - o) / d;
      const t2 = (hi - o) / d;
      tMin = Math.max(tMin, Math.min(t1, t2));
      tMax = Math.min(tMax, Math.max(t1, t2));
      if (tMin > tMax) return null;
    }
  }

  return tMin >= 0 ? tMin : (tMax >= 0 ? tMax : null);
}

/**
 * Вычисляет безопасное расстояние Held Rig вперёд от камеры.
 * Проверяет пересечение луча камеры с зарегистрированными коллайдерами и стенами.
 * При наличии препятствия ближе чем desiredDist сужает дистанцию до safetyMargin от него.
 */
/**
 * Конфигурация позиционирования предметов в руке (Held Rig).
 */
export interface HeldRigConfig {
  forwardDistance: number;
  lateralOffset: number;
  verticalOffset: number;
  minSafeDistance: number;
  obstacleMargin: number;
  objectRadius: number;
}

export interface HeldRigResult {
  desiredWorldPos: [number, number, number];
  finalWorldPos: [number, number, number];
  desiredDistance: number;
  resolvedDistance: number;
  hitObstacleId: string | null;
  hitDistance: number;
  objectRadius: number;
}

/**
 * Точный и стабильный расчёт трансформа для Held Rig.
 * Проверяет коллизию по вектору от камеры к желаемой позиции предмета (hand ray),
 * а не по центральному лучу взгляда. Это устраняет ложные срабатывания со столом при взгляде вниз.
 */
export function resolveHeldRigTransform(
  cameraPos: [number, number, number],
  yawRad: number,
  pitchRad: number,
  config: HeldRigConfig,
  colliders: RegisteredCollider[],
  room: RoomInteriorBounds | null
): HeldRigResult {
  const { forwardDistance, lateralOffset, verticalOffset, minSafeDistance, obstacleMargin, objectRadius } = config;

  // 1. Векторы ориентации камеры
  const sy = Math.sin(yawRad);
  const cy = Math.cos(yawRad);
  const sp = Math.sin(pitchRad);
  const cp = Math.cos(pitchRad);

  const r = [cy, 0, -sy];
  const u = [sy * sp, cp, cy * sp];
  const f = [-sy * cp, sp, -cy * cp];

  // 2. Вектор смещения от камеры к предмету в руке
  const handVec: [number, number, number] = [
    r[0] * lateralOffset + u[0] * verticalOffset + f[0] * forwardDistance,
    r[1] * lateralOffset + u[1] * verticalOffset + f[1] * forwardDistance,
    r[2] * lateralOffset + u[2] * verticalOffset + f[2] * forwardDistance,
  ];

  const desiredWorldPos: [number, number, number] = [
    cameraPos[0] + handVec[0],
    cameraPos[1] + handVec[1],
    cameraPos[2] + handVec[2],
  ];

  const handLen = Math.sqrt(handVec[0] * handVec[0] + handVec[1] * handVec[1] + handVec[2] * handVec[2]);
  if (handLen < 1e-6) {
    return {
      desiredWorldPos,
      finalWorldPos: desiredWorldPos,
      desiredDistance: forwardDistance,
      resolvedDistance: forwardDistance,
      hitObstacleId: null,
      hitDistance: Infinity,
      objectRadius,
    };
  }

  const handDir: [number, number, number] = [
    handVec[0] / handLen,
    handVec[1] / handLen,
    handVec[2] / handLen,
  ];

  // 3. Рейкаст по направлению к руке от позиции камеры
  let closestHit = Infinity;
  let hitId: string | null = null;

  for (const col of colliders) {
    if (col.role !== "floor-obstacle" && col.role !== "room-boundary") continue;

    const hit = rayIntersectAABB(
      cameraPos,
      handDir,
      col.bounds.minX,
      col.bounds.maxX,
      col.minY,
      col.maxY,
      col.bounds.minZ,
      col.bounds.maxZ
    );
    if (hit !== null && hit > 0.02 && hit < closestHit) {
      closestHit = hit;
      hitId = col.id;
    }
  }

  if (room) {
    const WALL_THICKNESS = 0.5;
    const WALL_HEIGHT_MIN = 0;
    const WALL_HEIGHT_MAX = 4.0;
    const wallConfigs: [string, number, number, number, number, number, number][] = [
      ["wall_left", room.minX - WALL_THICKNESS, room.minX, WALL_HEIGHT_MIN, WALL_HEIGHT_MAX, room.minZ, room.maxZ],
      ["wall_right", room.maxX, room.maxX + WALL_THICKNESS, WALL_HEIGHT_MIN, WALL_HEIGHT_MAX, room.minZ, room.maxZ],
      ["wall_back", room.minX, room.maxX, WALL_HEIGHT_MIN, WALL_HEIGHT_MAX, room.minZ - WALL_THICKNESS, room.minZ],
      ["wall_front", room.minX, room.maxX, WALL_HEIGHT_MIN, WALL_HEIGHT_MAX, room.maxZ, room.maxZ + WALL_THICKNESS],
    ];
    for (const [wId, wxMin, wxMax, wyMin, wyMax, wzMin, wzMax] of wallConfigs) {
      const hit = rayIntersectAABB(cameraPos, handDir, wxMin, wxMax, wyMin, wyMax, wzMin, wzMax);
      if (hit !== null && hit > 0.02 && hit < closestHit) {
        closestHit = hit;
        hitId = wId;
      }
    }
  }

  // 4. Масштаб безопасного смещения
  let s = 1.0;
  if (closestHit < handLen) {
    const safeHandDist = Math.max(minSafeDistance, closestHit - objectRadius - obstacleMargin);
    s = Math.min(1.0, Math.max(minSafeDistance / forwardDistance, safeHandDist / handLen));
  } else {
    hitId = null;
  }

  const finalWorldPos: [number, number, number] = [
    cameraPos[0] + handVec[0] * s,
    cameraPos[1] + handVec[1] * s,
    cameraPos[2] + handVec[2] * s,
  ];

  return {
    desiredWorldPos,
    finalWorldPos,
    desiredDistance: forwardDistance,
    resolvedDistance: forwardDistance * s,
    hitObstacleId: hitId,
    hitDistance: closestHit,
    objectRadius,
  };
}

/**
 * Stage S7-V2.9: Валидатор единого пайплайна взаимодействия (requestInteraction)
 * В режиме Orbit Mode всегда возвращает { allowed: true } (S-1..S-6 поведение).
 * В режиме Sandbox Mode проверяет евклидово XZ-расстояние до предмета и ограничение в maxDistance (по умолчанию 1.8м).
 */
export function checkPlayerReach(
  playerPos: [number, number],
  targetPos: [number, number],
  cameraMode: CameraMode,
  maxDistance: number = SANDBOX_CONFIG.interactionDistance
): InteractionCheckResult {
  if (cameraMode === "orbit") {
    return {
      allowed: true,
      reason: "ok",
      distance: 0,
      maxDistance,
    };
  }

  const dx = targetPos[0] - playerPos[0];
  const dz = targetPos[1] - playerPos[1];
  const distance = Math.hypot(dx, dz);

  if (distance <= maxDistance) {
    return {
      allowed: true,
      reason: "ok",
      distance: Number(distance.toFixed(2)),
      maxDistance,
    };
  }

  return {
    allowed: false,
    reason: "too_far",
    message: `Предмет находится вне зоны доступа игрока (${distance.toFixed(2)}м > ${maxDistance}м)`,
    distance: Number(distance.toFixed(2)),
    maxDistance,
  };
}

/**
 * Кратчайшее XZ-расстояние от точки pos до nearest point на AABB-границе объекта
 */
export function distanceToAABB(
  pos: [number, number],
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number }
): number {
  const clampedX = Math.max(bounds.minX, Math.min(pos[0], bounds.maxX));
  const clampedZ = Math.max(bounds.minZ, Math.min(pos[1], bounds.maxZ));
  const dx = pos[0] - clampedX;
  const dz = pos[1] - clampedZ;
  return Math.hypot(dx, dz);
}

/**
 * Проверяет прямую видимость (Line of Sight) от игрока до предмета.
 * Если отрезок пересекает напольные препятствия (стол), не относящиеся к самому предмету — возвращает false.
 */
export function checkLineOfSight(
  playerPos: [number, number],
  targetPos: [number, number],
  obstacles: RegisteredCollider[] = [],
  ignoreObstacleId?: string | null
): boolean {
  for (const obs of obstacles) {
    if (obs.role !== "floor-obstacle") continue;
    if (ignoreObstacleId && obs.id === ignoreObstacleId) continue;

    if (segmentIntersectsAABB(playerPos, targetPos, obs.bounds)) {
      return false; // Заблокировано препятствием
    }
  }
  return true;
}

export interface UnifiedInteractionParams {
  playerPos: [number, number];
  targetPos: [number, number];
  targetBounds?: { minX: number; maxX: number; minZ: number; maxZ: number };
  targetId: string;
  targetKind: "container" | "bottle" | "tool" | "cabinet";
  action: "pickup" | "select" | "toggle_cabinet";
  source: "click" | "key_e";
  cameraMode: CameraMode;
  isHoldingItem?: boolean;
  isCabinetOpen?: boolean;
  isInsideCabinet?: boolean;
  obstacles?: RegisteredCollider[];
  maxDistance?: number;
}

/**
 * Единая математическая функция валидации взаимодействия (requestInteraction Pipeline) для KeyE и кликов мыши.
 */
export function evaluateUnifiedInteraction(
  params: UnifiedInteractionParams
): InteractionCheckResult {
  const {
    playerPos,
    targetPos,
    targetBounds,
    targetId,
    action,
    cameraMode,
    isHoldingItem = false,
    isCabinetOpen = true,
    isInsideCabinet = false,
    obstacles = [],
    maxDistance = SANDBOX_CONFIG.interactionDistance,
  } = params;

  // 1. В Orbit Mode предикат моментально пропускает все взаимодействия (Stage S-6 parity)
  if (cameraMode === "orbit") {
    return {
      allowed: true,
      reason: "ok",
      distance: 0,
      maxDistance,
    };
  }

  // 2. Блокировка вторичного подбора: при удержании предмета нельзя взять второй
  if (action === "pickup" && isHoldingItem) {
    return {
      allowed: false,
      reason: "invalid_state",
      message: "Игрок уже удерживает предмет в руке",
      distance: 0,
      maxDistance,
    };
  }

  // 3. Блокировка шкафа: если предмет находится внутри закрытого шкафа
  if (isInsideCabinet && !isCabinetOpen) {
    return {
      allowed: false,
      reason: "occluded",
      message: "Предмет находится внутри закрытого шкафа",
      distance: 0,
      maxDistance,
    };
  }

  // 4. Расстояние до ближайшей точки AABB (или до центра)
  const distance = targetBounds
    ? distanceToAABB(playerPos, targetBounds)
    : Math.hypot(targetPos[0] - playerPos[0], targetPos[1] - playerPos[1]);

  if (distance > maxDistance) {
    return {
      allowed: false,
      reason: "too_far",
      message: `Предмет находится слишком далеко (${distance.toFixed(2)}м > ${maxDistance}м)`,
      distance: Number(distance.toFixed(2)),
      maxDistance,
    };
  }

  // 5. Проверка прямой видимости (Line of Sight)
  const hasLOS = checkLineOfSight(playerPos, targetPos, obstacles, targetId);
  if (!hasLOS) {
    return {
      allowed: false,
      reason: "occluded",
      message: "Прямая видимость предмета перекрыта препятствием",
      distance: Number(distance.toFixed(2)),
      maxDistance,
    };
  }

  return {
    allowed: true,
    reason: "ok",
    distance: Number(distance.toFixed(2)),
    maxDistance,
  };
}
