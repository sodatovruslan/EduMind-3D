import * as THREE from "three";

export const POUR_DISTANCE_THRESHOLD_M = 0.35;
export const MIN_POUR_TILT_RAD = Math.PI / 4; // 45 degrees
export const MAX_POUR_TILT_RAD = (Math.PI * 5) / 6; // 150 degrees
export const MAX_POUR_RATE_ML_PER_SEC = 30; // 30 ml/sec max flow

export interface PourSourceState {
  id: string;
  kind?: string;
  capState?: "closed" | "open";
  remainingGrams: number;
}

export interface PourTargetState {
  id: string;
  kind?: string;
  openingRadius?: number;
}

export interface PourGeometry {
  spoutWorld: THREE.Vector3;
  openingWorld: THREE.Vector3;
  distanceM: number;
  horizontalDistanceM: number;
  tiltAngleRad: number;
  isWithinDistance: boolean;
  isWithinAlignment: boolean;
  isTilted: boolean;
}

/**
 * Returns local spout position for a given container kind.
 */
export function getSpoutLocalPosition(kind?: string): THREE.Vector3 {
  switch (kind) {
    case "stock_bottle":
    case "stock_water":
    case "stock_nacl":
    case "stock-water":
    case "stock-nacl":
    case "stock-hcl":
    case "stock-naoh":
    case "stock-cuso4":
    case "stock-agno3":
      return new THREE.Vector3(0, 0.24, 0.09);
    case "beaker":
      return new THREE.Vector3(0, 0.18, 0.14);
    case "flask":
    case "erlenmeyer":
      return new THREE.Vector3(0, 0.20, 0.06);
    case "test_tube":
      return new THREE.Vector3(0, 0.15, 0.03);
    default:
      return new THREE.Vector3(0, 0.20, 0.08);
  }
}

/**
 * Returns local opening position for a given target container.
 */
export function getOpeningLocalPosition(kind?: string): THREE.Vector3 {
  switch (kind) {
    case "beaker":
      return new THREE.Vector3(0, 0.18, 0);
    case "flask":
    case "erlenmeyer":
      return new THREE.Vector3(0, 0.20, 0);
    case "test_tube":
      return new THREE.Vector3(0, 0.15, 0);
    default:
      return new THREE.Vector3(0, 0.18, 0);
  }
}

/**
 * Calculates spatial 3D geometry between held source spout and target opening.
 */
export function calculatePourGeometry(
  heldPosition: [number, number, number] | [number, number],
  heldRotationY: number,
  heldTiltRad: number,
  heldKind: string | undefined,
  targetPosition: [number, number, number] | [number, number],
  targetElevation: number,
  targetKind: string | undefined
): PourGeometry {
  // Construct held world matrix
  const heldMatrix = new THREE.Matrix4();
  const heldPosVec =
    heldPosition.length === 3
      ? new THREE.Vector3(heldPosition[0], heldPosition[1], heldPosition[2])
      : new THREE.Vector3(heldPosition[0], 1.2, heldPosition[1]);

  const heldEuler = new THREE.Euler(heldTiltRad, heldRotationY, 0, "YXZ");
  const heldQuat = new THREE.Quaternion().setFromEuler(heldEuler);
  heldMatrix.compose(heldPosVec, heldQuat, new THREE.Vector3(1, 1, 1));

  // Spout world position
  const spoutLocal = getSpoutLocalPosition(heldKind);
  const spoutWorld = spoutLocal.clone().applyMatrix4(heldMatrix);

  // Target opening world position
  const targetMatrix = new THREE.Matrix4();
  const targetPosVec =
    targetPosition.length === 3
      ? new THREE.Vector3(targetPosition[0], targetPosition[1], targetPosition[2])
      : new THREE.Vector3(targetPosition[0], targetElevation, targetPosition[1]);
  targetMatrix.compose(targetPosVec, new THREE.Quaternion(), new THREE.Vector3(1, 1, 1));

  const openingLocal = getOpeningLocalPosition(targetKind);
  const openingWorld = openingLocal.clone().applyMatrix4(targetMatrix);

  // Distances
  const distanceM = spoutWorld.distanceTo(openingWorld);
  const horizontalDistanceM = Math.sqrt(
    Math.pow(spoutWorld.x - openingWorld.x, 2) + Math.pow(spoutWorld.z - openingWorld.z, 2)
  );

  const isWithinDistance = distanceM <= POUR_DISTANCE_THRESHOLD_M;
  const isWithinAlignment = horizontalDistanceM <= 0.35;
  const isTilted = heldTiltRad >= MIN_POUR_TILT_RAD;

  return {
    spoutWorld,
    openingWorld,
    distanceM,
    horizontalDistanceM,
    tiltAngleRad: heldTiltRad,
    isWithinDistance,
    isWithinAlignment,
    isTilted,
  };
}

/**
 * Calculates dynamic pour flow rate in ml/sec (or g/sec) given tilt angle.
 */
export function calculatePourRateMlPerSec(tiltAngleRad: number, maxRate = MAX_POUR_RATE_ML_PER_SEC): number {
  if (tiltAngleRad < MIN_POUR_TILT_RAD) return 0;
  const clampedTilt = Math.min(MAX_POUR_TILT_RAD, tiltAngleRad);
  const normalized = (clampedTilt - MIN_POUR_TILT_RAD) / (MAX_POUR_TILT_RAD - MIN_POUR_TILT_RAD);
  return maxRate * Math.sin(normalized * (Math.PI / 2));
}

/**
 * Validates whether pouring can occur given source state, distance, and tilt.
 */
export function canPourNow(
  sourceState: PourSourceState,
  geometry: PourGeometry
): { canPour: boolean; blockedReason: string | null } {
  if (sourceState.capState === "closed") {
    return { canPour: false, blockedReason: "cap_closed" };
  }
  if (sourceState.remainingGrams <= 0) {
    return { canPour: false, blockedReason: "empty" };
  }
  if (!geometry.isTilted) {
    return { canPour: false, blockedReason: "not_tilted" };
  }
  if (!geometry.isWithinDistance) {
    return { canPour: false, blockedReason: "too_far" };
  }
  if (!geometry.isWithinAlignment) {
    return { canPour: false, blockedReason: "misaligned" };
  }
  return { canPour: true, blockedReason: null };
}
