// G6.11 §19 — нормализованный, сериализуемый снимок состояния камеры.
// НЕ путать "центр камеры" с "ученик смотрит на регион X" (прямое
// предупреждение задания) — этот модуль отдаёт только сырые числа
// (center/zoom/bearing/pitch), region-lookup здесь сознательно не делается
// (нет надёжного источника границ регионов на клиенте, см. compatibility
// audit в GEOWORLD_ROADMAP.md — определение континента остаётся на
// бэкенде, `classify_continent`, тот же принцип и здесь).

export interface CameraContext {
  center: [number, number];
  zoom: number;
  bearing: number;
  pitch: number;
}

export function normalizeCameraState(map: any): CameraContext {
  const center = map.getCenter();
  return {
    center: [Number(center.lng.toFixed(4)), Number(center.lat.toFixed(4))],
    zoom: Number(map.getZoom().toFixed(2)),
    bearing: Number(map.getBearing().toFixed(1)),
    pitch: Number(map.getPitch().toFixed(1)),
  };
}
