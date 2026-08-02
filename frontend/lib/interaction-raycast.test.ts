import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { suppressRaycastTree } from "./interaction-raycast";

describe("held-object raycast compatibility", () => {
  it("keeps the subtree visible while suppressing every held raycast", () => {
    const root = new THREE.Group();
    const child = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const nested = new THREE.Mesh(new THREE.SphereGeometry(1));
    child.add(nested);
    root.add(child);
    const rootRaycast = root.raycast;
    const childRaycast = child.raycast;
    const nestedRaycast = nested.raycast;

    const restore = suppressRaycastTree(root);

    expect(root.visible).toBe(true);
    expect(child.visible).toBe(true);
    expect(nested.visible).toBe(true);
    expect(root.raycast).not.toBe(rootRaycast);
    expect(child.raycast).not.toBe(childRaycast);
    expect(nested.raycast).not.toBe(nestedRaycast);
    const intersections: THREE.Intersection[] = [];
    child.raycast(new THREE.Raycaster(), intersections);
    expect(intersections).toEqual([]);

    restore();
    expect(root.raycast).toBe(rootRaycast);
    expect(child.raycast).toBe(childRaycast);
    expect(nested.raycast).toBe(nestedRaycast);
  });

  it("restores idle/focused raycast functions idempotently", () => {
    const root = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    root.add(mesh);
    const original = mesh.raycast;
    const restore = suppressRaycastTree(root);

    restore();
    restore();

    expect(mesh.raycast).toBe(original);
  });
});
