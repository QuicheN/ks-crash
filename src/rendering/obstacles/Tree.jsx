// rendering/obstacles/Tree.jsx
// A static tree. `position` is where it meets the ground, so a layout entry places trees at
// y=0 without knowing their height.
//
// Only the TRUNK gets a collider — a vertical cylinder, the simplest shape that matches what
// a car can actually hit. The canopy starts above roof height and would never be touched, so
// colliding it would only give the chassis and the suspension raycasts an invisible ball to
// fight over. This is the "collision geometry is simpler than visual geometry" rule doing
// real work rather than just approximating: whole parts of the visual have no collider at all.
//
// Low segment counts throughout to match the wagon's low-poly art style (and because these
// get scattered around the scene).
import { useCallback } from 'react';
import RAPIER from '@dimforge/rapier3d-compat';
import { OBSTACLE_GROUPS } from '../../utils/constants';
import { useObstacleBody } from './useObstacleBody';

const TRUNK_COLOR = '#5a4433';
const CANOPY_COLOR = '#3f6b3a';

export function Tree({
  position = [0, 0, 0],
  rotationY = 0,
  trunkRadius = 0.22,
  trunkHeight = 2.6,
  canopyRadius = 1.7,
}) {
  const createColliders = useCallback(
    (world, body) => {
      // Rapier's cylinder is Y-axis aligned and centred on its own origin, so it has to be
      // lifted half its height to stand on the ground plane.
      const collider = world.createCollider(
        RAPIER.ColliderDesc.cylinder(trunkHeight / 2, trunkRadius).setTranslation(
          0,
          trunkHeight / 2,
          0,
        ),
        body,
      );
      collider.setCollisionGroups(OBSTACLE_GROUPS);
    },
    [trunkRadius, trunkHeight],
  );

  useObstacleBody(position, rotationY, createColliders);

  const canopyBase = trunkHeight * 0.75; // tiers overlap the top of the trunk

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh position={[0, trunkHeight / 2, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[trunkRadius * 0.8, trunkRadius, trunkHeight, 8]} />
        <meshStandardMaterial color={TRUNK_COLOR} roughness={0.95} flatShading />
      </mesh>
      <mesh position={[0, canopyBase + 1.0, 0]} castShadow>
        <coneGeometry args={[canopyRadius, 2.2, 8]} />
        <meshStandardMaterial color={CANOPY_COLOR} roughness={0.9} flatShading />
      </mesh>
      <mesh position={[0, canopyBase + 2.1, 0]} castShadow>
        <coneGeometry args={[canopyRadius * 0.72, 1.9, 8]} />
        <meshStandardMaterial color={CANOPY_COLOR} roughness={0.9} flatShading />
      </mesh>
    </group>
  );
}
