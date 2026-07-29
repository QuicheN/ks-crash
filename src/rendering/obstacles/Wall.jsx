// rendering/obstacles/Wall.jsx
// A static crash barrier: one visual box and one cuboid collider that match exactly. Per
// CLAUDE.md's "collision geometry is always simpler than visual geometry" rule the collider
// is always a primitive — a visually detailed wall would keep this same cuboid rather than
// gaining a mesh collider.
//
// Nothing here opts into collision events: the chassis collider already sets
// ActiveEvents.COLLISION_EVENTS, and Rapier emits an event when EITHER collider opts in, so
// every obstacle feeds the severity/damage pipeline for free just by existing.
import { useCallback } from 'react';
import RAPIER from '@dimforge/rapier3d-compat';
import { OBSTACLE_GROUPS } from '../../utils/constants';
import { useObstacleBody } from './useObstacleBody';

export function Wall({
  position = [0, 1.5, 60],
  halfExtents = [8, 1.5, 0.5],
  rotationY = 0,
  color = '#8a4a3a',
}) {
  const [hx, hy, hz] = halfExtents;

  const createColliders = useCallback(
    (world, body) => {
      const collider = world.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz), body);
      collider.setCollisionGroups(OBSTACLE_GROUPS);
    },
    [hx, hy, hz],
  );

  useObstacleBody(position, rotationY, createColliders);

  return (
    <mesh position={position} rotation={[0, rotationY, 0]} castShadow receiveShadow>
      <boxGeometry args={[hx * 2, hy * 2, hz * 2]} />
      <meshStandardMaterial color={color} roughness={0.85} />
    </mesh>
  );
}
