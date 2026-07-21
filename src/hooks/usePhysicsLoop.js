// hooks/usePhysicsLoop.js
// Advances Rapier on a FIXED timestep, decoupled from the render framerate. Stepping
// with the raw variable `delta` would make handling drift with FPS and can explode at
// low framerates — this accumulator pattern keeps it deterministic and stable.
//
// Because the step rate (60Hz) and the render rate differ, this loop also publishes what
// useVehicleSync needs to INTERPOLATE the visual: `vehicle.prev` (the chassis state just
// before the last step) and `vehicle.alpha` (how far into the next step we currently are).
// Without that, a 120Hz display runs zero substeps on ~every other frame, the car's
// rendered transform stair-steps, and it visibly jitters against the smoothly-damped
// chase camera.
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { getWorld } from '../physics/world';
import { applyControls, stepVehicle } from '../physics/vehicleController';

const FIXED_DT = 1 / 60; // seconds per physics substep
const MAX_SUBSTEPS = 5; // cap to avoid a spiral-of-death after a tab stall

// Copy the chassis's current transform into vehicle.prev, allocating the holder once.
function snapshot(vehicle) {
  const t = vehicle.chassisBody.translation();
  const r = vehicle.chassisBody.rotation();
  const prev = (vehicle.prev ??= { pos: { x: 0, y: 0, z: 0 }, quat: { x: 0, y: 0, z: 0, w: 1 } });
  prev.pos.x = t.x;
  prev.pos.y = t.y;
  prev.pos.z = t.z;
  prev.quat.x = r.x;
  prev.quat.y = r.y;
  prev.quat.z = r.z;
  prev.quat.w = r.w;
}

export function usePhysicsLoop(vehicleRef, controlsRef) {
  const accumulator = useRef(0);

  useFrame((_, delta) => {
    const world = getWorld();
    const vehicle = vehicleRef.current;
    if (!world || !vehicle) return; // not spawned yet — nothing to step

    // Seed prev before the very first step so frame one never blends from garbage.
    if (!vehicle.prev) snapshot(vehicle);

    // Bank this frame's elapsed time, then drain it in fixed-size chunks. The cap
    // discards excess time (e.g. after the tab was backgrounded) instead of trying
    // to simulate hundreds of substeps in one frame.
    accumulator.current += delta;
    let steps = 0;
    while (accumulator.current >= FIXED_DT && steps < MAX_SUBSTEPS) {
      // Re-snapshotting each substep leaves prev holding the state immediately before
      // the LAST step taken — which is the one the render blends out of.
      snapshot(vehicle);
      applyControls(vehicle, controlsRef, FIXED_DT); // input -> wheel forces
      stepVehicle(vehicle, FIXED_DT); // suspension/engine -> chassis velocity
      world.step(); // integrate the whole world
      accumulator.current -= FIXED_DT;
      steps++;
    }
    if (steps === MAX_SUBSTEPS) accumulator.current = 0; // drop the backlog

    // Leftover time as a fraction of a step: how far past the last step this frame is.
    vehicle.alpha = accumulator.current / FIXED_DT;
  });
}
