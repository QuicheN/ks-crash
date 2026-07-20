// rendering/VehicleMesh.jsx
// Loads the vehicle model (MODEL_URL), spawns the physics vehicle once on mount, and
// drives the mesh from physics every frame. This component is the bridge between the r3f
// scene graph and the Rapier controller — but it never puts per-frame transforms through
// React state.
import { useEffect, useMemo, useRef } from 'react';
import { useGLTF } from '@react-three/drei';
import { getWorld } from '../physics/world';
import { createVehicle } from '../physics/vehicleController';
import { useKeyboardControls } from '../input/useKeyboardControls';
import { usePhysicsLoop } from '../hooks/usePhysicsLoop';
import { useVehicleSync } from '../hooks/useVehicleSync';
import { MODEL_URL, MODEL_RECENTER, WHEEL_NODE_PATTERNS } from '../utils/constants';

// Spawn a little above the ground so the suspension settles the car down onto it.
const START_POSITION = { x: 0, y: 0.6, z: 0 };

// Walk the cloned scene once and pull out the four wheel groups in [FL, FR, RL, RR]
// order (matching WHEEL_OFFSETS / wheel indices 0-3), capturing each wheel's rest
// orientation so the sync hook can layer steer + spin on top of it.
function collectWheels(root) {
  return WHEEL_NODE_PATTERNS.map((re) => {
    let found = null;
    root.traverse((o) => {
      if (!found && re.test(o.name)) found = o; // first (outermost) match per wheel
    });
    return found ? { obj: found, base: found.quaternion.clone() } : null;
  });
}

export function VehicleMesh() {
  const { scene } = useGLTF(MODEL_URL);
  // Clone so future multi-vehicle support doesn't share mesh/material instances.
  const cloned = useMemo(() => scene.clone(true), [scene]);
  // Locate the spinnable wheel groups once per clone.
  const wheelsRef = useRef(null);
  if (wheelsRef.current === null) wheelsRef.current = collectWheels(cloned);

  const controlsRef = useKeyboardControls();
  const vehicleRef = useRef(null); // { chassisBody, controller, currentSteer }
  const bodyRef = useRef(null); // the <group> the model lives in

  // Create the physics vehicle exactly once. The cleanup tears it down so React
  // StrictMode's dev double-mount doesn't leave a duplicate chassis in the world.
  useEffect(() => {
    const world = getWorld();
    if (!world) return;
    vehicleRef.current = createVehicle(world, START_POSITION);
    // One-time sanity check: if the wheel names didn't match, driving still works but
    // the wheels won't animate — surface it rather than failing silently.
    const missing = wheelsRef.current.filter((w) => !w).length;
    if (missing) console.warn(`VehicleMesh: ${missing}/4 wheel nodes not found — wheels won't spin`);
    return () => {
      const v = vehicleRef.current;
      if (v) {
        world.removeVehicleController(v.controller);
        world.removeRigidBody(v.chassisBody); // also removes its collider
      }
      vehicleRef.current = null;
    };
  }, []);

  // Both loops internally no-op until the vehicle exists, so it's safe that the
  // effect above populates vehicleRef only after this first render commits.
  usePhysicsLoop(vehicleRef, controlsRef);
  useVehicleSync(vehicleRef, bodyRef, wheelsRef);

  return (
    <group ref={bodyRef}>
      <primitive object={cloned} position={MODEL_RECENTER} />
    </group>
  );
}

// Warm the GLB cache so the model is ready by the time this component mounts.
useGLTF.preload(MODEL_URL);
