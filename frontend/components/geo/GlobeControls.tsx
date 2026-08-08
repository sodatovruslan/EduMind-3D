"use client";

/**
 * GlobeControls — Google-Earth-style camera controls for the GeoWorld globe.
 *
 * The camera orbits the origin (0,0,0) in spherical coordinates.
 *   - Left-drag : rotate (orbit around globe)
 *   - Wheel     : zoom (multiplicative, logarithmic feel)
 *   - Dbl-click : zoom toward the clicked point on the globe surface
 *   - Touch     : 1-finger drag = rotate, 2-finger pinch = zoom
 *   - Inertia decays smoothly on release
 *   - Poles are stable (phi clamped away from 0/π)
 *   - touchcancel and a window-level pointerup fallback recover cleanly
 *     from an interrupted gesture (same pattern as ComponentDragProvider/
 *     WireDragProvider) — the camera can never get stuck mid-drag/pinch
 *
 * Drop inside a <Canvas> / CanvasShell children and disable the default
 * OrbitControls via orbitEnabled={false}.
 */

import { useEffect, useRef } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import * as THREE from "three";

/* ---------- public props ---------- */

export interface GlobeControlsProps {
  /** Master on/off. */
  enabled?: boolean;
  /** Closest the camera can get to the globe center (must be > globe radius). */
  minDistance?: number;
  /** Farthest from the globe center. */
  maxDistance?: number;
  /** Wheel zoom sensitivity (1 = default). */
  zoomSpeed?: number;
  /** Drag rotation sensitivity (1 = default). */
  rotateSpeed?: number;
  /** Inertia damping per frame (0 = instant stop, 1 = infinite drift). */
  inertiaDamping?: number;
  /** Enable zoom-toward-point on double-click. */
  enableDoubleClickZoom?: boolean;
  /** Distance multiplier per double-click (0.5 = halve distance). */
  doubleClickZoomFactor?: number;
}

/* ---------- internal state ---------- */

interface State {
  /* target spherical coords (animation destination) */
  tgtTheta: number;
  tgtPhi: number;
  tgtDist: number;
  /* current interpolated spherical coords */
  theta: number;
  phi: number;
  dist: number;
  /* angular velocity for inertia (rad / frame) */
  vTheta: number;
  vPhi: number;
  /* pointer tracking */
  dragging: boolean;
  ptrX: number;
  ptrY: number;
  /* touch-pinch tracking */
  pinchDist: number;
  pinching: boolean;
}

/* ---------- constants ---------- */

const PHI_EPS = 0.05; // stay ≥0.05 rad from poles
const VEL_EPS = 1e-5;
const LERP = 0.12; // per-frame interpolation factor

// scratch objects reused every frame to avoid GC pressure
const _sph = new THREE.Spherical();
const _v3 = new THREE.Vector3();

/* ---------- pure helpers ---------- */

function clampPhi(p: number): number {
  return Math.max(PHI_EPS, Math.min(Math.PI - PHI_EPS, p));
}

