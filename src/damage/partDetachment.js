// damage/partDetachment.js
// Turns a still-attached body panel into an independent dynamic rigid body at runtime.
//
// The mechanism here is generic — it takes an Object3D and a spawn velocity and knows
// nothing about which model it came from or why it detached. Deciding *which* parts come
// off is `detachPartsNearImpact`, which reads thresholds from the category manifest; the
// node-name → category mapping lives in the model adapter.
//
// Per the architecture contract in edits.md: all per-frame work is ref-only (no React
// state, no Redux), detached bodies participate in the same prev/alpha render interpolation
// as the chassis, and everything created here is destroyed by clearDetachedParts() so the
// StrictMode double-mount can't leak bodies into the world.
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { getDetachSeverity } from './stiffnessMap';
import {
  DEBRIS_GROUPS,
  DETACHED_PART_DENSITY,
  DETACH_SEPARATION_SPEED,
  IMPACT_PART_RADIUS_MARGIN,
} from '../utils/constants';

// Live debris. Module-level because detachment is triggered from the physics callback and
// consumed by the render sync — the same ref-path split the vehicle already uses.
const detached = [];

// Scratch, reused per detach (never per frame).
const _m = new THREE.Matrix4();
const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
// Separate scratch for the impact-proximity test. It MUST NOT be shared with the vectors
// above: detachPartsNearImpact holds the local contact point across its whole loop while
// calling detachPart(), which reuses _v/_q internally — sharing them meant only the first
// eligible part ever detached, and every later one compared against clobbered values.
const _lp = new THREE.Vector3();
const _iq = new THREE.Quaternion();

/**
 * Collect a part's triangle vertices expressed in the part node's own local frame.
 * The node's world matrix is inverted out so the hull is centred on the node origin, which
 * the model audit confirmed sits within 1cm of each part's geometry centroid — that's why
 * no recentering pass is needed here.
 */
function collectLocalVertices(node) {
  node.updateWorldMatrix(true, true);
  const toLocal = _m.copy(node.matrixWorld).invert();
  const pts = [];
  node.traverse((o) => {
    if (!o.isMesh || !o.geometry?.attributes?.position) return;
    const pos = o.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      _v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld).applyMatrix4(toLocal);
      pts.push(_v.x, _v.y, _v.z);
    }
  });
  return new Float32Array(pts);
}

/** Bounding-sphere radius of a node in world units — used for impact proximity tests. */
export function worldBoundingRadius(node) {
  const box = new THREE.Box3().setFromObject(node);
  if (box.isEmpty()) return 0;
  return box.getSize(new THREE.Vector3()).length() * 0.5;
}

/**
 * Detach `node` into its own rigid body.
 * Returns the debris record, or null if it couldn't be detached (degenerate hull).
 */
export function detachPart(world, scene, node, { velocity, normal } = {}) {
  if (!world || !node || node.userData.detached) return null;

  const verts = collectLocalVertices(node);
  if (verts.length < 12) return null; // need at least 4 points for a hull

  // Convex hull, per the "collision geometry simpler than visual geometry" rule — a
  // detached bumper collides as its hull, never as its 6916 render triangles.
  const colliderDesc = RAPIER.ColliderDesc.convexHull(verts);
  if (!colliderDesc) return null; // Rapier returns null on a degenerate/coplanar hull

  node.updateWorldMatrix(true, false);
  node.matrixWorld.decompose(_v, _q, _s);
  const spawn = { x: _v.x, y: _v.y, z: _v.z };
  const rot = { x: _q.x, y: _q.y, z: _q.z, w: _q.w };

  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(spawn.x, spawn.y, spawn.z)
      .setRotation(rot)
      .setCcdEnabled(true),
  );
  const collider = world.createCollider(colliderDesc.setDensity(DETACHED_PART_DENSITY), body);
  // Debris ignores the vehicle (and other debris): the hood sits *inside* the chassis
  // cuboid, so without this it would be spawned interpenetrating and violently ejected.
  collider.setCollisionGroups(DEBRIS_GROUPS);

  // Inherit the car's velocity so the part travels with the crash, plus a kick along the
  // contact normal so it visibly separates instead of riding along.
  if (velocity) {
    const n = normal ?? { x: 0, y: 1, z: 0 };
    body.setLinvel(
      {
        x: velocity.x + n.x * DETACH_SEPARATION_SPEED,
        y: velocity.y + n.y * DETACH_SEPARATION_SPEED,
        z: velocity.z + n.z * DETACH_SEPARATION_SPEED,
      },
      true,
    );
  }

  // Reparent to the scene root. `attach` preserves the world transform, so the part does
  // not jump on the frame it comes off.
  scene.attach(node);
  node.userData.detached = true;

  const entry = {
    node,
    body,
    collider,
    prev: { pos: { ...spawn }, quat: { ...rot } },
  };
  detached.push(entry);
  return entry;
}

