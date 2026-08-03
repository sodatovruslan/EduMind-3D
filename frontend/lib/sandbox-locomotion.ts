/**
 * Stage S-7 v2 — Sandbox Locomotion Helper (S7-V2.2)
 * Pure kinematic vector math for camera-relative WASD movement.
 */

export interface Vector2D {
  x: number;
  z: number;
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

  // Диагональная нормализация (длина единичного вектора не больше 1)
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

export function calculateKinematicStep(
  currentPos: [number, number],
  inputVec: Vector2D,
  yawRad: number,
  speed: number,
  deltaSec: number
): [number, number] {
  const worldMove = computeWorldMovementVector(inputVec, yawRad);
  if (worldMove.x === 0 && worldMove.z === 0) {
    return currentPos;
  }

  const dist = speed * deltaSec;
  const nextX = currentPos[0] + worldMove.x * dist;
  const nextZ = currentPos[1] + worldMove.z * dist;

  return [nextX, nextZ];
}
