// rendering/VehicleMesh.jsx
// Loads the vehicle model (MODEL_URL), spawns the physics vehicle once on mount, and
// drives the mesh from physics every frame. This component is the bridge between the r3f
// scene graph and the Rapier controller — but it never puts per-frame transforms through
// React state.
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useGLTF } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { getWorld } from '../physics/world';
import { createVehicle } from '../physics/vehicleController';
import { useKeyboardControls } from '../input/useKeyboardControls';
import { usePhysicsLoop } from '../hooks/usePhysicsLoop';
import { useVehicleSync } from '../hooks/useVehicleSync';
import { categoryForNode, isDetachClean } from '../damage/adapters/genericSedanCar';
import {
  clearDetachedParts,
  detachPartsNearImpact,
  worldBoundingRadius,
} from '../damage/partDetachment';
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

// Walk the cloned scene once and register every part that this model can detach cleanly
// today. The adapter owns both decisions — which semantic category a node is, and whether
// THIS asset's version of it is detach-clean — so nothing model-specific leaks in here.
function collectDetachableParts(root) {
  const parts = [];
  root.updateWorldMatrix(false, true);
  root.traverse((o) => {
    if (!o.name || !isDetachClean(o.name)) return;
    // Skip descendants of an already-registered part (the mesh-bearing Object_N children).
    if (parts.some((p) => { let a = o.parent; while (a) { if (a === p.node) return true; a = a.parent; } return false; })) return;
    const category = categoryForNode(o.name);
    if (!category) return;
    // `root` is the freshly cloned model, not yet parented into the scene, so a world
    // position here IS the part's car-local position — a constant for as long as the part
    // stays bolted on. detachPartsNearImpact matches against this rather than a live world
    // position, which would be a frame stale (metres, at crash speeds).
    const localPos = o.getWorldPosition(new THREE.Vector3());
    parts.push({ node: o, category, localPos, radius: worldBoundingRadius(o) });
  });
  return parts;
}

export function VehicleMesh({ bodyRef: externalBodyRef }) {
  const threeScene = useThree((s) => s.scene); // detached debris is reparented here
  const { scene } = useGLTF(MODEL_URL);
  // Clone so future multi-vehicle support doesn't share mesh/material instances.
  const cloned = useMemo(() => scene.clone(true), [scene]);
  // Locate the spinnable wheel groups once per clone.
  const wheelsRef = useRef(null);
  if (wheelsRef.current === null) wheelsRef.current = collectWheels(cloned);
  // Parts this model can detach cleanly, resolved once per clone.
  const partsRef = useRef(null);
  if (partsRef.current === null) partsRef.current = collectDetachableParts(cloned);

  const controlsRef = useKeyboardControls();
  const vehicleRef = useRef(null); // { chassisBody, controller, currentSteer }
  // The <group> the model lives in. The parent may pass its own ref in so other components
  // (CameraRig) can read the car's transform; fall back to a private one when standalone.
  const localBodyRef = useRef(null);
  const bodyRef = externalBodyRef ?? localBodyRef;

  // Impact handler, held in a ref so the physics loop calls it without re-subscribing its
  // useFrame. Populated in the mount effect below (assigning during render is not allowed).
  const onImpactRef = useRef(null);

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

    // Runs on the physics ref path: severity in, detached bodies out. No React state, no
    // Redux — collisions reach the UI later via a throttled dispatch, not from here.
    onImpactRef.current = (impact) => {
      detachPartsNearImpact(
        world,
        threeScene,
        partsRef.current,
        impact,
        vehicleRef.current?.chassisBody,
      );
    };
    return () => {
      const v = vehicleRef.current;
      if (v) {
        world.removeVehicleController(v.controller);
        world.removeRigidBody(v.chassisBody); // also removes its collider
      }
      // Debris outlives the car's <group>, so it must be torn down explicitly or the
      // StrictMode double-mount leaves orphaned bodies in the world.
      clearDetachedParts(world);
      vehicleRef.current = null;
    };
    // threeScene is the r3f scene object — stable for the lifetime of the <Canvas>, so
    // this still creates the vehicle exactly once.
  }, [threeScene]);

  // Both loops internally no-op until the vehicle exists, so it's safe that the
  // effect above populates vehicleRef only after this first render commits.
  usePhysicsLoop(vehicleRef, controlsRef, onImpactRef);
  useVehicleSync(vehicleRef, bodyRef, wheelsRef);

  return (
    <group ref={bodyRef}>
      <primitive object={cloned} position={MODEL_RECENTER} />
    </group>
  );
}

// Warm the GLB cache so the model is ready by the time this component mounts.
useGLTF.preload(MODEL_URL);
