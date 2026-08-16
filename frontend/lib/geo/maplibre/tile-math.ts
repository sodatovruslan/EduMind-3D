// G6.10 — вынесено из /geoworld-maplibre-spike (G6.7-G6.9) как reusable
// production-foundation модуль. Стандартная Web Mercator XYZ-адресация —
// та же формула, что уже проверена/протестирована в
// lib/geo/providers/terrarium-grid.ts (production, G4), НЕ переизобретена
// заново — просто локальная копия без THREE.js-зависимостей terrain-grid,
// т.к. этот модуль должен оставаться изолированным от geodetic-квадротрёх
// production tile-engine (см. GEOWORLD_ROADMAP.md, G6.7 "спайк изолирован").

export interface TileXY {
  x: number;
  y: number;
}

export function lngLatToTileXY(lng: number, lat: number, z: number): TileXY {
  const n = 2 ** z;
  const x = Math.floor(((lng + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
  return { x: Math.max(0, Math.min(n - 1, x)), y: Math.max(0, Math.min(n - 1, y)) };
}
