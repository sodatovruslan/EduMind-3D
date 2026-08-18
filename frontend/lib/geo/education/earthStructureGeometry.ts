// G6.12 QA FIX — pure geometry/visibility logic extracted from
// EarthStructureMode.tsx so it's testable without a WebGL/R3F context
// (jsdom has no canvas/WebGL). Radii are the SAME numbers the old R3F
// renderer already used (GeoWorldScene.tsx) — not reinvented.
import * as THREE from "three";
import type { EarthLayerKey } from "./useGeoLessonState";

export const CRUST_R = 1.0;
export const MANTLE_R = 0.9;
export const OUTER_CORE_R = 0.58;
export const INNER_CORE_R = 0.32;

export const LAYER_RADII: Record<EarthLayerKey, number> = {
  crust: CRUST_R,
  mantle: MANTLE_R,
  outer_core: OUTER_CORE_R,
  inner_core: INNER_CORE_R,
};

export const LAYER_ORDER: EarthLayerKey[] = ["crust", "mantle", "outer_core", "inner_core"];

// inner_core намеренно НЕ разрезается — внутри самого маленького, самого
// глубокого слоя уже нечего показывать, цельный шар в центре — привычный
// вид на учебных схемах Земли в разрезе.
export const CUT_LAYERS = new Set<EarthLayerKey>(["crust", "mantle", "outer_core"]);

// Плоскость среза: убирает половину каждой оболочки СО СТОРОНЫ камеры
// (камера стоит на +z) — normal=(0,0,-1), точки с z>0 (ближе к камере)
// отсекаются, остаётся дальнее полушарие (z<=0), его внутренняя стенка
// (DoubleSide) обращена прямо на камеру сквозь проём среза.
export const CUT_PLANE = new THREE.Plane(new THREE.Vector3(0, 0, -1), -0.001);

// G6.12 QA FIX round 2 (владелец продукта, скриншоты): камера строго по
// оси среза давала плоский "bullseye" — концентрические круги читались
// НЕ как 3D-сфера с вырезом, а как плоская мишень (нет видимой кривизны
// внешней оболочки). Камера смещена в 3/4-ракурс — по-прежнему на стороне
// среза (z>0, видит внутрь выреза), но с заметным смещением по X/Y, чтобы
// был виден изгиб внешнего края оболочек — классический вид "разрезанного
// апельсина", однозначно читаемый как 3D, а не плоский узор. Направление
// (форма ракурса) фиксировано, ДИСТАНЦИЮ вдоль этого направления считает
// computeCameraPosition ниже — по реальному aspect ratio канваса.
const CAMERA_DIRECTION = new THREE.Vector3(1.35, 1.05, 1.75).normalize();

// G6.12 QA FIX round 3 (владелец продукта, скриншот 390×844): камера,
// откалиброванная под широкий desktop-канвас, обрезала крест на узком
// портретном мобильном канвасе — CanvasShell использует ФИКСИРОВАННЫЙ
// вертикальный FOV (42°, не адаптивный), поэтому на портретном aspect
// (ширина < высоты) ГОРИЗОНТАЛЬНЫЙ FOV уже вертикального — модель,
// подобранная по вертикали, не помещается по ширине. Дистанция камеры
// теперь считается по РЕАЛЬНОМУ aspect ratio канваса так, чтобы весь
// cutaway (включая внешние подписи) гарантированно помещался в кадр по
// ОБЕИМ осям, а не только по вертикали.
const VERTICAL_FOV_DEG = 42;
const OBJECT_RADIUS = CRUST_R + 0.14; // крайняя точка — внешняя подпись коры (LABEL_EXTRA_OFFSET)
const FIT_MARGIN = 1.25; // запас, чтобы подписи не упирались в самый край канваса

// Должно совпадать с `maxDistance` у <GlobeControls> в EarthStructureMode.tsx.
// На экстремально узких портретных aspect (уже реальных телефонов) формула
// ниже теоретически может запросить дистанцию больше этого предела — клэмп
// не даёт функции вернуть значение, которое GlobeControls всё равно обрежет
// молча (лучше явный, тестируемый предел, чем неявное поведение контрола).
export const MAX_CAMERA_DISTANCE = 8;

export function computeCameraDistance(aspect: number): number {
  const vHalf = (VERTICAL_FOV_DEG / 2) * (Math.PI / 180);
  // aspect < 1 (портрет) — горизонтальный FOV уже вертикального, именно он
  // становится "узким местом"; aspect >= 1 (landscape) — вертикальный FOV
  // остаётся более тесным ограничением.
  const limitingHalfFov = aspect < 1 ? Math.atan(Math.tan(vHalf) * aspect) : vHalf;
  const distance = (OBJECT_RADIUS / Math.tan(limitingHalfFov)) * FIT_MARGIN;
  return Math.min(distance, MAX_CAMERA_DISTANCE);
}

export function computeCameraPosition(aspect: number): [number, number, number] {
  const distance = computeCameraDistance(aspect);
  const v = CAMERA_DIRECTION.clone().multiplyScalar(distance);
  return [v.x, v.y, v.z];
}

// Направления меток — РАЗНЫЕ на каждый слой (веер, не одна общая ось).
// Реальный баг со скриншота: все 4 метки лежали на одном луче LABEL_DIR,
// радиусы соседних слоёв (1.0 и 0.9) отличались меньше, чем добавочный
// отступ — подписи "Земная кора" и "Мантия" налезали друг на друга на
// экране. Каждому слою — свой луч (в пределах видимой стороны среза), веер
// сверху вниз — гарантированно разносит подписи по экрану независимо от
// того, насколько близки радиусы самих оболочек.
export const LABEL_DIRECTIONS: Record<EarthLayerKey, THREE.Vector3> = {
  crust: new THREE.Vector3(0.3, 0.6, -0.74).normalize(),
  mantle: new THREE.Vector3(0.62, 0.28, -0.72).normalize(),
  outer_core: new THREE.Vector3(0.72, -0.12, -0.68).normalize(),
  inner_core: new THREE.Vector3(0.4, -0.55, -0.73).normalize(),
};
export const LABEL_EXTRA_OFFSET = 0.14;

/**
 * Без выбора — все слои читаются одинаково чётко (полная непрозрачность,
 * сам cutaway уже показывает структуру геометрией, x-ray-прозрачность
 * больше не нужна). С выбором — выбранный слой остаётся полностью
 * непрозрачным, остальные ПРИГЛУШЕНЫ, но не исчезают (spatial context).
 */
export function computeLayerOpacity(anySelected: boolean, selected: boolean): number {
  return !anySelected || selected ? 1 : 0.45;
}

/**
 * Three.js raycasting НЕ учитывает clippingPlanes — луч физически попадает
 * и в отрезанную (невидимую) половину геометрии. Клик засчитывается ТОЛЬКО
 * если точка попадания реально лежит на видимой стороне плоскости среза
 * (для нецельных/"cut" слоёв) — иначе клик по видимой пустоте перед
 * моделью тихо выбирал бы неверный слой.
 */
export function isClickOnVisibleSurface(layer: EarthLayerKey, point: THREE.Vector3): boolean {
  if (!CUT_LAYERS.has(layer)) return true;
  return CUT_PLANE.distanceToPoint(point) >= 0;
}
