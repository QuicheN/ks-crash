// vehicles/strategies/wheelLocators.js
// Reusable ways to find a model's four wheel visuals, always returned in the project-wide
// [FL, FR, RL, RR] order (indices 0-3) that constants, the Rapier controller and the sync
// hook all agree on.
//
// Handedness convention, inherited from the sedan's measured WHEEL_OFFSETS: **+x is LEFT**,
// **+z is FORWARD**. Both locators below encode that in one place so a new model can never
// silently pair its wheels backwards.
import * as THREE from 'three';
import { isWheelLike } from './classifiers';

/** Wheels identified by node name — for models with meaningful names (the sedan). */
export function byNamePatterns(patterns) {
  return (root) =>
    patterns.map((re) => {
      let found = null;
      root.traverse((o) => {
        if (!found && o.name && re.test(o.name)) found = o; // first (outermost) match
      });
      return found ? { obj: found, base: found.quaternion.clone() } : null;
    });
}

/**
 * Wheels identified by shape and position — for models with no usable names (the wagon).
 * Takes the already-computed chunk list so it reuses the same geometry pass as segmentation.
 */
export function byGeometry() {
  return (root, chunks, bounds) => {
    const candidates = chunks.filter((c) => isWheelLike(c, bounds));
    if (candidates.length < 4) return [null, null, null, null];

    // Keep the four largest, then sort into corners. More than four can survive the shape
    // test (hubs, brake discs); the real wheels are the biggest at each corner.
    const midZ = (bounds.max.z + bounds.min.z) / 2;
    const corner = (c) => (c.localPos.z > midZ ? 0 : 2) + (c.localPos.x > 0 ? 0 : 1);
    const best = new Map();
    for (const c of candidates) {
      const k = corner(c);
      if (!best.has(k) || c.radius > best.get(k).radius) best.set(k, c);
    }
    // Slot order is exactly [FL, FR, RL, RR] by construction of `corner`.
    return [0, 1, 2, 3].map((k) => {
      const c = best.get(k);
      return c ? { obj: c.node, base: c.node.quaternion.clone(), chunk: c } : null;
    });
  };
}

/**
 * Derive suspension connection points from where the wheel visuals actually are, so a model's
 * physics matches its art without hand-measuring. Returns offsets in [FL, FR, RL, RR] order.
 */
export function offsetsFromWheels(wheels, suspensionRestLength) {
  return wheels.map((w) => {
    if (!w) return { x: 0, y: 0, z: 0 };
    const p = w.obj.getWorldPosition(new THREE.Vector3());
    return { x: p.x, y: p.y + suspensionRestLength, z: p.z };
  });
}
