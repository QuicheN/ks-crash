// damage/crumple.js
// Whole-chunk deformation: the panels that DON'T fly off get visibly crushed instead.
//
// This deliberately transforms each chunk as a rigid unit — offset toward the impact, scaled
// down along the impact axis, slightly rotated — rather than displacing individual vertices.
// On a low-poly model that reads as real damage because faceting is already the art style,
// and it costs three transform writes per chunk instead of a geometry rebuild. CLAUDE.md's
// planned deformation.js stays reserved for true per-vertex work on a denser model.
//
// Damage is cumulative and permanent, held in a module-level registry on the physics ref
// path — no React state, no Redux, per the architecture contract in edits.md.
import * as THREE from 'three';
import { getStiffness } from './stiffnessMap';
import {
  CRUMPLE_RADIUS,
  CRUMPLE_MAX,
  CRUMPLE_SEVERITY_SCALE,
  CRUMPLE_PULL,
  CRUMPLE_ROTATION,
} from '../utils/constants';

// chunk.node.uuid -> { amount, restPos, restQuat, restScale }
const damage = new Map();

const _local = new THREE.Vector3();
const _invQ = new THREE.Quaternion();
const _dir = new THREE.Vector3();
const _axis = new THREE.Vector3();
const _q = new THREE.Quaternion();

/** Deterministic pseudo-random in [-1, 1] from a string — same chunk always bends the same way. */
function jitter(seed) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return ((h % 1000) / 500) - 1;
}

/**
 * Crush the chunks around an impact.
 *
 * Runs after detachment, on whatever is still attached: chunks close enough to the contact
 * point absorb a crush proportional to severity and their softness, falling off with
 * distance so damage stays local to the hit.
 */
export function applyCrumple(chunks, impact, chassisBody) {
  if (!chunks?.length || !chassisBody) return 0;
  const { point, normal, severity } = impact;

  // World contact point -> chassis-local, using the CURRENT physics transform. Chunk
  // positions are car-local constants, so this is the only frame both can be compared in
  // (and it stays correct at any speed, unlike a frame-stale world position).
  const t = chassisBody.translation();
  const r = chassisBody.rotation();
  _invQ.set(r.x, r.y, r.z, r.w).invert();
  _local.set(point.x - t.x, point.y - t.y, point.z - t.z).applyQuaternion(_invQ);
  _axis.set(normal.x, normal.y, normal.z).applyQuaternion(_invQ).normalize();

  let affected = 0;
  for (const chunk of chunks) {
    if (chunk.node.userData.detached) continue;

    const reach = CRUMPLE_RADIUS + chunk.radius;
    const dist = _local.distanceTo(chunk.localPos);
    if (dist > reach) continue;

    const state = remember(chunk);
    const falloff = 1 - dist / reach; // full crush at the contact, none at the edge
    const softness = 1 - getStiffness(chunk.category);
    const added = severity * CRUMPLE_SEVERITY_SCALE * falloff * softness;
    if (added <= 0.001) continue;

    state.amount = Math.min(CRUMPLE_MAX, state.amount + added);
    affected++;

    // Drag the panel toward the impact point...
    _dir.copy(_local).sub(chunk.localPos);
    if (_dir.lengthSq() > 1e-8) _dir.normalize();
    chunk.node.position
      .copy(state.restPos)
      .addScaledVector(_dir, state.amount * CRUMPLE_PULL * chunk.radius);

    // ...squash it along the impact axis, keeping some volume by not collapsing fully.
    const squash = 1 - state.amount;
    chunk.node.scale.set(
      state.restScale.x * (1 - (1 - squash) * Math.abs(_axis.x)),
      state.restScale.y * (1 - (1 - squash) * Math.abs(_axis.y)),
      state.restScale.z * (1 - (1 - squash) * Math.abs(_axis.z)),
    );

    // ...and bend it a little so the damage looks irregular rather than uniformly scaled.
    const bend = jitter(chunk.node.uuid) * state.amount * CRUMPLE_ROTATION;
    _q.setFromAxisAngle(_dir.lengthSq() > 1e-8 ? _dir : _axis, bend);
    chunk.node.quaternion.copy(state.restQuat).multiply(_q);
  }
  return affected;
}

/** Capture a chunk's undamaged transform the first time it's hit. */
function remember(chunk) {
  let state = damage.get(chunk.node.uuid);
  if (!state) {
    state = {
      amount: 0,
      restPos: chunk.node.position.clone(),
      restQuat: chunk.node.quaternion.clone(),
      restScale: chunk.node.scale.clone(),
    };
    damage.set(chunk.node.uuid, state);
  }
  return state;
}

/** 0..1 total damage for a chunk — the hook a survival estimator will read later. */
export function getCrumpleAmount(chunk) {
  return damage.get(chunk.node.uuid)?.amount ?? 0;
}

/** Mean damage across all chunks, 0..1. */
export function getTotalCrumple(chunks) {
  if (!chunks?.length) return 0;
  let sum = 0;
  for (const c of chunks) sum += getCrumpleAmount(c);
  return sum / chunks.length;
}

/** Restore every chunk and forget its damage. Must run on unmount alongside debris cleanup. */
export function resetCrumple(chunks) {
  if (chunks) {
    for (const chunk of chunks) {
      const state = damage.get(chunk.node.uuid);
      if (!state) continue;
      chunk.node.position.copy(state.restPos);
      chunk.node.quaternion.copy(state.restQuat);
      chunk.node.scale.copy(state.restScale);
    }
  }
  damage.clear();
}