/**
 * Decide which registered parts come off for a given impact and detach them.
 *
 * `parts` is [{ node, category, localPos, radius }]. A part detaches when the impact lands
 * within its bounding radius (+ margin) AND the severity clears its category's threshold —
 * so a rear-end hit can't pop the front bumper off.
 *
 * The proximity test runs in CHASSIS-LOCAL space, not world space. Parts are rigidly
 * attached, so their car-local positions are constants, while their Three.js world
 * positions are only as fresh as the last rendered frame. At 268 m/s the car covers 2.2m
 * between frames — far beyond the match radius — so a world-space test silently stops
 * detaching anything at exactly the speeds this simulator exists to model.
 */
export function detachPartsNearImpact(world, scene, parts, impact, chassisBody) {
  if (!world || !parts?.length || !chassisBody) return 0;
  const { point, normal, severity } = impact;

  // World contact point -> chassis-local, using the body's CURRENT physics transform.
  const t = chassisBody.translation();
  const r = chassisBody.rotation();
  _iq.set(r.x, r.y, r.z, r.w).invert();
  _lp.set(point.x - t.x, point.y - t.y, point.z - t.z).applyQuaternion(_iq);

  const velocity = chassisBody.linvel();
  let count = 0;
  for (const part of parts) {
    if (part.node.userData.detached) continue;
    const threshold = getDetachSeverity(part.category);
    if (threshold === null || severity < threshold) continue;

    const dist = Math.hypot(
      _lp.x - part.localPos.x,
      _lp.y - part.localPos.y,
      _lp.z - part.localPos.z,
    );
    if (dist > part.radius + IMPACT_PART_RADIUS_MARGIN) continue;

    if (detachPart(world, scene, part.node, { velocity, normal })) count++;
  }
  return count;
}

/** Snapshot debris transforms before a physics step — the prev half of prev/alpha. */
export function snapshotDetachedParts() {
  for (const d of detached) {
    const t = d.body.translation();
    const r = d.body.rotation();
    d.prev.pos.x = t.x; d.prev.pos.y = t.y; d.prev.pos.z = t.z;
    d.prev.quat.x = r.x; d.prev.quat.y = r.y; d.prev.quat.z = r.z; d.prev.quat.w = r.w;
  }
}

/** Write interpolated debris transforms onto their Object3Ds. Mirrors useVehicleSync. */
export function syncDetachedParts(alpha) {
  for (const d of detached) {
    const t = d.body.translation();
    const r = d.body.rotation();
    d.node.position.set(
      d.prev.pos.x + (t.x - d.prev.pos.x) * alpha,
      d.prev.pos.y + (t.y - d.prev.pos.y) * alpha,
      d.prev.pos.z + (t.z - d.prev.pos.z) * alpha,
    );
    _q.set(d.prev.quat.x, d.prev.quat.y, d.prev.quat.z, d.prev.quat.w);
    d.node.quaternion.set(r.x, r.y, r.z, r.w).slerp(_q, 1 - alpha);
  }
}

export function getDetachedCount() {
  return detached.length;
}

export function getDetachedNames() {
  return detached.map((d) => d.node.name);
}

/** Destroy every debris body. Must run on unmount, or StrictMode leaks them. */
export function clearDetachedParts(world) {
  for (const d of detached) {
    d.node.userData.detached = false;
    if (world) world.removeRigidBody(d.body); // also removes its collider
  }
  detached.length = 0;
}
