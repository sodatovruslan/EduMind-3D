import * as THREE from "three";

const NO_RAYCAST: THREE.Object3D["raycast"] = () => undefined;

/** Temporarily removes a visible object subtree from Three.js raycasting. */
export function suppressRaycastTree(root: THREE.Object3D): () => void {
  const originals = new Map<THREE.Object3D, THREE.Object3D["raycast"]>();
  root.traverse((object) => {
    originals.set(object, object.raycast);
    object.raycast = NO_RAYCAST;
  });

  let restored = false;
  return () => {
    if (restored) return;
    restored = true;
    originals.forEach((raycast, object) => {
      object.raycast = raycast;
    });
  };
}
