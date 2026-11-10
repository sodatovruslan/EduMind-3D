"use client";

import { Suspense, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { Canvas, useThree } from "@react-three/fiber";
import { ContactShadows, Environment, Grid, Lightformer, OrbitControls } from "@react-three/drei";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import { QUALITY_PRESETS, type QualityLevel } from "@/lib/quality-context";
import { CameraMode } from "@/lib/chemistry-lab-modes";
import { SandboxLocomotionController } from "@/components/chemistry/sandbox/SandboxLocomotionController";
import { RoomInteriorBounds, RegisteredCollider } from "@/lib/sandbox-locomotion";

interface CanvasShellProps {
  children: React.ReactNode;
  cameraPosition?: [number, number, number];
  target?: [number, number, number];
  floorY?: number;
  bloomIntensity?: number;
  showFloor?: boolean;
  backgroundTop?: string;
  backgroundBottom?: string;
  quality?: QualityLevel;
  // отключить OrbitControls (например, пока пользователь тянет провод
  // в Electricity Lab — иначе тот же pointer-жест крутит камеру)
  orbitEnabled?: boolean;
  // опциональные ограничения угла обзора (по умолчанию не заданы — полное
  // вращение на 360°, как и раньше, для SimLab/GeoWorld ничего не меняется)
  minPolarAngle?: number;
  maxPolarAngle?: number;
  // опциональные ограничения дистанции камеры (по умолчанию 2/14, как и
  // раньше) — Chemistry World сужает диапазон, чтобы нельзя было "улететь"
  // далеко от маленькой комнаты и увидеть ее со стороны
  minDistance?: number;
  maxDistance?: number;
  // опциональные ограничения по азимуту (по умолчанию не заданы — полный
  // оборот на 360°, как и раньше) — Chemistry World ограничивает передней
  // дугой, чтобы камера не могла обогнуть комнату и посмотреть на нее снаружи
  minAzimuthAngle?: number;
  maxAzimuthAngle?: number;
  // Режим управления камерой (Stage S-7 v2): "orbit" (S-6) | "sandbox" (S-7 FPS)
  cameraMode?: CameraMode;
  roomBounds?: RoomInteriorBounds;
  colliders?: RegisteredCollider[];
  onPosUpdate?: (playerPos: [number, number], cameraXZ: [number, number]) => void;
  isFullscreen?: boolean;
  // приостановить FPS-локомоцию, не переключая cameraMode целиком (нужно,
  // например, пока идёт МЫШИНЫЙ драг компонента/провода в Electricity Lab —
  // клавиатурный E-перенос при этом продолжает работать)
  locomotionPaused?: boolean;
}

function CameraModeController({ cameraMode, orbitTarget }: { cameraMode: CameraMode; orbitTarget: [number, number, number] }) {
  const { camera } = useThree();
  const orbitSnapshotRef = useRef<{ position: THREE.Vector3; target: THREE.Vector3 } | null>(null);
  const prevModeRef = useRef<CameraMode>(cameraMode);

  useEffect(() => {
    const prevMode = prevModeRef.current;
    if (prevMode === "orbit" && cameraMode === "sandbox") {
      // Сохраняем Orbit snapshot перед переходом в Sandbox
      orbitSnapshotRef.current = {
        position: camera.position.clone(),
        target: new THREE.Vector3(...orbitTarget),
      };
    } else if (prevMode === "sandbox" && cameraMode === "orbit" && orbitSnapshotRef.current) {
      // Точно восстанавливаем Orbit snapshot при возврате в Orbit Mode
      camera.position.copy(orbitSnapshotRef.current.position);
      camera.lookAt(orbitSnapshotRef.current.target);
      camera.updateMatrixWorld();
    }
    prevModeRef.current = cameraMode;
  }, [cameraMode, camera, orbitTarget]);

  return null;
}

// вертикальный градиент вместо плоской заливки — рисуем на canvas и
// используем как scene.background, без единого сетевого запроса за HDR
function GradientBackground({ top, bottom }: { top: string; bottom: string }) {
  const { scene } = useThree();
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 4;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
      gradient.addColorStop(0, top);
      gradient.addColorStop(1, bottom);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, [top, bottom]);

  useEffect(() => {
    scene.background = texture;
    return () => {
      texture.dispose();
    };
  }, [scene, texture]);

  return null;
}

/**
 * Общий контейнер для всех 3D-сцен: Canvas, камера, орбитальное управление
 * (полное вращение на 360°), студийный свет, градиентный фон с туманом,
 * опциональные измерительная сетка/тени пола, и Bloom.
 *
 * HDRI-окружение собрано процедурно из drei <Lightformer> (три "световые
 * панели" формируют env-карту прямо в сцене через отдельный рендер-пас),
 * а не через preset-текстуры <Environment preset=...> — те тянут HDR
 * с внешнего CDN на каждую загрузку, а платформа должна одинаково надежно
 * работать в школах с нестабильным интернетом. Так получаем настоящие
 * отражения на стекле/металле без единого сетевого запроса.
 */
