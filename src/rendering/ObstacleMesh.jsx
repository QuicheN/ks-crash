// rendering/ObstacleMesh.jsx
// A static crash obstacle: one visual box and one hand-authored cuboid collider that match
// exactly. Per CLAUDE.md's "collision geometry is always simpler than visual geometry" rule
// the collider is always a primitive — a visually detailed obstacle would keep this same
// cuboid rather than gaining a mesh collider.
//
// Fixed rigid body (not a bare collider) so the obstacle has an explicit transform that a
// scenario builder can later place and rotate. Cleanup on unmount follows the same
// StrictMode-safety contract as GroundPlane: without it the dev double-mount silently
// leaves a second wall standing in the world.
import { useEffect } from 'react';
import RAPIER from '@dimforge/rapier3d-compat';
import { getWorld } from '../physics/world';
import { OBSTACLE_GROUPS } from '../utils/constants';

export function ObstacleMesh({
  position = [0, 1.5, 40],
  halfExtents = [6, 1.5, 0.5],
  rotationY = 0,
  color = '#8a4a3a',
}) {
  const [hx, hy, hz] = halfExtents;
  const [px, py, pz] = position;

  useEffect(() => {
    const world = getWorld();
    if (!world) return;
    const half = Math.sin(rotationY / 2);
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed()
        .setTranslation(px, py, pz)
        .setRotation({ x: 0, y: half, z: 0, w: Math.cos(rotationY / 2) }),
    );
    const collider = world.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz), body);
    collider.setCollisionGroups(OBSTACLE_GROUPS);
    return () => world.removeRigidBody(body); // also removes the collider
  }, [px, py, pz, hx, hy, hz, rotationY]);

  return (
    <mesh position={position} rotation={[0, rotationY, 0]} castShadow receiveShadow>
      <boxGeometry args={[hx * 2, hy * 2, hz * 2]} />
      <meshStandardMaterial color={color} roughness={0.85} />
    </mesh>
  );
}
