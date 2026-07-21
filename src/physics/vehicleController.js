// physics/vehicleController.js
// Thin wrapper around Rapier's built-in DynamicRayCastVehicleController — this IS
// the project's "raycast wheels" architecture (per CLAUDE.md); we do not hand-roll
// raycasts. Method names verified against @dimforge/rapier3d-compat 0.14.0.
import RAPIER from '@dimforge/rapier3d-compat';
import {
  CHASSIS_HALF_EXTENTS,
  CHASSIS_COLLIDER_OFFSET,
  CHASSIS_MASS_DENSITY,
  WHEEL_OFFSETS,
  WHEEL_RADIUS,
  SUSPENSION_REST_LENGTH,
  SUSPENSION_STIFFNESS,
  MAX_SUSPENSION_TRAVEL,
  MAX_ENGINE_FORCE,
  MAX_BRAKE_FORCE,
  MAX_STEER_ANGLE,
  STEER_LERP_SPEED,
  WHEEL_FRICTION_SLIP,
  CHASSIS_GROUPS,
  WHEEL_RAY_GROUPS,
} from '../utils/constants';

// Suspension points straight down; the axle runs along the local -x axis.
const SUSPENSION_DIR = { x: 0, y: -1, z: 0 };
const AXLE_DIR = { x: -1, y: 0, z: 0 };

// Wheel index groups within the fixed [FL, FR, RL, RR] order.
const FRONT_WHEELS = [0, 1]; // steered
const REAR_WHEELS = [2, 3]; // driven (rear-wheel drive)

/**
 * Build the chassis rigid body + collider and attach a ray-cast vehicle controller
 * with four wheels. Returns the handle the rest of the system drives.
 */
export function createVehicle(world, startPosition) {
  // Dynamic rigid body for the chassis, placed at the spawn point. CCD is on because this
  // sim targets extreme speeds: at 268 m/s the chassis moves ~4.5m per 60Hz step, further
  // than its own length, so discrete collision detection would tunnel straight through a
  // wall without ever generating a contact.
  const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(startPosition.x, startPosition.y, startPosition.z)
    .setCcdEnabled(true);
  const chassisBody = world.createRigidBody(bodyDesc);

  // A single cuboid collider stands in for the whole car body, lifted off the body
  // origin so it wraps the bodywork (which sits entirely above the origin). Density
  // (not an explicit mass) lets Rapier compute a physically consistent inertia tensor.
  const colliderDesc = RAPIER.ColliderDesc.cuboid(
    CHASSIS_HALF_EXTENTS.x,
    CHASSIS_HALF_EXTENTS.y,
    CHASSIS_HALF_EXTENTS.z,
  )
    .setTranslation(CHASSIS_COLLIDER_OFFSET.x, CHASSIS_COLLIDER_OFFSET.y, CHASSIS_COLLIDER_OFFSET.z)
    .setDensity(CHASSIS_MASS_DENSITY)
    // Collision events are emitted when EITHER collider opts in, so enabling it here covers
    // every chassis impact without having to flag each obstacle.
    .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
  const chassisCollider = world.createCollider(colliderDesc, chassisBody);
  chassisCollider.setCollisionGroups(CHASSIS_GROUPS);

  // The controller drives the chassis body via per-wheel raycasts each step.
  const controller = world.createVehicleController(chassisBody);

  // Add the four wheels in the shared [FL, FR, RL, RR] order so indices 0-3 stay
  // consistent across the whole codebase, then apply per-wheel tuning.
  WHEEL_OFFSETS.forEach((offset, i) => {
    controller.addWheel(offset, SUSPENSION_DIR, AXLE_DIR, SUSPENSION_REST_LENGTH, WHEEL_RADIUS);
    controller.setWheelSuspensionStiffness(i, SUSPENSION_STIFFNESS);
    controller.setWheelMaxSuspensionTravel(i, MAX_SUSPENSION_TRAVEL);
    controller.setWheelFrictionSlip(i, WHEEL_FRICTION_SLIP);
  });

  return { chassisBody, chassisCollider, controller, currentSteer: 0 };
}

/**
 * Translate the current keyboard state into engine/brake/steer inputs on the
 * controller. `controls` is the ref from useKeyboardControls; `dt` is the substep.
 */
export function applyControls(vehicle, controls, dt) {
  const { controller } = vehicle;
  const c = controls.current;

  // Throttle: forward positive, reverse negative, coast at zero. Rear-wheel drive.
  const engineForce = c.forward ? MAX_ENGINE_FORCE : c.back ? -MAX_ENGINE_FORCE : 0;
  REAR_WHEELS.forEach((i) => controller.setWheelEngineForce(i, engineForce));

  // Braking (Space) applies to the rear wheels only; keep the front wheels free.
  const brakeForce = c.brake ? MAX_BRAKE_FORCE : 0;
  REAR_WHEELS.forEach((i) => controller.setWheelBrake(i, brakeForce));
  FRONT_WHEELS.forEach((i) => controller.setWheelBrake(i, 0));

  // Steering: pick a target angle, then ease the stored angle toward it instead of
  // snapping — STEER_LERP_SPEED * dt is the per-substep blend factor (clamped ≤ 1).
  const targetSteer = (c.left ? MAX_STEER_ANGLE : 0) + (c.right ? -MAX_STEER_ANGLE : 0);
  const t = Math.min(STEER_LERP_SPEED * dt, 1);
  vehicle.currentSteer += (targetSteer - vehicle.currentSteer) * t;
  FRONT_WHEELS.forEach((i) => controller.setWheelSteering(i, vehicle.currentSteer));
}

/**
 * Advance the vehicle: recomputes suspension/engine/brake forces and writes them
 * onto the chassis body's velocity. Must run before world.step() each substep.
 */
export function stepVehicle(vehicle, dt) {
  // Restrict the suspension raycasts to world geometry so detached debris on the road
  // can't act as a ramp under a wheel.
  vehicle.controller.updateVehicle(dt, undefined, WHEEL_RAY_GROUPS);
}
