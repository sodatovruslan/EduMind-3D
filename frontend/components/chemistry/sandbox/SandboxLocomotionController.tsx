"use client";

import React, { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import {
  calculateKinematicStep,
  DEFAULT_ROOM_INTERIOR,
  RegisteredCollider,
  RoomInteriorBounds,
  Vector2D,
} from "@/lib/sandbox-locomotion";

interface SandboxLocomotionControllerProps {
  active: boolean;
  spawnPos?: [number, number];
  speed?: number;
  playerRadius?: number;
  skinWidth?: number;
  roomBounds?: RoomInteriorBounds;
  colliders?: RegisteredCollider[];
  onPosUpdate?: (playerPos: [number, number], cameraXZ: [number, number]) => void;
}

const START_POS: [number, number] = [0, 2.5];
const START_YAW = 0;
const START_PITCH = -0.308;

/**
 * Переиспользуемый R3F-контроллер свободного перемещения от первого лица (Stage S-7 v2).
 * Работает внутри <Canvas>. Когда active === false, не трогает позицию/ориентацию камеры.
 */
export function SandboxLocomotionController({
  active,
  spawnPos = START_POS,
  speed = 2.5,
  playerRadius = 0.20,
  skinWidth = 0.01,
  roomBounds,
  colliders = [],
  onPosUpdate,
}: SandboxLocomotionControllerProps) {
  const { camera, gl } = useThree();

  const playerPosRef = useRef<[number, number]>(spawnPos);
  const yawRef = useRef<number>(START_YAW);
  const pitchRef = useRef<number>(START_PITCH);
  const inputVecRef = useRef<Vector2D>({ x: 0, z: 0 });
  const keysPressedRef = useRef<Record<string, boolean>>({});
  const isDraggingRef = useRef<boolean>(false);
  const lastPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Сброс всех клавиш и состояния при потере фокуса / скрытии вкладки
  useEffect(() => {
    function resetAllInputs() {
      keysPressedRef.current = {};
      inputVecRef.current = { x: 0, z: 0 };
      isDraggingRef.current = false;
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

  // Клавиатурный ввод WASD / ЦФЫВ / Стрелки
  useEffect(() => {
    if (!active) return;

    function getDirectionKey(e: KeyboardEvent): "w" | "a" | "s" | "d" | null {
      const code = e.code;
      const key = e.key ? e.key.toLowerCase() : "";

      if (code === "KeyW" || key === "w" || key === "ц" || key === "arrowup") return "w";
      if (code === "KeyS" || key === "s" || key === "ы" || key === "arrowdown") return "s";
      if (code === "KeyA" || key === "a" || key === "ф" || key === "arrowleft") return "a";
      if (code === "KeyD" || key === "d" || key === "в" || key === "arrowright") return "d";

      return null;
    }

    function isTypingTarget(target: EventTarget | null): boolean {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable) return true;
      return false;
    }

    function updateInputFromKeys() {
      const keys = keysPressedRef.current;
      const keyW = !!keys["w"];
      const keyA = !!keys["a"];
      const keyS = !!keys["s"];
      const keyD = !!keys["d"];

      let dx = 0;
      let dz = 0;
      if (keyW) dz += 1;
      if (keyS) dz -= 1;
      if (keyA) dx -= 1;
      if (keyD) dx += 1;

      inputVecRef.current = { x: dx, z: dz };
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return;
      const dir = getDirectionKey(e);
      if (dir) {
        keysPressedRef.current[dir] = true;
        updateInputFromKeys();
      }
    }

    function handleKeyUp(e: KeyboardEvent) {
      const dir = getDirectionKey(e);
      if (dir) {
        delete keysPressedRef.current[dir];
        updateInputFromKeys();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [active]);

  // Мышиный просмотр (Mouse-look) через ПКМ / СКМ
  useEffect(() => {
    if (!active) return;
    const domElement = gl.domElement;
    if (!domElement) return;

    function handlePointerDown(e: PointerEvent) {
      if (e.button === 2 || e.button === 1) {
        e.preventDefault();
        domElement.setPointerCapture(e.pointerId);
        isDraggingRef.current = true;
        lastPosRef.current = { x: e.clientX, y: e.clientY };
      }
    }

    function handlePointerMove(e: PointerEvent) {
      if (!isDraggingRef.current) return;

      const dx = e.movementX !== undefined && e.movementX !== 0 ? e.movementX : e.clientX - lastPosRef.current.x;
      const dy = e.movementY !== undefined && e.movementY !== 0 ? e.movementY : e.clientY - lastPosRef.current.y;
      lastPosRef.current = { x: e.clientX, y: e.clientY };

      const sens = 0.003;
      let newYaw = yawRef.current - dx * sens;
      const newPitch = Math.max(-1.3, Math.min(1.3, pitchRef.current - dy * sens));

      // Нормализация yaw в [-PI, PI]
      newYaw = newYaw % (2 * Math.PI);
      if (newYaw > Math.PI) newYaw -= 2 * Math.PI;
      if (newYaw < -Math.PI) newYaw += 2 * Math.PI;

      yawRef.current = newYaw;
      pitchRef.current = newPitch;
    }

    function handlePointerUp(e: PointerEvent) {
      if (isDraggingRef.current) {
        if (domElement.hasPointerCapture(e.pointerId)) {
          domElement.releasePointerCapture(e.pointerId);
        }
        isDraggingRef.current = false;
      }
    }

    function handleContextMenu(e: MouseEvent) {
      e.preventDefault();
    }

    domElement.addEventListener("pointerdown", handlePointerDown);
    domElement.addEventListener("pointermove", handlePointerMove);
    domElement.addEventListener("pointerup", handlePointerUp);
    domElement.addEventListener("contextmenu", handleContextMenu);

    return () => {
      domElement.removeEventListener("pointerdown", handlePointerDown);
      domElement.removeEventListener("pointermove", handlePointerMove);
      domElement.removeEventListener("pointerup", handlePointerUp);
      domElement.removeEventListener("contextmenu", handleContextMenu);
    };
  }, [active, gl]);

  // Главный кинематический tick движения от первого лица
  useFrame((_, delta) => {
    if (!active) return;

    if (!roomBounds) {
      console.warn("[SandboxLocomotion] Movement blocked — real wall collision registry is not ready!");
      return;
    }

    const deltaSec = Math.min(0.05, delta);
    const input = inputVecRef.current;

    if (input.x !== 0 || input.z !== 0) {
      const step = calculateKinematicStep(
        playerPosRef.current,
        input,
        yawRef.current,
        speed,
        deltaSec,
        roomBounds,
        colliders,
        playerRadius,
        skinWidth
      );
      playerPosRef.current = step.nextPos;
    }

    // Обновление позиции и ориентации Three.js камеры
    const px = playerPosRef.current[0];
    const pz = playerPosRef.current[1];
    camera.position.set(px, 1.6, pz);

    const euler = new THREE.Euler(pitchRef.current, yawRef.current, 0, "YXZ");
    camera.quaternion.setFromEuler(euler);

    if (onPosUpdate) {
      onPosUpdate(playerPosRef.current, [camera.position.x, camera.position.z]);
    }
  });

  return null;
}
