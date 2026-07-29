// rendering/obstacles/useObstacleBody.js
// Shared mount/unmount plumbing for every static obstacle: one fixed rigid body at a
// position and Y-rotation, whatever colliders the caller wants hung off it, and teardown.
//
// A fixed rigid body rather than a bare collider (which Rapier would also treat as static)
// because it gives the obstacle an explicit transform a scenario builder can place and
// rotate later, and because multi-collider obstacles like the tree then move as one piece.
//
// The cleanup is not optional. React StrictMode double-mounts in dev, so without it every
// obstacle silently ends up in the world twice — the exact bug fixed in GroundPlane in
// Session 2, where an A/B showed 3 colliders where there should have been 2.
import { useEffect } from 'react';
import RAPIER from '@dimforge/rapier3d-compat';
import { getWorld } from '../../physics/world';

/**
 * @param position    [x, y, z] world placement of the body origin
 * @param rotationY   yaw in radians
 * @param createColliders  (world, body) => void — wrap it in useCallback, it's an effect dep.
 *                    Any cleanup it needs (e.g. unregistering a trigger) can be returned and
 *                    will run before the body is removed.
 */
export function useObstacleBody(position, rotationY, createColliders) {
  const [px, py, pz] = position;

  useEffect(() => {
    const world = getWorld();
    if (!world) return;

    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed()
        .setTranslation(px, py, pz)
        .setRotation({ x: 0, y: Math.sin(rotationY / 2), z: 0, w: Math.cos(rotationY / 2) }),
    );
    const cleanupColliders = createColliders(world, body);

    return () => {
      cleanupColliders?.();
      world.removeRigidBody(body); // also removes every collider attached to it
    };
  }, [px, py, pz, rotationY, createColliders]);
}
