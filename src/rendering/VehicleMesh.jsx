// rendering/VehicleMesh.jsx
// Loads a vehicle, spawns its physics body, and drives the mesh from physics every frame.
// The bridge between the r3f scene graph and the Rapier controller — and it never puts
// per-frame transforms through React state.
//
// Everything model-specific comes from a vehicle DEFINITION (src/vehicles/): the model URL,
// its scale/recenter, how its meshes map to destructible chunks, how its wheels are found,
// and how its parts are classified. Swapping vehicles is a `vehicleId` change, not a code
// change — nothing in this file names a model.
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useGLTF } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { getWorld } from '../physics/world';
import { createVehicle } from '../physics/vehicleController';
import { useKeyboardControls } from '../input/useKeyboardControls';
import { usePhysicsLoop } from '../hooks/usePhysicsLoop';
import { useVehicleSync } from '../hooks/useVehicleSync';
import { getVehicle, ACTIVE_VEHICLE_ID, listVehicles } from '../vehicles';
import { applyCrumple, resetCrumple } from '../damage/crumple';
import {
  clearDetachedParts,
  detachPartsNearImpact,
  worldBoundingRadius,
} from '../damage/partDetachment';

// Spawn a little above the ground so the suspension settles the car down onto it.
const START_POSITION = { x: 0, y: 0.6, z: 0 };

/**
 * Prepare a cloned model: place it per the definition, split it into chunks, classify each
 * one, and locate the wheels. All of it strategy-driven, so this works for a model whose
 * nodes are already parts and for one that must be chunked out of material groups.
 */
function prepare(cloned, definition) {
  const { transform, parts, wheels } = definition;

  // Apply placement to the clone BEFORE measuring anything: chunk positions and convex
  // hulls are derived from world matrices, so they must already include scale/recenter.
  cloned.scale.setScalar(transform.scale ?? 1);
  cloned.position.fromArray(transform.recenter ?? [0, 0, 0]).multiplyScalar(transform.scale ?? 1);
  cloned.updateWorldMatrix(false, true);

  const chunks = parts.segment(cloned);

  // Normalised-space classification needs the car's own bounds, measured after placement.
  const bounds = new THREE.Box3().setFromObject(cloned);
  for (const chunk of chunks) {
    chunk.category = parts.classify(chunk, bounds);
    chunk.detachable = parts.detachable(chunk, bounds);
    if (!chunk.radius) chunk.radius = worldBoundingRadius(chunk.node);
  }

  const located = wheels.locate(cloned, chunks, bounds);
  // Wheels are load-bearing for the raycast controller and must never be destructible.
  const wheelNodes = new Set(located.filter(Boolean).map((w) => w.obj));
  const destructible = chunks.filter((c) => c.detachable && !wheelNodes.has(c.node));

  return { chunks, destructible, wheels: located, bounds };
}

export function VehicleMesh({ bodyRef: externalBodyRef, vehicleId = ACTIVE_VEHICLE_ID }) {
  const threeScene = useThree((s) => s.scene); // detached debris is reparented here
  const definition = getVehicle(vehicleId);
  const { scene } = useGLTF(definition.url);

  // Clone so future multi-vehicle support doesn't share mesh/material instances, then run
  // the whole preparation once per clone.
  const prepared = useMemo(() => {
    const cloned = scene.clone(true);
    return { cloned, ...prepare(cloned, definition) };
  }, [scene, definition]);

  const controlsRef = useKeyboardControls();
  const vehicleRef = useRef(null);
  // The <group> the model lives in. The parent may pass its own ref in so other components
  // (CameraRig) can read the car's transform; fall back to a private one when standalone.
  const localBodyRef = useRef(null);
  const bodyRef = externalBodyRef ?? localBodyRef;
  // Ref-shaped holder rather than a real useRef: it's derived from `prepared`, and writing a
  // React ref during render isn't allowed. useVehicleSync only needs `.current`.
  const wheelsRef = useMemo(() => ({ current: prepared.wheels }), [prepared]);

  // Impact handler, held in a ref so the physics loop calls it without re-subscribing its
  // useFrame. Populated in the mount effect below (assigning during render is not allowed).
  const onImpactRef = useRef(null);

  // Create the physics vehicle exactly once per definition. The cleanup tears it down so
  // React StrictMode's dev double-mount doesn't leave a duplicate chassis in the world.
  useEffect(() => {
    const world = getWorld();
    if (!world) return;
    vehicleRef.current = createVehicle(world, START_POSITION, definition);

    const missing = prepared.wheels.filter((w) => !w).length;
    if (missing) {
      console.warn(
        `VehicleMesh: ${missing}/4 wheels not located on "${definition.id}" — driving still works, wheels won't animate`,
      );
    }

    // Runs on the physics ref path: severity in, damage out. No React state, no Redux —
    // collisions reach the UI later via a throttled dispatch, not from here.
    onImpactRef.current = (impact) => {
      const chassisBody = vehicleRef.current?.chassisBody;
      if (!chassisBody) return;
      // Detach first, then crumple whatever survived, so a chunk never does both.
      detachPartsNearImpact(world, threeScene, prepared.destructible, impact, chassisBody);
      applyCrumple(prepared.destructible, impact, chassisBody);
    };

    return () => {
      const v = vehicleRef.current;
      if (v) {
        world.removeVehicleController(v.controller);
        world.removeRigidBody(v.chassisBody); // also removes its collider
      }
      // Debris outlives the car's <group>, and crumple state outlives the clone, so both
      // must be torn down explicitly or a remount inherits the previous run's damage.
      clearDetachedParts(world);
      resetCrumple(prepared.destructible);
      vehicleRef.current = null;
    };
    // threeScene is the r3f scene object — stable for the lifetime of the <Canvas>.
  }, [threeScene, definition, prepared]);

  // Both loops internally no-op until the vehicle exists, so it's safe that the
  // effect above populates vehicleRef only after this first render commits.
  usePhysicsLoop(vehicleRef, controlsRef, onImpactRef);
  useVehicleSync(vehicleRef, bodyRef, wheelsRef);

  return (
    <group ref={bodyRef}>
      <primitive object={prepared.cloned} />
    </group>
  );
}

// Warm the GLB cache for every registered vehicle so a swap doesn't stall on load.
listVehicles().forEach(({ url }) => useGLTF.preload(url));
