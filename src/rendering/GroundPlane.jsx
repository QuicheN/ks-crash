// rendering/GroundPlane.jsx
import { useEffect, useMemo } from 'react';
import { useTexture } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { getWorld } from '../physics/world';

// Runway for extreme-speed runs: ±10km from spawn, ~37s in one direction at 600mph.
// Not larger, because Rapier stores positions as f32 — at 10km that's ~1.2mm of positional
// precision, still far below MAX_SUSPENSION_TRAVEL (0.15m) so the wheel raycasts stay
// stable; by 100km it degrades to ~1.2cm and would show up as contact jitter.
// Costs nothing to draw: still two triangles and one collider, and the camera's far plane
// (r3f default 1000) clips it at 1km anyway.
const GROUND_SIZE = 20000; // meters

export function GroundPlane() {
  const [colorMap, normalMap, roughnessMap] = useTexture([
    '/textures/ground/asphalt/asphalt_diffuse.jpg',
    '/textures/ground/asphalt/asphalt_normal_gl.png',
    '/textures/ground/asphalt/asphalt_rough.png',
  ]);
  const gl = useThree((s) => s.gl);

  // Runs once per texture set, NOT per render: `needsUpdate` forces a GPU re-upload, so
  // doing this every render would re-upload all three maps every frame.
  useMemo(() => {
    const maxAnisotropy = gl.capabilities.getMaxAnisotropy();
    [colorMap, normalMap, roughnessMap].forEach((map) => {
      map.wrapS = map.wrapT = THREE.RepeatWrapping;
      map.repeat.set(GROUND_SIZE / 4, GROUND_SIZE / 4); // one tile per ~4m
      // Without this the asphalt shimmers badly at grazing angles — the plane now stretches
      // to the horizon, so most of the screen is grazing-angle ground.
      map.anisotropy = maxAnisotropy;
      map.needsUpdate = true;
    });
  }, [colorMap, normalMap, roughnessMap, gl]);

  useEffect(() => {
    const world = getWorld();
    // A collider with no attached rigid body is static by default — perfect for flat ground
    const colliderDesc = RAPIER.ColliderDesc.cuboid(GROUND_SIZE / 2, 0.1, GROUND_SIZE / 2)
      .setTranslation(0, -0.1, 0);
    const collider = world.createCollider(colliderDesc);
    // Without this, StrictMode's dev double-mount leaves two stacked ground colliders.
    return () => world.removeCollider(collider, false);
  }, []);

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[GROUND_SIZE, GROUND_SIZE]} />
      <meshStandardMaterial map={colorMap} normalMap={normalMap} roughnessMap={roughnessMap} />
    </mesh>
  );
}
