// hooks/usePhysicsLoop.js
// Advances Rapier on a FIXED timestep, decoupled from the render framerate. Stepping
// with the raw variable `delta` would make handling drift with FPS and can explode at
// low framerates — this accumulator pattern keeps it deterministic and stable.
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { getWorld } from '../physics/world';
import { applyControls, stepVehicle } from '../physics/vehicleController';

const FIXED_DT = 1 / 60; // seconds per physics substep
const MAX_SUBSTEPS = 5; // cap to avoid a spiral-of-death after a tab stall

export function usePhysicsLoop(vehicleRef, controlsRef) {
  const accumulator = useRef(0);

  useFrame((_, delta) => {
    const world = getWorld();
    const vehicle = vehicleRef.current;
    if (!world || !vehicle) return; // not spawned yet — nothing to step

    // Bank this frame's elapsed time, then drain it in fixed-size chunks. The cap
    // discards excess time (e.g. after the tab was backgrounded) instead of trying
    // to simulate hundreds of substeps in one frame.
    accumulator.current += delta;
    let steps = 0;
    while (accumulator.current >= FIXED_DT && steps < MAX_SUBSTEPS) {
      applyControls(vehicle, controlsRef, FIXED_DT); // input -> wheel forces
      stepVehicle(vehicle, FIXED_DT); // suspension/engine -> chassis velocity
      world.step(); // integrate the whole world
      accumulator.current -= FIXED_DT;
      steps++;
    }
    if (steps === MAX_SUBSTEPS) accumulator.current = 0; // drop the backlog
  });
}
