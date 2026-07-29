// physics/triggers.js
// Trigger volumes — colliders that report an overlap and apply no force. The acceleration
// pad is the first one: driving through it sets the car's speed outright.
//
// Kept separate from collisionHandler.js on purpose. That file's job is "raw contact events
// -> impact severity", and a trigger has no severity at all: a sensor generates no contact
// manifolds, so the normal-velocity projection has nothing to project onto and the impact
// path would score it -1 and drop it below IMPACT_MIN_SEVERITY. Triggers are matched by
// collider handle *before* that path runs.
//
// The registry is module-level for the same reason the debris list in partDetachment.js is:
// triggers are created by React components but consumed from the physics callback, and
// nothing on that path may go through React state.
import * as THREE from 'three';

// collider.handle -> descriptor, e.g. { type: 'boost', speed }
const triggers = new Map();

/** Register a sensor collider as a trigger. Call once, when the collider is created. */
export function registerTrigger(collider, data) {
  triggers.set(collider.handle, data);
}

/**
 * Forget a trigger. MUST be called before the collider is removed from the world: Rapier
 * recycles collider handles, so a stale entry would eventually fire on an unrelated collider.
 */
export function unregisterTrigger(collider) {
  triggers.delete(collider.handle);
}

/** The descriptor for a collider handle, or undefined if it isn't a trigger. */
export function getTrigger(handle) {
  return triggers.get(handle);
}

// Scratch for applySpeedBoost only. Deliberately not shared with any other function — see
// the Session 3 bug noted in partDetachment.js, where two functions reusing one scratch
// vector meant only the first part ever detached.
const _boostQuat = new THREE.Quaternion();
const _boostFwd = new THREE.Vector3();

/**
 * Instantly set the chassis to `speed` (m/s) along its own heading.
 *
 * Direction is the model's local +Z rotated into world space — the "model forward is local
 * +Z" contract that the camera offset's sign is also coupled to. Flipping that convention
 * means flipping this too.
 *
 * The vertical component of the existing velocity is PRESERVED rather than overwritten:
 * zeroing it would slam an airborne car flat, and setting it from the heading would launch a
 * car that is merely nose-up over a bump. A pad changes how fast you are going, not whether
 * you are flying.
 *
 * This bypasses the tire model entirely — that is the point (600mph takes ~55s of held
 * throttle otherwise) but it also means the wheels have no say, so the car keeps whatever
 * grip state it had going in.
 */
export function applySpeedBoost(chassisBody, speed) {
  const r = chassisBody.rotation();
  _boostQuat.set(r.x, r.y, r.z, r.w);
  _boostFwd.set(0, 0, 1).applyQuaternion(_boostQuat);
  // Flatten to the horizontal plane so the speed asked for is ground speed, not a diagonal
  // that would be partly spent climbing. Degenerate only if the car is perfectly nose-up.
  _boostFwd.y = 0;
  if (_boostFwd.lengthSq() < 1e-6) return;
  _boostFwd.normalize();

  const v = chassisBody.linvel();
  chassisBody.setLinvel({ x: _boostFwd.x * speed, y: v.y, z: _boostFwd.z * speed }, true);
}
