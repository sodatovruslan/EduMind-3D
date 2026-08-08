import * as THREE from "three";

// Единая система координат для всей GeoWorld-сцены (не только тайлового
// движка) — формулы перенесены сюда из GeoWorldScene.tsx один в один
// (было: локальная функция latLngToVector3 + инлайновая обратная формула
// внутри handleClick), чтобы тайловый движок G2 использовал ТУ ЖЕ систему
// координат, что и остальная сцена, а не заводил вторую независимую.

export function latLngToVector3(latDeg: number, lngDeg: number, radius: number): THREE.Vector3 {
  const latRad = (latDeg * Math.PI) / 180;
  const phiPositive = ((lngDeg + 180) / 360) * Math.PI * 2;
  const cosLat = Math.cos(latRad);
  const y = Math.sin(latRad) * radius;
  const x = -Math.cos(phiPositive) * cosLat * radius;
  const z = Math.sin(phiPositive) * cosLat * radius;
  return new THREE.Vector3(x, y, z);
}

// Обратное преобразование — точный инверс latLngToVector3, вынесено из
// EarthLayers.handleClick (там точка предварительно переводится в локальные
// координаты вращающейся группы через worldToLocal, эта функция принимает
// уже локальный вектор).
export function vector3ToLatLng(point: THREE.Vector3): { lat: number; lng: number } {
  const v = point.clone().normalize();
  const lat = Math.asin(THREE.MathUtils.clamp(v.y, -1, 1)) * (180 / Math.PI);
  let phi = Math.atan2(v.z, -v.x);
  if (phi < 0) phi += Math.PI * 2;
  const lng = (phi / (Math.PI * 2)) * 360 - 180;
  return { lat, lng };
}
