// rendering/GroundPlane.jsx
import { useEffect } from 'react';
import { useTexture } from '@react-three/drei';
import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { getWorld } from '../physics/world';

const GROUND_SIZE = 200; // meters

export function GroundPlane() {
  const [colorMap, normalMap, roughnessMap] = useTexture([
    '/textures/ground/asphalt/asphalt_diffuse.jpg',
    '/textures/ground/asphalt/asphalt_normal_gl.png',
    '/textures/ground/asphalt/asphalt_rough.png',
  ]);

  // Tile the texture instead of stretching one image across 200m
  [colorMap, normalMap, roughnessMap].forEach((map) => {
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.repeat.set(GROUND_SIZE / 4, GROUND_SIZE / 4); // one tile per ~4m
  });

  useEffect(() => {
    const world = getWorld();
    // A collider with no attached rigid body is static by default — perfect for flat ground
    const colliderDesc = RAPIER.ColliderDesc.cuboid(GROUND_SIZE / 2, 0.1, GROUND_SIZE / 2)
      .setTranslation(0, -0.1, 0);
    world.createCollider(colliderDesc);
  }, []);

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[GROUND_SIZE, GROUND_SIZE]} />
      <meshStandardMaterial map={colorMap} normalMap={normalMap} roughnessMap={roughnessMap} />
    </mesh>
  );
}