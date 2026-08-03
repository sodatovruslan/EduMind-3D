"use client";

import React, { Suspense, useEffect, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import {
  calculateKinematicStep,
  computeInteractionTargets,
  computePickupTarget,
  DEFAULT_ROOM_INTERIOR,
  HeldRigResult,
  InteractionTarget,
  isValidSpawnPosition,
  PickableItem,
  rayIntersectAABB,
  RegisteredCollider,
  resolveHeldRigTransform,
  RoomInteriorBounds,
  Vector2D,
} from "@/lib/sandbox-locomotion";

// 1. Централизованный SandboxConfig прототипа (S7-V2.6)
const SANDBOX_CONFIG = {
  playerRadius: 0.35,
  eyeHeight: 1.6,
  interactionDistance: 1.8,
  pickupDistance: 1.8,
  skinWidth: 0.02,
  defaultFov: 65,
  moveSpeed: 2.5,
};

// Flask оригин: позиция на столешнице (фиксирована, Escape возвращает сюда)
const FLASK_ORIGIN: [number, number, number] = [0.6, 0.85, 0.55];

// Held Rig константы (S7-V2.6)
const HELD_RIG_CONFIG = {
  forwardDistance: 0.35,
  lateralOffset: 0.20,
  verticalOffset: -0.15,
  minSafeDistance: 0.12,
  obstacleMargin: 0.04,
  objectRadius: 0.05,
};

const START_POS: [number, number] = [0, 2.5];
const TABLE_CENTER = [0, 0.8, 0];

const lookDir = [
  TABLE_CENTER[0] - START_POS[0],
  TABLE_CENTER[1] - SANDBOX_CONFIG.eyeHeight,
  TABLE_CENTER[2] - START_POS[1],
];
const distXZ = Math.sqrt(lookDir[0] * lookDir[0] + lookDir[2] * lookDir[2]);
const START_YAW = Math.atan2(-lookDir[0], -lookDir[2]); // 0
const START_PITCH = Math.atan2(lookDir[1], distXZ); // -0.308 rad (-17.6°)

// Контроллер камеры первого лица
function SandboxCameraController({
  playerPosRef,
  yaw,
  pitch,
}: {
  playerPosRef: React.MutableRefObject<[number, number]>;
  yaw: number;
  pitch: number;
}) {
  const { camera } = useThree();

  useFrame(() => {
    const pos = playerPosRef.current;
    camera.position.set(pos[0], SANDBOX_CONFIG.eyeHeight, pos[1]);
    camera.rotation.order = "YXZ";
    camera.rotation.y = yaw;
    camera.rotation.x = pitch;
    camera.rotation.z = 0;

    if (camera instanceof THREE.PerspectiveCamera) {
      if (camera.fov !== SANDBOX_CONFIG.defaultFov) {
        camera.fov = SANDBOX_CONFIG.defaultFov;
        camera.updateProjectionMatrix();
      }
    }

    camera.updateMatrixWorld();
  });

  return null;
}

// Регистрация столешницы с обновлением матрицы updateWorldMatrix(true, true)
function RegisteredTableMesh({ onRegister }: { onRegister: (collider: RegisteredCollider) => void }) {
  const groupRef = useRef<THREE.Group>(null);

  useEffect(() => {
    if (groupRef.current) {
      // Обязательное обновление мировых матриц перед вычислением Box3
      groupRef.current.updateWorldMatrix(true, true);
      const box = new THREE.Box3().setFromObject(groupRef.current);

      onRegister({
        id: "main_table",
        name: "Главный стол",
        role: "floor-obstacle",
        bounds: {
          minX: Number(box.min.x.toFixed(2)),
          maxX: Number(box.max.x.toFixed(2)),
          minZ: Number(box.min.z.toFixed(2)),
          maxZ: Number(box.max.z.toFixed(2)),
        },
        minY: Number(box.min.y.toFixed(2)),
        maxY: Number(box.max.y.toFixed(2)),
      });
    }
  }, [onRegister]);

  return (
    <group ref={groupRef} position={[0, 0.4, 0]}>
      {/* Столешница */}
      <mesh position={[0, 0.4, 0]}>
        <boxGeometry args={[3.0, 0.08, 1.4]} />
        <meshStandardMaterial color="#e2e8f0" roughness={0.2} metalness={0.1} />
      </mesh>
      {/* Ножки */}
      <mesh position={[-1.4, -0.2, -0.6]}>
        <boxGeometry args={[0.08, 0.8, 0.08]} />
        <meshStandardMaterial color="#475569" />
      </mesh>
      <mesh position={[1.4, -0.2, -0.6]}>
        <boxGeometry args={[0.08, 0.8, 0.08]} />
        <meshStandardMaterial color="#475569" />
      </mesh>
      <mesh position={[-1.4, -0.2, 0.6]}>
        <boxGeometry args={[0.08, 0.8, 0.08]} />
        <meshStandardMaterial color="#475569" />
      </mesh>
      <mesh position={[1.4, -0.2, 0.6]}>
        <boxGeometry args={[0.08, 0.8, 0.08]} />
        <meshStandardMaterial color="#475569" />
      </mesh>
    </group>
  );
}

// Регистрация настенного шкафа (interaction-only) с обновлением матрицы updateWorldMatrix(true, true)
function RegisteredCabinetMesh({
  id,
  name,
  position,
  args,
  onRegister,
}: {
  id: string;
  name: string;
  position: [number, number, number];
  args: [number, number, number];
  onRegister: (collider: RegisteredCollider) => void;
}) {
  const meshRef = useRef<THREE.Mesh>(null);

  useEffect(() => {
    if (meshRef.current) {
      meshRef.current.updateWorldMatrix(true, true);
      const box = new THREE.Box3().setFromObject(meshRef.current);
      onRegister({
        id,
        name,
        role: "interaction-only",
        bounds: {
          minX: Number(box.min.x.toFixed(2)),
          maxX: Number(box.max.x.toFixed(2)),
          minZ: Number(box.min.z.toFixed(2)),
          maxZ: Number(box.max.z.toFixed(2)),
        },
        minY: Number(box.min.y.toFixed(2)),
        maxY: Number(box.max.y.toFixed(2)),
      });
    }
  }, [id, name, onRegister]);

  return (
    <mesh ref={meshRef} position={position}>
      <boxGeometry args={args} />
      <meshStandardMaterial color="#475569" roughness={0.3} metalness={0.4} />
    </mesh>
  );
}

function RegisteredWallMesh({
  id,
  name,
  position,
  args,
  rotation = [0, 0, 0],
  onRegister,
}: {
  id: string;
  name: string;
  position: [number, number, number];
  args: [number, number];
  rotation?: [number, number, number];
  onRegister: (collider: RegisteredCollider) => void;
}) {
  const meshRef = useRef<THREE.Mesh>(null);

  useEffect(() => {
    if (meshRef.current) {
      meshRef.current.updateWorldMatrix(true, true);
      const box = new THREE.Box3().setFromObject(meshRef.current);
      onRegister({
        id,
        name,
        role: "room-boundary",
        bounds: {
          minX: Number(box.min.x.toFixed(2)),
          maxX: Number(box.max.x.toFixed(2)),
          minZ: Number(box.min.z.toFixed(2)),
          maxZ: Number(box.max.z.toFixed(2)),
        },
        minY: Number(box.min.y.toFixed(2)),
        maxY: Number(box.max.y.toFixed(2)),
      });
    }
  }, [id, name, onRegister]);

  return (
    <mesh ref={meshRef} position={position} rotation={rotation}>
      <planeGeometry args={args} />
      <meshStandardMaterial color="#334155" roughness={0.9} />
    </mesh>
  );
}

function SandboxRoomGeometry({ onRegisterCollider }: { onRegisterCollider: (collider: RegisteredCollider) => void }) {
  return (
    <group>
      <mesh position={[0, -0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[8.4, 6.4]} />
        <meshStandardMaterial color="#1e293b" roughness={0.8} />
      </mesh>
      <mesh position={[0, 3.6, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[8.4, 6.4]} />
        <meshStandardMaterial color="#0f172a" roughness={0.9} />
      </mesh>

      <RegisteredWallMesh id="wall_back" name="Задняя стена" position={[0, 1.8, -3.2]} args={[8.4, 3.6]} onRegister={onRegisterCollider} />
      <RegisteredWallMesh id="wall_left" name="Левая стена" position={[-4.2, 1.8, 0]} args={[6.4, 3.6]} rotation={[0, Math.PI / 2, 0]} onRegister={onRegisterCollider} />
      <RegisteredWallMesh id="wall_right" name="Правая стена" position={[4.2, 1.8, 0]} args={[6.4, 3.6]} rotation={[0, -Math.PI / 2, 0]} onRegister={onRegisterCollider} />

      <RegisteredTableMesh onRegister={onRegisterCollider} />
      {/* Настенные шкафы (interaction-only) на задней стене */}
      <RegisteredCabinetMesh
        id="cabinet_left"
        name="Левый шкаф"
        position={[-2.0, 1.4, -3.15]}
        args={[1.2, 0.8, 0.3]}
        onRegister={onRegisterCollider}
      />
      <RegisteredCabinetMesh
        id="cabinet_right"
        name="Правый шкаф"
        position={[2.0, 1.4, -3.15]}
        args={[1.2, 0.8, 0.3]}
        onRegister={onRegisterCollider}
      />
    </group>
  );
}

function PlayerCylinderDebug({ playerPos }: { playerPos: [number, number] }) {
  return (
    <group position={[playerPos[0], 0.8, playerPos[1]]}>
      <mesh>
        <cylinderGeometry args={[SANDBOX_CONFIG.playerRadius, SANDBOX_CONFIG.playerRadius, 1.6, 16]} />
        <meshBasicMaterial color="#06b6d4" wireframe transparent opacity={0.3} />
      </mesh>
    </group>
  );
}

// 3D Wireframe-визуализация расширенной AABB зоны коллизии стола
function TableExpandedBoundsDebug({ tableCol }: { tableCol: RegisteredCollider | undefined }) {
  if (!tableCol) return null;

  const width = tableCol.bounds.maxX - tableCol.bounds.minX + (SANDBOX_CONFIG.playerRadius + SANDBOX_CONFIG.skinWidth) * 2;
  const depth = tableCol.bounds.maxZ - tableCol.bounds.minZ + (SANDBOX_CONFIG.playerRadius + SANDBOX_CONFIG.skinWidth) * 2;
  const centerX = (tableCol.bounds.minX + tableCol.bounds.maxX) / 2;
  const centerZ = (tableCol.bounds.minZ + tableCol.bounds.maxZ) / 2;

  return (
    <mesh position={[centerX, 0.4, centerZ]}>
      <boxGeometry args={[width, 0.8, depth]} />
      <meshBasicMaterial color="#f59e0b" wireframe transparent opacity={0.4} />
    </mesh>
  );
}

// ─── S7-V2.6: Pickable Flask ─────────────────────────────────────────────────

/** Колба на столе — отображается пока не в Held. */
function PickableFlask({ pos, canPickup }: { pos: [number, number, number]; canPickup: boolean }) {
  return (
    <group position={pos}>
      {/* Flask body */}
      <mesh>
        <cylinderGeometry args={[0.035, 0.055, 0.18, 16]} />
        <meshStandardMaterial color="#93c5fd" transparent opacity={0.75} roughness={0.1} metalness={0.0} />
      </mesh>
      {/* Flask neck */}
      <mesh position={[0, 0.13, 0]}>
        <cylinderGeometry args={[0.018, 0.035, 0.07, 16]} />
        <meshStandardMaterial color="#93c5fd" transparent opacity={0.75} roughness={0.1} />
      </mesh>
      {/* Focus highlight wireframe */}
      {canPickup && (
        <mesh>
          <boxGeometry args={[0.14, 0.32, 0.14]} />
          <meshBasicMaterial color="#06b6d4" wireframe />
        </mesh>
      )}
    </group>
  );
}

/** Константы Held Rig. Использует camera quaternion, hand raycast и сглаживание damping. */
function HeldFlask({
  collidersRef,
  roomInteriorRef,
  onDiagUpdate,
}: {
  collidersRef: React.MutableRefObject<RegisteredCollider[]>;
  roomInteriorRef: React.MutableRefObject<RoomInteriorBounds | null>;
  onDiagUpdate: (res: HeldRigResult) => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const smoothedPosRef = useRef<THREE.Vector3 | null>(null);
  const { camera } = useThree();

  useFrame((_, delta) => {
    if (!groupRef.current) return;

    const cameraPos: [number, number, number] = [camera.position.x, camera.position.y, camera.position.z];

    // Углы Эйлера ориентации камеры (порядок YXZ как в Three.js FPS)
    const euler = new THREE.Euler().setFromQuaternion(camera.quaternion, "YXZ");

    const res = resolveHeldRigTransform(
      cameraPos,
      euler.y,
      euler.x,
      HELD_RIG_CONFIG,
      collidersRef.current,
      roomInteriorRef.current
    );

    const targetPos = new THREE.Vector3(...res.finalWorldPos);

    if (!smoothedPosRef.current) {
      smoothedPosRef.current = targetPos.clone();
    } else {
      // Damping для плавного перемещения возле препятствий (Requirement 6)
      smoothedPosRef.current.x = THREE.MathUtils.damp(smoothedPosRef.current.x, targetPos.x, 15, delta);
      smoothedPosRef.current.y = THREE.MathUtils.damp(smoothedPosRef.current.y, targetPos.y, 15, delta);
      smoothedPosRef.current.z = THREE.MathUtils.damp(smoothedPosRef.current.z, targetPos.z, 15, delta);
    }

    groupRef.current.position.copy(smoothedPosRef.current);
    groupRef.current.quaternion.copy(camera.quaternion);

    onDiagUpdate(res);
  });

  return (
    <group ref={groupRef}>
      <mesh>
        <cylinderGeometry args={[0.035, 0.055, 0.18, 16]} />
        <meshStandardMaterial color="#bfdbfe" transparent opacity={0.85} roughness={0.1} />
      </mesh>
      <mesh position={[0, 0.13, 0]}>
        <cylinderGeometry args={[0.018, 0.035, 0.07, 16]} />
        <meshStandardMaterial color="#bfdbfe" transparent opacity={0.85} roughness={0.1} />
      </mesh>
    </group>
  );
}

/**
 * Активен внутри <Canvas>, проверяет направление камеры → объект (прицель) и обновляет refs.
 * Не вызывает setState каждый кадр.
 */
function PickupController({
  playerPosRef,
  isHeldRef,
  pickableItemsRef,
  canPickupRef,
  nearestPickupRef,
}: {
  playerPosRef: React.MutableRefObject<[number, number]>;
  isHeldRef: React.MutableRefObject<boolean>;
  pickableItemsRef: React.MutableRefObject<PickableItem[]>;
  canPickupRef: React.MutableRefObject<boolean>;
  nearestPickupRef: React.MutableRefObject<PickableItem | null>;
}) {
  const { camera } = useThree();

  useFrame(() => {
    // If already holding, pickup not available
    if (isHeldRef.current) {
      canPickupRef.current = false;
      nearestPickupRef.current = null;
      return;
    }

    // Distance gate
    const target = computePickupTarget(
      playerPosRef.current,
      pickableItemsRef.current,
      { pickupDistance: SANDBOX_CONFIG.pickupDistance }
    );

    if (!target) {
      canPickupRef.current = false;
      nearestPickupRef.current = null;
      return;
    }

    // Aim gate: camera must be roughly pointing at the item (~35° half-angle)
    const itemPos = new THREE.Vector3(target.worldPos[0], target.worldPos[1], target.worldPos[2]);
    const toItem = itemPos.clone().sub(camera.position).normalize();
    const camFwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const aimed = toItem.dot(camFwd) > Math.cos(0.6); // ~34° half-angle

    canPickupRef.current = aimed;
    nearestPickupRef.current = aimed ? target : null;
  });

  return null;
}

export default function SandboxPrototypePage() {
  const [playerPosState, setPlayerPosState] = useState<[number, number]>(START_POS);
  const [yaw, setYaw] = useState<number>(START_YAW);
  const [pitch, setPitch] = useState<number>(START_PITCH);
  const [isLookDragging, setIsLookDragging] = useState(false);
  const [lookButton, setLookButton] = useState<number>(-1);
  const [isMoving, setIsMoving] = useState(false);
  const [blockedWall, setBlockedWall] = useState<"none" | "left" | "right" | "back" | "front" | "corner">("none");
  const [blockedObstacle, setBlockedObstacle] = useState<{ id: string | null; side: string }>({ id: null, side: "none" });
  const [keysState, setKeysState] = useState({ keyW: false, keyA: false, keyS: false, keyD: false });
  const [colliders, setColliders] = useState<Record<string, RegisteredCollider>>({});
  const [roomInterior, setRoomInterior] = useState<RoomInteriorBounds | null>(DEFAULT_ROOM_INTERIOR);
  const [isSpawnValid, setIsSpawnValid] = useState<boolean>(true);
  const [nearestInteractable, setNearestInteractable] = useState<InteractionTarget | null>(null);
  // S7-V2.6 — Pickup state & diagnostics (throttled, for DOM only)
  const [isHeld, setIsHeld] = useState(false);
  const [canPickup, setCanPickup] = useState(false);
  const [heldDiag, setHeldDiag] = useState<HeldRigResult | null>(null);

  const lastHeldDiagTimeRef = useRef(0);
  const handleHeldDiagUpdate = React.useCallback((res: HeldRigResult) => {
    const now = performance.now();
    if (now - lastHeldDiagTimeRef.current > 66) {
      lastHeldDiagTimeRef.current = now;
      setHeldDiag(res);
    }
  }, []);

  const yawRef = useRef(START_YAW);
  const pitchRef = useRef(START_PITCH);
  const playerPosRef = useRef<[number, number]>(START_POS);
  const inputVecRef = useRef<Vector2D>({ x: 0, z: 0 });
  const keysPressedRef = useRef<Record<string, boolean>>({});
  const isDraggingRef = useRef(false);
  const lastPosRef = useRef({ x: 0, y: 0 });
  const lastUiUpdateRef = useRef<number>(0);
  const roomInteriorRef = useRef<RoomInteriorBounds | null>(DEFAULT_ROOM_INTERIOR);
  const collidersRef = useRef<RegisteredCollider[]>([]);
  const nearestInteractableRef = useRef<InteractionTarget | null>(null);
  // S7-V2.6 refs (frame-critical, never trigger re-renders directly)
  const isHeldRef = useRef(false);
  const canPickupRef = useRef(false);
  const nearestPickupRef = useRef<PickableItem | null>(null);
  const pickableItemsRef = useRef<PickableItem[]>([
    { id: "flask_01", name: "Колба", worldPos: FLASK_ORIGIN, isPickedUp: false },
  ]);
  const lastPickupUiRef = useRef<number>(0);

  const handleRegisterCollider = React.useCallback((collider: RegisteredCollider) => {
    setColliders((prev) => {
      const next = { ...prev, [collider.id]: collider };
      collidersRef.current = Object.values(next);

      const wallLeft = next["wall_left"];
      const wallRight = next["wall_right"];
      const wallBack = next["wall_back"];

      if (wallLeft && wallRight && wallBack) {
        const bounds: RoomInteriorBounds = {
          minX: wallLeft.bounds.maxX,
          maxX: wallRight.bounds.minX,
          minZ: wallBack.bounds.maxZ,
          maxZ: 3.2,
        };
        setRoomInterior(bounds);
        roomInteriorRef.current = bounds;

        const valid = isValidSpawnPosition(START_POS, bounds, Object.values(next), SANDBOX_CONFIG.playerRadius, SANDBOX_CONFIG.skinWidth);
        setIsSpawnValid(valid);
        if (!valid) {
          console.error(`[DevError] Invalid player spawn position ${JSON.stringify(START_POS)} inside room bounds or furniture collision`);
        }
      }

      return next;
    });
  }, []);

  function isTypingTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    const tag = target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable) return true;
    return false;
  }

  // Клавиатура WASD (поддержка раскладок RU ЦФЫВ и Стрелок)
  useEffect(() => {
    function getDirectionKey(e: KeyboardEvent): "w" | "a" | "s" | "d" | null {
      const code = e.code;
      const key = e.key ? e.key.toLowerCase() : "";

      if (code === "KeyW" || key === "w" || key === "ц" || key === "arrowup") return "w";
      if (code === "KeyS" || key === "s" || key === "ы" || key === "arrowdown") return "s";
      if (code === "KeyA" || key === "a" || key === "ф" || key === "arrowleft") return "a";
      if (code === "KeyD" || key === "d" || key === "в" || key === "arrowright") return "d";

      return null;
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return;

      // Escape: drop flask (highest priority, before dir check)
      if (e.code === "Escape") {
        if (isHeldRef.current) {
          isHeldRef.current = false;
          pickableItemsRef.current[0].isPickedUp = false;
          setIsHeld(false);
        }
        return;
      }

      const dir = getDirectionKey(e);
      if (dir) {
        keysPressedRef.current[dir] = true;
        updateInputFromKeys();
      }

      // E / У — Pickup / Drop / Interact
      const key = e.key ? e.key.toLowerCase() : "";
      if (e.code === "KeyE" || key === "е" || key === "у") {
        if (isHeldRef.current) {
          // Drop: return to origin
          isHeldRef.current = false;
          pickableItemsRef.current[0].isPickedUp = false;
          setIsHeld(false);
        } else if (canPickupRef.current) {
          // Pickup
          isHeldRef.current = true;
          pickableItemsRef.current[0].isPickedUp = true;
          setIsHeld(true);
          setCanPickup(false);
        } else {
          // Cabinet interaction (S7-V2.5)
          const cabTarget = nearestInteractableRef.current;
          if (cabTarget && cabTarget.canInteract) {
            console.log(`[Sandbox] interact: ${cabTarget.id}`);
          }
        }
      }
    }

    function handleKeyUp(e: KeyboardEvent) {
      const dir = getDirectionKey(e);
      if (dir) {
        delete keysPressedRef.current[dir];
        updateInputFromKeys();
      }
    }

    function updateInputFromKeys() {
      const keys = keysPressedRef.current;
      const keyW = !!keys["w"];
      const keyA = !!keys["a"];
      const keyS = !!keys["s"];
      const keyD = !!keys["d"];

      setKeysState({ keyW, keyA, keyS, keyD });

      let dx = 0;
      let dz = 0;
      if (keyW) dz += 1;
      if (keyS) dz -= 1;
      if (keyD) dx += 1;
      if (keyA) dx -= 1;

      inputVecRef.current = { x: dx, z: dz };
    }

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  // Мышь: Pointer Capture на контейнере сцены
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button === 2 || e.button === 1 || (e.button === 0 && e.shiftKey)) {
      e.currentTarget.setPointerCapture(e.pointerId);
      isDraggingRef.current = true;
      setIsLookDragging(true);
      setLookButton(e.button);
      lastPosRef.current = { x: e.clientX, y: e.clientY };
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;

    const dx = e.movementX !== undefined && e.movementX !== 0 ? e.movementX : e.clientX - lastPosRef.current.x;
    const dy = e.movementY !== undefined && e.movementY !== 0 ? e.movementY : e.clientY - lastPosRef.current.y;
    lastPosRef.current = { x: e.clientX, y: e.clientY };

    const sens = 0.003;
    let newYaw = yawRef.current - dx * sens;
    const newPitch = Math.max(-1.3, Math.min(1.3, pitchRef.current - dy * sens));

    // Нормализация yaw в диапазон [-PI, PI] (Requirement 6)
    newYaw = newYaw % (2 * Math.PI);
    if (newYaw > Math.PI) newYaw -= 2 * Math.PI;
    if (newYaw < -Math.PI) newYaw += 2 * Math.PI;

    yawRef.current = newYaw;
    pitchRef.current = newPitch;
    setYaw(newYaw);
    setPitch(newPitch);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDraggingRef.current) {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      isDraggingRef.current = false;
      setIsLookDragging(false);
      setLookButton(-1);
    }
  };

  const handleContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  // Window blur / focus lost / visibilitychange reset (Requirement 5)
  useEffect(() => {
    function resetAllInputs() {
      keysPressedRef.current = {};
      inputVecRef.current = { x: 0, z: 0 };
      isDraggingRef.current = false;
      setIsLookDragging(false);
      setLookButton(-1);
      setKeysState({ keyW: false, keyA: false, keyS: false, keyD: false });
    }

    function handleVisibilityChange() {
      if (document.hidden) resetAllInputs();
    }

    window.addEventListener("blur", resetAllInputs);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("blur", resetAllInputs);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  // Кинематический tick движения со субстеппингом и универсальным решением коллизий мебели
  useEffect(() => {
    let animId: number;
    let lastTime = performance.now();

    function tick() {
      const now = performance.now();
      const deltaSec = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;

      const input = inputVecRef.current;
      if (input.x !== 0 || input.z !== 0) {
        const step = calculateKinematicStep(
          playerPosRef.current,
          input,
          yawRef.current,
          SANDBOX_CONFIG.moveSpeed,
          deltaSec,
          roomInteriorRef.current ?? undefined,
          collidersRef.current,
          SANDBOX_CONFIG.playerRadius,
          SANDBOX_CONFIG.skinWidth
        );

        playerPosRef.current = step.nextPos;

        // Вычисление интерактивных целей (interaction-only шкафы)
        const interactTargets = computeInteractionTargets(
          step.nextPos,
          collidersRef.current,
          { interactionDistance: SANDBOX_CONFIG.interactionDistance }
        );
        const nearest = interactTargets.find((t) => t.canInteract) ?? null;
        nearestInteractableRef.current = nearest;

        // Throttled UI update (~15 Hz)
        if (now - lastUiUpdateRef.current > 66) {
          lastUiUpdateRef.current = now;
          setPlayerPosState(step.nextPos);
          setBlockedWall(step.blockedWall);
          setBlockedObstacle({ id: step.blockedObstacleId, side: step.blockedObstacleSide });
          setNearestInteractable(nearest);

          // Pickup UI throttle (shared timer) — React bails out on same value
          setCanPickup(canPickupRef.current);
        }
        setIsMoving(step.nextPos[0] !== playerPosRef.current[0] || step.nextPos[1] !== playerPosRef.current[1]);
      } else {
        setIsMoving(false);
        setBlockedWall("none");
        setBlockedObstacle({ id: null, side: "none" });

        // Interaction-only проверка стоя на месте (throttled)
        const now2 = performance.now();
        if (now2 - lastUiUpdateRef.current > 66) {
          lastUiUpdateRef.current = now2;
          const interactTargets2 = computeInteractionTargets(
            playerPosRef.current,
            collidersRef.current,
            { interactionDistance: SANDBOX_CONFIG.interactionDistance }
          );
          const nearest2 = interactTargets2.find((t) => t.canInteract) ?? null;
          nearestInteractableRef.current = nearest2;
          setNearestInteractable(nearest2);

          setCanPickup(canPickupRef.current);
        }

        if (playerPosRef.current !== playerPosState) {
          setPlayerPosState(playerPosRef.current);
        }
      }

      animId = requestAnimationFrame(tick);
    }

    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [playerPosState]);

  const tableCol = colliders["main_table"];
  const minXAllowed = roomInterior ? (roomInterior.minX + SANDBOX_CONFIG.playerRadius + SANDBOX_CONFIG.skinWidth).toFixed(2) : "-3.83";
  const maxXAllowed = roomInterior ? (roomInterior.maxX - SANDBOX_CONFIG.playerRadius - SANDBOX_CONFIG.skinWidth).toFixed(2) : "3.83";
  const minZAllowed = roomInterior ? (roomInterior.minZ + SANDBOX_CONFIG.playerRadius + SANDBOX_CONFIG.skinWidth).toFixed(2) : "-2.83";
  const maxZAllowed = roomInterior ? (roomInterior.maxZ - SANDBOX_CONFIG.playerRadius - SANDBOX_CONFIG.skinWidth).toFixed(2) : "2.83";

  const expTableMinX = tableCol ? (tableCol.bounds.minX - SANDBOX_CONFIG.playerRadius - SANDBOX_CONFIG.skinWidth).toFixed(2) : "-1.87";
  const expTableMaxX = tableCol ? (tableCol.bounds.maxX + SANDBOX_CONFIG.playerRadius + SANDBOX_CONFIG.skinWidth).toFixed(2) : "1.87";
  const expTableMinZ = tableCol ? (tableCol.bounds.minZ - SANDBOX_CONFIG.playerRadius - SANDBOX_CONFIG.skinWidth).toFixed(2) : "-0.67";
  const expTableMaxZ = tableCol ? (tableCol.bounds.maxZ + SANDBOX_CONFIG.playerRadius + SANDBOX_CONFIG.skinWidth).toFixed(2) : "1.47";

  return (
    <div
      className="flex h-screen w-screen flex-col bg-slate-950 text-slate-100 select-none"
      data-testid="sandbox-prototype-container"
      data-look-dragging={isLookDragging ? "true" : "false"}
      data-look-button={lookButton}
      data-key-w={keysState.keyW ? "true" : "false"}
      data-key-a={keysState.keyA ? "true" : "false"}
      data-key-s={keysState.keyS ? "true" : "false"}
      data-key-d={keysState.keyD ? "true" : "false"}
      data-player-x={playerPosState[0].toFixed(2)}
      data-player-z={playerPosState[1].toFixed(2)}
      data-is-moving={isMoving ? "true" : "false"}
      data-blocked-wall={blockedWall}
      data-blocked-obstacle={blockedObstacle.id ? `${blockedObstacle.id}:${blockedObstacle.side}` : "none"}
      data-spawn-valid={isSpawnValid ? "true" : "false"}
      data-room-interior={`X[${minXAllowed}..${maxXAllowed}] Z[${minZAllowed}..${maxZAllowed}]`}
      data-table-bounds={tableCol ? `X[${tableCol.bounds.minX}..${tableCol.bounds.maxX}] Z[${tableCol.bounds.minZ}..${tableCol.bounds.maxZ}]` : ""}
      data-expanded-table={`X[${expTableMinX}..${expTableMaxX}] Z[${expTableMinZ}..${expTableMaxZ}]`}
      data-yaw={yaw.toFixed(3)}
      data-pitch={pitch.toFixed(3)}
      data-nearest-interactable={nearestInteractable?.id ?? "none"}
      data-can-interact={nearestInteractable?.canInteract ? "true" : "false"}
      data-is-held={isHeld ? "true" : "false"}
      data-can-pickup={canPickup ? "true" : "false"}
      data-held-resolved-dist={heldDiag ? heldDiag.resolvedDistance.toFixed(2) : ""}
      data-held-hit-obstacle={heldDiag ? (heldDiag.hitObstacleId ?? "none") : ""}
    >
      <header className="flex items-center justify-between border-b border-slate-800 bg-slate-900 px-6 py-3 shrink-0">
        <div>
          <h1 className="text-lg font-bold text-cyan-400">Stage S-7 v2 — Sandbox Dev Prototype (S7-V2.6 PickUp & Held Rig)</h1>
          <p className="text-xs text-slate-400">Изолированный 3D-прототип (Подбор предметов, Held Rig, Raycast Safe Distance)</p>
        </div>
        <div className="flex items-center gap-4 text-xs font-mono text-slate-300">
          <div data-testid="pos-display">Pos: [{playerPosState[0].toFixed(2)}, {playerPosState[1].toFixed(2)}]</div>
          <div data-testid="yaw-display">Yaw: {yaw.toFixed(2)}</div>
          <div data-testid="pitch-display">Pitch: {pitch.toFixed(2)}</div>
          <div>FOV: {SANDBOX_CONFIG.defaultFov}°</div>
        </div>
      </header>

      <main
        className="relative flex-1 cursor-grab active:cursor-grabbing touch-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onContextMenu={handleContextMenu}
      >
        <Canvas camera={{ position: [playerPosState[0], SANDBOX_CONFIG.eyeHeight, playerPosState[1]], fov: SANDBOX_CONFIG.defaultFov }}>
          <ambientLight intensity={0.5} />
          <directionalLight position={[5, 8, 5]} intensity={1.2} castShadow />
          <Suspense fallback={null}>
            <SandboxRoomGeometry onRegisterCollider={handleRegisterCollider} />
            {/* Flask: отображается на столе только когда не held */}
            {!isHeld && <PickableFlask pos={FLASK_ORIGIN} canPickup={canPickup} />}
            {/* Held Rig: рендерится внутри Canvas по camera.quaternion */}
            {isHeld && (
              <HeldFlask
                collidersRef={collidersRef}
                roomInteriorRef={roomInteriorRef}
                onDiagUpdate={handleHeldDiagUpdate}
              />
            )}
            <PickupController
              playerPosRef={playerPosRef}
              isHeldRef={isHeldRef}
              pickableItemsRef={pickableItemsRef}
              canPickupRef={canPickupRef}
              nearestPickupRef={nearestPickupRef}
            />
            <PlayerCylinderDebug playerPos={playerPosState} />
            <TableExpandedBoundsDebug tableCol={tableCol} />
          </Suspense>
          <SandboxCameraController playerPosRef={playerPosRef} yaw={yaw} pitch={pitch} />
        </Canvas>

        {/* Pickup Prompt — отображается при фокусе на колбе */}
        {canPickup && !isHeld && (
          <div className="pointer-events-none absolute inset-x-0 flex items-center justify-center" style={{ top: "45%" }}>
            <div className="rounded-xl border border-emerald-500/70 bg-slate-900/90 px-5 py-2 text-center backdrop-blur">
              <p className="text-base font-semibold text-emerald-300">
                <span className="mr-2 rounded border border-emerald-400 px-1.5 py-0.5 font-mono text-sm">[E]</span>
                Взять: Колба
              </p>
            </div>
          </div>
        )}
        {/* Held Prompt — отображается пока колба в руке */}
        {isHeld && (
          <div className="pointer-events-none absolute inset-x-0 flex items-center justify-center" style={{ top: "45%" }}>
            <div className="rounded-xl border border-amber-500/70 bg-slate-900/90 px-5 py-2 text-center backdrop-blur">
              <p className="text-sm font-semibold text-amber-300">
                <span className="mr-2 rounded border border-amber-400 px-1.5 py-0.5 font-mono text-sm">[E]</span>
                Отпустить
                <span className="ml-4 mr-1 rounded border border-slate-400 px-1.5 py-0.5 font-mono text-xs text-slate-300">[Esc]</span>
                <span className="text-slate-300">Вернуть</span>
              </p>
            </div>
          </div>
        )}
        {/* Interaction Prompt — DOM overlay при canInteract */}
        {nearestInteractable?.canInteract && (
          <div className="pointer-events-none absolute inset-x-0 top-1/2 flex items-center justify-center -translate-y-1/2">
            <div className="rounded-xl border border-cyan-500/60 bg-slate-900/90 px-5 py-2 text-center backdrop-blur">
              <p className="text-base font-semibold text-cyan-300">
                <span className="mr-2 rounded border border-cyan-400 px-1.5 py-0.5 font-mono text-sm text-cyan-400">E</span>
                {nearestInteractable.name}
              </p>
              <p className="mt-0.5 text-xs text-slate-400">{nearestInteractable.distance.toFixed(1)} m</p>
            </div>
          </div>
        )}
        {/* Панель отладки Debug Bounds */}
        <div className="pointer-events-none absolute top-4 left-4 rounded-xl border border-slate-700 bg-slate-900/80 p-3 text-xs backdrop-blur space-y-1">
          <p className="font-semibold text-cyan-300">Debug Bounds & Furniture Collisions (S7-V2.4):</p>
          {tableCol && (
            <>
              <div className="text-emerald-400 font-mono" data-testid="table-bounds-display">
                • Table Box3 ({tableCol.role}): X[{tableCol.bounds.minX}..{tableCol.bounds.maxX}] Z[{tableCol.bounds.minZ}..{tableCol.bounds.maxZ}]
              </div>
              <div className="text-amber-300 font-mono" data-testid="expanded-table-display">
                • Expanded Table Bounds (+R+Skin): X[{expTableMinX}..{expTableMaxX}] Z[{expTableMinZ}..{expTableMaxZ}]
              </div>
            </>
          )}
          <div className="text-amber-400 font-mono" data-testid="blocked-obstacle-display">
            • Obstacle Collision: <span className={blockedObstacle.id ? "text-red-400 font-bold" : "text-emerald-400"}>{blockedObstacle.id ? `${blockedObstacle.id} (${blockedObstacle.side.toUpperCase()})` : "NONE"}</span>
          </div>
          <div className="text-cyan-300 font-mono" data-testid="room-interior-display">
            • Room Interior: X[{minXAllowed}..{maxXAllowed}] Z[{minZAllowed}..{maxZAllowed}]
          </div>
          {isHeld && heldDiag && (
            <div className="text-purple-300 font-mono text-[11px] space-y-0.5 border-t border-slate-700 pt-1 mt-1" data-testid="held-diag-display">
              <div>• Held Diag: desiredDist={heldDiag.desiredDistance.toFixed(2)}m | resolvedDist={heldDiag.resolvedDistance.toFixed(2)}m</div>
              <div>• Hit Obstacle: <span className={heldDiag.hitObstacleId ? "text-amber-400 font-bold" : "text-emerald-400"}>{heldDiag.hitObstacleId ?? "NONE"}</span> (dist: {heldDiag.hitDistance === Infinity ? "INF" : heldDiag.hitDistance.toFixed(2) + "m"})</div>
              <div>• Desired WorldPos: [{heldDiag.desiredWorldPos.map((v) => v.toFixed(2)).join(", ")}]</div>
              <div>• Final WorldPos: [{heldDiag.finalWorldPos.map((v) => v.toFixed(2)).join(", ")}]</div>
              <div>• Object Radius: {heldDiag.objectRadius.toFixed(2)}m</div>
            </div>
          )}
        </div>

        {/* Панель инструкции */}
        <div className="pointer-events-none absolute bottom-4 left-4 rounded-xl border border-slate-700 bg-slate-900/80 p-3 text-xs backdrop-blur">
          <p className="font-semibold text-cyan-300 mb-1">Управление (S7-V2.6 PickUp):</p>
          <ul className="space-y-1 text-slate-300">
            <li>• <span className="font-mono text-amber-300">W / A / S / D</span> — Движение с обходом и скольжением</li>
            <li>• <span className="font-mono text-emerald-300">[E]</span> — Подойди к колбе, нацелься, возьми / отпусти</li>
            <li>• <span className="font-mono text-amber-300">[Esc]</span> — Вернуть предмет на стол</li>
            <li>• <span className="font-mono text-amber-300">Оранжевый каркас</span> — Расширенные бордеры стола</li>
          </ul>
        </div>
      </main>
    </div>
  );
}
