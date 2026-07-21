// hooks/useVehicleSync.js
// Reads the physics state each frame and writes it straight onto the Three.js objects —
// no React state, no dispatches (CLAUDE.md: physics never touches Redux at 60fps). Runs
// in its own useFrame, separate from the physics-step loop.
//
//   - Chassis: rigid-body translation/rotation -> the car <group>, INTERPOLATED between
//     the last two physics steps by usePhysicsLoop's leftover-accumulator alpha. Physics
//     runs at a fixed 60Hz but rendering doesn't, so copying the raw transform makes the
//     car stair-step (dead still on frames where no substep ran, then a double jump) —
//     which reads as jitter against the smoothly-damped chase camera.
//   - Wheels : all four spin about their axle (wheel-local X); the front pair also steer
//     about vertical (wheel-local Y). Both are layered on each wheel's captured rest
//     orientation so any authored toe/camber is preserved.
//
// The spin angle is integrated from the chassis's own forward velocity rather than from
// the controller's wheelRotation(i): in this Rapier build wheelRotation stays 0 for
// straight driving (and currentVehicleSpeed()'s sign is unreliable), so it can't drive
// the visual. Forward speed = chassis linear velocity projected on the car's +Z axis
// gives every wheel a correct, matching roll rate in a straight line and in turns.
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { syncDetachedParts } from '../damage/partDetachment';

// Scratch objects reused every frame to avoid per-frame allocation.
const AXLE_AXIS = new THREE.Vector3(1, 0, 0); // wheel-local axle (spin)
const STEER_AXIS = new THREE.Vector3(0, 1, 0); // wheel-local up (steer)
const FORWARD = new THREE.Vector3(0, 0, 1); // car-local forward
const fwdWorld = new THREE.Vector3();
const spinQ = new THREE.Quaternion();
const steerQ = new THREE.Quaternion();
const prevPos = new THREE.Vector3();
const currPos = new THREE.Vector3();
const prevQuat = new THREE.Quaternion();
const currQuat = new THREE.Quaternion();

export function useVehicleSync(vehicleRef, bodyRef, wheelsRef) {
  useFrame((_, delta) => {
    const vehicle = vehicleRef.current;
    const body = bodyRef.current;
    if (!vehicle || !body) return;

    // Chassis: Rapier translation()/rotation() -> Three.js position/quaternion, blended
    // `alpha` of the way from the state before the last physics step to the current one.
    const t = vehicle.chassisBody.translation();
    const r = vehicle.chassisBody.rotation();
    const prev = vehicle.prev;
    if (prev) {
      currPos.set(t.x, t.y, t.z);
      currQuat.set(r.x, r.y, r.z, r.w);
      prevPos.set(prev.pos.x, prev.pos.y, prev.pos.z);
      prevQuat.set(prev.quat.x, prev.quat.y, prev.quat.z, prev.quat.w);
      const alpha = vehicle.alpha ?? 0;
      body.position.lerpVectors(prevPos, currPos, alpha);
      body.quaternion.slerpQuaternions(prevQuat, currQuat, alpha);
    } else {
      // First frame(s): no step has run yet, so there's nothing to blend between.
      body.position.set(t.x, t.y, t.z);
      body.quaternion.set(r.x, r.y, r.z, r.w);
    }

    // Debris is no longer parented to the car, so it needs its own transform write —
    // interpolated by the same alpha so it stays smooth at 120Hz like the chassis.
    syncDetachedParts(vehicle.alpha ?? 0);

    const wheels = wheelsRef.current;
    if (!wheels) return;
    const { controller } = vehicle;

    // Advance one shared roll angle from the car's true forward speed. All wheels share
    // it (they cover the same ground distance), so front and rear spin identically.
    const lv = vehicle.chassisBody.linvel();
    fwdWorld.copy(FORWARD).applyQuaternion(body.quaternion);
    const forwardSpeed = lv.x * fwdWorld.x + lv.y * fwdWorld.y + lv.z * fwdWorld.z;
    // Radius comes from the vehicle definition, so a model swap re-derives the roll rate.
    const wheelRadius = vehicle.definition.wheels.radius;
    vehicle.wheelRoll = (vehicle.wheelRoll ?? 0) + (forwardSpeed / wheelRadius) * delta;
    spinQ.setFromAxisAngle(AXLE_AXIS, vehicle.wheelRoll);

    for (let i = 0; i < wheels.length; i++) {
      const w = wheels[i];
      if (!w) continue;
      const steer = controller.wheelSteering(i) ?? 0; // rad about vertical (front only)
      steerQ.setFromAxisAngle(STEER_AXIS, steer);
      // base then steer (outer) then roll (inner): the steered wheel spins about its
      // now-steered axle, which is what a real wheel does.
      w.obj.quaternion.copy(w.base).multiply(steerQ).multiply(spinQ);
    }
  });
}
