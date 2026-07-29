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
  DETACH_SEPARATION_MAX,
  DETACH_SEPARATION_SPEED,
  IMPACT_PART_RADIUS_MARGIN,
  IMPACT_SPREAD_PER_SEVERITY,
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
// Also held across that loop, for the per-part scatter direction — same reason they can't be
// shared with the vectors above.
const _dir = new THREE.Vector3();
const _cq = new THREE.Quaternion();
const _kick = { x: 0, y: 0, z: 0 };

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
export function detachPart(world, scene, node, { velocity, normal, separation } = {}) {
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

  // Inherit the car's velocity so the part travels with the crash, plus a kick along `normal`
  // so it visibly separates instead of riding along. Callers that detach a whole cluster at
  // once pass a per-part direction (away from the contact point) rather than the shared
  // contact normal — otherwise every panel leaves on the same vector and the wreck reads as
  // one car-shaped clump still flying in formation.
  if (velocity) {
    const n = normal ?? { x: 0, y: 1, z: 0 };
    const kick = separation ?? DETACH_SEPARATION_SPEED;
    body.setLinvel(
      {
        x: velocity.x + n.x * kick,
        y: velocity.y + n.y * kick,
        z: velocity.z + n.z * kick,
      },
      true,
    );
  }

  // Where this part hung on the car, captured BEFORE the reparent so a reset can put it
  // back (see clearDetachedParts). Local transform, not world: the car will be somewhere
  // else entirely by then.
  const origin = {
    parent: node.parent,
    position: node.position.clone(),
    quaternion: node.quaternion.clone(),
    scale: node.scale.clone(),
  };

  // Reparent to the scene root. `attach` preserves the world transform, so the part does
  // not jump on the frame it comes off.
  scene.attach(node);
  node.userData.detached = true;

  const entry = {
    node,
    body,
    collider,
    origin,
    prev: { pos: { ...spawn }, quat: { ...rot } },
  };
  detached.push(entry);
  return entry;
}

/**
 * Decide which registered parts come off for a given impact and detach them.
 *
 * `parts` is [{ node, category, localPos, radius }]. A part detaches when the severity clears
 * its category's threshold AND the impact lands within reach of it — where **reach grows with
 * how far the impact overshoots that threshold**:
 *
 *     reach = part.radius + IMPACT_PART_RADIUS_MARGIN + overshoot * IMPACT_SPREAD_PER_SEVERITY
 *
 * The overshoot term is what makes a severe crash destroy the whole car. Without it the reach
 * is a flat ~1m on a 4.75m car at every speed, so a 200mph impact shed only the four chunks
 * nearest the contact point and everything else stayed bolted on no matter how hard you hit.
 * Keying it on the overshoot rather than raw severity preserves the low end exactly: a part
 * hit at precisely its threshold still has to be at the contact point, so a rear-end tap
 * cannot pop the front bumper off.
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

  // Chassis rotation (not inverted) — needed to turn the car-local offset of each part into
  // the world-space direction its debris is thrown in.
  _cq.set(r.x, r.y, r.z, r.w);

  const velocity = chassisBody.linvel();
  let count = 0;
  for (const part of parts) {
    if (part.node.userData.detached) continue;
    const threshold = getDetachSeverity(part.category);
    if (threshold === null || severity < threshold) continue;

    const overshoot = severity - threshold; // >= 0 by the test above
    const dx = part.localPos.x - _lp.x;
    const dy = part.localPos.y - _lp.y;
    const dz = part.localPos.z - _lp.z;
    const dist = Math.hypot(dx, dy, dz);
    if (dist > part.radius + IMPACT_PART_RADIUS_MARGIN + overshoot * IMPACT_SPREAD_PER_SEVERITY) {
      continue;
    }

    // Throw this part outward from the contact point rather than along the shared contact
    // normal, so a car that loses 35 pieces at once scatters instead of flying in formation.
    // sqrt, so the kick grows quickly out of the trivial range and then flattens — a 300mph
    // hit should not fire debris at ten times the speed a 100mph one does.
    let kick = DETACH_SEPARATION_SPEED;
    if (dist > 1e-4) {
      _dir.set(dx, dy, dz).divideScalar(dist).applyQuaternion(_cq);
      kick = Math.min(DETACH_SEPARATION_MAX, DETACH_SEPARATION_SPEED + Math.sqrt(overshoot));
    } else {
      // Part sits exactly on the contact point — no outward direction to derive.
      _dir.set(normal.x, normal.y, normal.z);
    }
    // Mutated per part and read synchronously by detachPart, so no allocation per detach.
    _kick.x = _dir.x;
    _kick.y = _dir.y;
    _kick.z = _dir.z;

    if (detachPart(world, scene, part.node, { velocity, normal: _kick, separation: kick })) {
      count++;
    }
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

/**
 * Destroy every debris body. Must run on unmount, or StrictMode leaks them.
 *
 * `reattach` additionally puts each part back on the car, which is what the R-key reset
 * needs: without it the bodies would go but the meshes would stay lying on the ground as
 * orphans, since detachPart reparented them to the scene root. Unmount doesn't want this —
 * the whole cloned model is being thrown away — hence the flag rather than doing it always.
 */
export function clearDetachedParts(world, { reattach = false } = {}) {
  for (const d of detached) {
    d.node.userData.detached = false;
    if (world) world.removeRigidBody(d.body); // also removes its collider
    if (reattach && d.origin?.parent) {
      // `add`, not `attach`: attach would preserve the world transform the debris ended up
      // with. The saved LOCAL transform is what puts the part back where it belongs.
      d.origin.parent.add(d.node);
      d.node.position.copy(d.origin.position);
      d.node.quaternion.copy(d.origin.quaternion);
      d.node.scale.copy(d.origin.scale);
    }
  }
  detached.length = 0;
}