export default function CanvasShell({
  children,
  cameraPosition = [4, 3, 5],
  target = [0, 0, 0],
  floorY = -1,
  bloomIntensity = 0.55,
  showFloor = true,
  // D6.1 — retuned from the legacy saturated indigo-navy (#1e2340/#04050c)
  // to a neutral graphite-with-a-whisper-of-cool-undertone gradient,
  // matching Design V2's dark-mode direction (§4 of the D6.1 brief: "not
  // old dark navy SaaS UI"). This is the WebGL scene's own background
  // texture (visible above/around room geometry, not UI chrome), so it's
  // intentionally NOT wired to the Light/Dark theme — the brief explicitly
  // separates "UI chrome theme" from "physical/scientific environment",
  // and the scene's lighting/atmosphere stays as designed regardless of
  // the student's chrome theme choice.
  backgroundTop = "#1c1f26",
  backgroundBottom = "#05060a",
  quality = "medium",
  orbitEnabled = true,
  minPolarAngle,
  maxPolarAngle,
  minDistance = 2,
  maxDistance = 14,
  minAzimuthAngle,
  maxAzimuthAngle,
  cameraMode = "orbit",
  roomBounds,
  colliders,
  onPosUpdate,
  isFullscreen = false,
  locomotionPaused = false,
}: CanvasShellProps) {
  const preset = QUALITY_PRESETS[quality];

  return (
    <div
      // Manual-acceptance bug fix: this container's height is what the R3F
      // canvas's own ResizeObserver watches. Animating height (`transition-
      // all` included it) while the ANCESTOR wrapper (in ChemistryWorldScene)
      // snaps its own fullscreen classes INSTANTLY in the same commit meant
      // the document was resizing continuously for 300ms against a parent
      // whose box had already changed shape — a real, verifiable source of a
      // transient (sometimes sticky) scrollbar right after exiting
      // fullscreen. Height/width now snap immediately; only the cosmetic
      // border-radius/shadow still animate, which never affects layout.
      //
      // D6 — non-fullscreen height changed from a fixed `h-[34rem]` (544px,
      // regardless of viewport) to a viewport-relative range so the 3D world
      // dominates the immersive viewport at rest, not just in fullscreen
      // (EDUMIND_DESIGN_SYSTEM_V2.md D6 §2). Still a static value (no
      // `transition` on height/width), same reasoning as above — only the
      // number changed, not the snap-vs-animate mechanism.
      className={`relative w-full overflow-hidden transition-[border-radius,box-shadow] duration-300 ${
        isFullscreen
          ? "h-full rounded-none border-none shadow-none"
          : "h-[75vh] min-h-[28rem] max-h-[48rem] rounded-2xl border border-white/10 shadow-2xl"
      }`}
    >
      <Canvas
        camera={{ position: cameraPosition, fov: 42 }}
        shadows
        dpr={preset.dpr}
        gl={{ antialias: true }}
        onCreated={({ gl }) => {
          // localClippingEnabled — свойство инстанса рендерера, а не параметр
          // конструктора WebGLRenderer, поэтому его нельзя передать через gl={{...}}
          gl.localClippingEnabled = true;
        }}
      >
        <GradientBackground top={backgroundTop} bottom={backgroundBottom} />
        <fog attach="fog" args={[backgroundBottom, 10, 22]} />

        <ambientLight intensity={0.3} />
        <directionalLight
          position={[5, 8, 5]}
          intensity={1.4}
          castShadow
          shadow-mapSize={[preset.shadowMapSize, preset.shadowMapSize]}
          shadow-bias={-0.0005}
        />
        <directionalLight position={[-6, 3, -4]} intensity={0.4} color="#818cf8" />

        <Environment resolution={256}>
          <Lightformer intensity={3} color="#ffffff" position={[0, 5, -6]} scale={[10, 5, 1]} />
          <Lightformer intensity={2} color="#818cf8" position={[-6, 2, 2]} rotation={[0, Math.PI / 2, 0]} scale={[6, 6, 1]} />
          <Lightformer intensity={2} color="#38bdf8" position={[6, 2, 2]} rotation={[0, -Math.PI / 2, 0]} scale={[6, 6, 1]} />
          <Lightformer intensity={1} color="#ffffff" position={[0, -3, 3]} rotation={[Math.PI / 2, 0, 0]} scale={[10, 10, 1]} />
        </Environment>

        <Suspense fallback={null}>{children}</Suspense>

        {showFloor && (
          <>
            {preset.enableContactShadows && (
              <ContactShadows position={[0, floorY, 0]} opacity={0.6} scale={14} blur={2.2} far={3} resolution={256} />
            )}
            <Grid
              position={[0, floorY + 0.001, 0]}
              args={[20, 20]}
              cellSize={0.5}
              cellThickness={0.4}
              cellColor="#293150"
              sectionSize={2.5}
              sectionThickness={1}
              sectionColor="#6366F1"
              fadeDistance={16}
              fadeStrength={1.5}
              infiniteGrid
            />
          </>
        )}

        <CameraModeController cameraMode={cameraMode} orbitTarget={target} />
        <SandboxLocomotionController
          active={cameraMode === "sandbox" && !locomotionPaused}
          roomBounds={roomBounds}
          colliders={colliders}
          onPosUpdate={onPosUpdate}
        />

        <OrbitControls
          makeDefault
          enabled={cameraMode === "sandbox" ? false : orbitEnabled}
          enableDamping
          dampingFactor={0.08}
          minDistance={minDistance}
          maxDistance={maxDistance}
          minPolarAngle={minPolarAngle}
          maxPolarAngle={maxPolarAngle}
          minAzimuthAngle={minAzimuthAngle}
          maxAzimuthAngle={maxAzimuthAngle}
          target={target}
        />

        {preset.enableBloom && (
          <EffectComposer multisampling={0}>
            <Bloom luminanceThreshold={0.35} luminanceSmoothing={0.9} intensity={bloomIntensity} mipmapBlur radius={0.6} />
          </EffectComposer>
        )}
      </Canvas>
    </div>
  );
}
