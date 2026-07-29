// rendering/obstacles/Ramp.jsx
// A launch ramp: a true wedge, low edge at -Z, rising to `height` at +Z. `position` sits at
// ground level under the centre of the base, so a layout entry places it at y=0.
//
// A wedge rather than a rotated box, because a rotated box presents a knife EDGE at ground
// level — the car hits it instead of climbing it, and the wheel raycasts find nothing to
// ride up. The sloped face here starts at y=0 so the wheels pick it up smoothly.
//
// The six corners are defined ONCE and feed both the visual geometry and the collider, so
// the two cannot drift apart. That also keeps the "simpler than visual" rule honest: a
// 6-point convex hull is the collision shape whether or not the visual gets detailed later.
import { useCallback, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { OBSTACLE_GROUPS } from '../../utils/constants';
import { useObstacleBody } from './useObstacleBody';

// Corner order — referenced by the triangle list below, so don't reorder these:
//   0,1 low edge (y=0, z=-L/2)   2,3 base far edge (y=0, z=+L/2)   4,5 top edge (y=H, z=+L/2)
function wedgeCorners(width, length, height) {
  const w = width / 2;
  const l = length / 2;
  return new Float32Array([
    -w, 0, -l, // 0
    w, 0, -l, // 1
    w, 0, l, // 2
    -w, 0, l, // 3
    w, height, l, // 4
    -w, height, l, // 5
  ]);
}

// Counter-clockwise seen from outside, so computeVertexNormals() points every face outward.
// prettier-ignore
const WEDGE_INDICES = [
  0, 1, 2,  0, 2, 3, // base (-Y)
  0, 4, 1,  0, 5, 4, // sloped driving surface
  3, 2, 4,  3, 4, 5, // vertical back face (+Z)
  1, 4, 2,           // right side (+X)
  0, 3, 5,           // left side (-X)
];

export function Ramp({
  position = [0, 0, 0],
  rotationY = 0,
  width = 8,
  length = 12,
  height = 2.4,
  color = '#6d7480',
}) {
  const corners = useMemo(() => wedgeCorners(width, length, height), [width, length, height]);

  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(corners.slice(), 3));
    g.setIndex(WEDGE_INDICES);
    g.computeVertexNormals();
    return g;
  }, [corners]);

  // BufferGeometry holds GPU resources, and r3f only auto-disposes geometry it created from
  // JSX — this one is constructed by hand, so it has to be released explicitly.
  useEffect(() => () => geometry.dispose(), [geometry]);

  const createColliders = useCallback(
    (world, body) => {
      // The hull of the six corners IS the wedge — no approximation.
      // convexHull is typed nullable and partDetachment already guards it, so this keeps the
      // same guard — though measured against 0.14 it returned a hull even for coplanar and
      // single-point input, so the fallback is insurance rather than a path we expect to hit.
      const fallbackHeight = Math.max(height, 0.05);
      const desc =
        RAPIER.ColliderDesc.convexHull(corners) ??
        RAPIER.ColliderDesc.cuboid(width / 2, fallbackHeight / 2, length / 2).setTranslation(
          0,
          fallbackHeight / 2,
          0,
        );
      const collider = world.createCollider(desc, body);
      // GROUP_WORLD is what makes the ramp drivable at all: WHEEL_RAY_GROUPS filters the
      // suspension raycasts to exactly this group, so the wheels track the slope.
      collider.setCollisionGroups(OBSTACLE_GROUPS);
    },
    [corners, width, height, length],
  );

  useObstacleBody(position, rotationY, createColliders);

  return (
    <mesh
      geometry={geometry}
      position={position}
      rotation={[0, rotationY, 0]}
      castShadow
      receiveShadow
    >
      <meshStandardMaterial color={color} roughness={0.9} flatShading />
    </mesh>
  );
}