function touchDist(a: Touch, b: Touch): number {
  const dx = a.clientX - b.clientX;
  const dy = a.clientY - b.clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

/* ---------- component ---------- */

export default function GlobeControls({
  enabled = true,
  minDistance = 1.12,
  maxDistance = 20,
  zoomSpeed = 1.0,
  rotateSpeed = 1.0,
  inertiaDamping = 0.9,
  enableDoubleClickZoom = true,
  doubleClickZoomFactor = 0.5,
}: GlobeControlsProps) {
  const { camera, gl } = useThree();
  const ref = useRef<State | null>(null);

  /** Clamp distance within configured bounds. */
  function clampD(d: number) {
    return Math.max(minDistance, Math.min(maxDistance, d));
  }

  /* ---- initialise from the camera's current position ---- */

  useEffect(() => {
    _sph.setFromVector3(camera.position);
    ref.current = {
      tgtTheta: _sph.theta,
      tgtPhi: _sph.phi,
      tgtDist: _sph.radius,
      theta: _sph.theta,
      phi: _sph.phi,
      dist: _sph.radius,
      vTheta: 0,
      vPhi: 0,
      dragging: false,
      ptrX: 0,
      ptrY: 0,
      pinchDist: 0,
      pinching: false,
    };
  }, [camera]);

  /* ---- DOM event wiring ---- */

  useEffect(() => {
    if (!enabled) return;
    const el = gl.domElement;
    const s = () => ref.current;

    /* --- pointer (mouse) --- */

    function onPointerDown(e: PointerEvent) {
      const st = s();
      if (!st || e.button !== 0) return; // left button only
      st.dragging = true;
      st.ptrX = e.clientX;
      st.ptrY = e.clientY;
      st.vTheta = 0;
      st.vPhi = 0;
    }

    function onPointerMove(e: PointerEvent) {
      const st = s();
      if (!st || !st.dragging) return;

      const dx = e.clientX - st.ptrX;
      const dy = e.clientY - st.ptrY;

      // rotation speed scales with distance — slower when close for precision
      const frac = Math.max(0.15, st.tgtDist / maxDistance);
      const spd = rotateSpeed * 0.004 * frac;

      const dT = -dx * spd;
      const dP = -dy * spd;

      st.tgtTheta += dT;
      st.tgtPhi = clampPhi(st.tgtPhi + dP);
      st.vTheta = dT;
      st.vPhi = dP;

      st.ptrX = e.clientX;
      st.ptrY = e.clientY;
    }

    function onPointerUp() {
      const st = s();
      if (st) st.dragging = false;
    }

    /* --- wheel --- */

    function onWheel(e: WheelEvent) {
      e.preventDefault(); // block page scroll
      const st = s();
      if (!st) return;
      const dir = e.deltaY > 0 ? 1.08 : 1 / 1.08;
      st.tgtDist = clampD(st.tgtDist * Math.pow(dir, zoomSpeed));
    }

    /* --- double-click --- */

    function onDblClick(e: MouseEvent) {
      if (!enableDoubleClickZoom) return;
      const st = s();
      if (!st) return;

      // raycast onto the unit sphere to find the clicked surface point
      const rect = el.getBoundingClientRect();
      const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      const rc = new THREE.Raycaster();
      rc.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);

      const sphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1.0);
      const hit = new THREE.Vector3();

      if (rc.ray.intersectSphere(sphere, hit)) {
        // fly toward the hit point
        const hs = new THREE.Spherical().setFromVector3(hit);
        st.tgtTheta = hs.theta;
        st.tgtPhi = clampPhi(hs.phi);
      }

      // zoom in
      st.tgtDist = clampD(st.tgtDist * doubleClickZoomFactor);
    }

    function onContextMenu(e: Event) {
      e.preventDefault();
    }

    /* --- touch --- */

    function onTouchStart(e: TouchEvent) {
      const st = s();
      if (!st) return;
      if (e.touches.length === 1) {
        st.dragging = true;
        st.pinching = false;
        st.ptrX = e.touches[0].clientX;
        st.ptrY = e.touches[0].clientY;
        st.vTheta = 0;
        st.vPhi = 0;
      } else if (e.touches.length === 2) {
        st.dragging = false;
        st.pinching = true;
        st.pinchDist = touchDist(e.touches[0], e.touches[1]);
      }
    }

    function onTouchMove(e: TouchEvent) {
      e.preventDefault(); // prevent browser zoom / scroll
      const st = s();
      if (!st) return;

      if (e.touches.length === 1 && st.dragging) {
        const dx = e.touches[0].clientX - st.ptrX;
        const dy = e.touches[0].clientY - st.ptrY;
        const frac = Math.max(0.15, st.tgtDist / maxDistance);
        const spd = rotateSpeed * 0.004 * frac;

        const dT = -dx * spd;
        const dP = -dy * spd;
        st.tgtTheta += dT;
        st.tgtPhi = clampPhi(st.tgtPhi + dP);
        st.vTheta = dT;
        st.vPhi = dP;
        st.ptrX = e.touches[0].clientX;
        st.ptrY = e.touches[0].clientY;
      } else if (e.touches.length === 2 && st.pinching) {
        const d = touchDist(e.touches[0], e.touches[1]);
        if (st.pinchDist > 0) {
          st.tgtDist = clampD(st.tgtDist * (st.pinchDist / d));
        }
        st.pinchDist = d;
      }
    }

    function onTouchEnd(e: TouchEvent) {
      const st = s();
      if (!st) return;
      if (e.touches.length === 0) {
        st.dragging = false;
        st.pinching = false;
      } else if (e.touches.length === 1) {
        // came back from pinch to single-finger
        st.dragging = true;
        st.pinching = false;
        st.ptrX = e.touches[0].clientX;
        st.ptrY = e.touches[0].clientY;
        st.vTheta = 0;
        st.vPhi = 0;
      }
    }

    // touchcancel fires when the OS/browser aborts the gesture mid-flight
    // (incoming call, system gesture, browser-chrome interruption) — no
    // touches array to reason about like touchend, just drop straight back
    // to idle so the camera can never get stuck mid-drag/pinch.
    function onTouchCancel() {
      const st = s();
      if (!st) return;
      st.dragging = false;
      st.pinching = false;
      st.pinchDist = 0;
      st.vTheta = 0;
      st.vPhi = 0;
    }

    /* --- bind --- */

    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerup", onPointerUp);
    el.addEventListener("pointerleave", onPointerUp);
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("dblclick", onDblClick);
    el.addEventListener("contextmenu", onContextMenu);
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    el.addEventListener("touchcancel", onTouchCancel);
    // Same recovery pattern as ComponentDragProvider/WireDragProvider: a
    // pointerup that lands outside the canvas (released over other browser
    // chrome, or the pointer left the canvas without a pointerleave — e.g.
    // pointer capture edge cases) must not leave `dragging` stuck true
    // forever. onPointerUp only ever sets a boolean, so re-invoking it from
    // both the canvas and window listeners for the same bubbling event is a
    // harmless no-op, not duplicate release handling.
    window.addEventListener("pointerup", onPointerUp);

    return () => {
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", onPointerUp);
      el.removeEventListener("pointerleave", onPointerUp);
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("dblclick", onDblClick);
      el.removeEventListener("contextmenu", onContextMenu);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchCancel);
      window.removeEventListener("pointerup", onPointerUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    enabled,
    gl,
    camera,
    minDistance,
    maxDistance,
    zoomSpeed,
    rotateSpeed,
    enableDoubleClickZoom,
    doubleClickZoomFactor,
  ]);

  /* ---- per-frame update: inertia → lerp → camera ---- */

  useFrame(() => {
    const st = ref.current;
    if (!st || !enabled) return;

    // 1. inertia (when not actively dragging)
    if (!st.dragging) {
      st.vTheta *= inertiaDamping;
      st.vPhi *= inertiaDamping;
      if (Math.abs(st.vTheta) > VEL_EPS) st.tgtTheta += st.vTheta;
      else st.vTheta = 0;
      if (Math.abs(st.vPhi) > VEL_EPS) st.tgtPhi = clampPhi(st.tgtPhi + st.vPhi);
      else st.vPhi = 0;
    }

    // 2. smooth interpolation toward targets
    st.theta += (st.tgtTheta - st.theta) * LERP;
    st.phi += (st.tgtPhi - st.phi) * LERP;
    st.dist += (st.tgtDist - st.dist) * LERP;

    // 3. position the camera
    _sph.set(st.dist, st.phi, st.theta);
    _v3.setFromSpherical(_sph);
    camera.position.copy(_v3);
    camera.lookAt(0, 0, 0);
  });

  return null;
}
