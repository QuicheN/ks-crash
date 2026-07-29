// rendering/obstacles/BoostPad.jsx
// The acceleration pad: drive over it and the car's speed is set outright. `position` is at
// ground level under the centre of the pad.
//
// Unlike the other three obstacles this is a SENSOR, not solid — it reports an overlap and
// applies no force, so the car passes through it without a bump. Three consequences shape
// everything below:
//
//  1. The sensor box must reach UP INTO the chassis collider. The chassis cuboid is lifted
//     clear of the wheels (wagon: world y ~0.18-1.18 at rest), so a pad lying flat on the
//     ground would never be overlapped by anything and would never fire.
//  2. It must be in TRIGGER_GROUPS, not GROUP_WORLD. The suspension raycasts filter to
//     GROUP_WORLD, and a world-group sensor box would be treated as solid ground by the
//     wheels — the car would visibly ride up over an invisible block.
//  3. It is long along its own Z. Rapier's CCD sweeps solid colliders, not sensors, so a
//     short pad can be stepped straight over: at 268 m/s the car covers 4.5m per 60Hz step.
//     10m still isn't proof against arbitrary speed, but it covers everything the car can
//     reach under its own power before the first pad.
import { useCallback } from 'react';
import RAPIER from '@dimforge/rapier3d-compat';
import { BOOST_PAD_SPEED, TRIGGER_GROUPS } from '../../utils/constants';
import { registerTrigger, unregisterTrigger } from '../../physics/triggers';
import { useObstacleBody } from './useObstacleBody';

const SENSOR_HEIGHT = 2.0; // tall enough to overlap the chassis collider, low enough to miss debris
const PAD_COLOR = '#1d6fd6';
const CHEVRON_COLOR = '#7ce7ff';

export function BoostPad({
  position = [0, 0, 0],
  rotationY = 0,
  width = 6,
  length = 10,
  speed = BOOST_PAD_SPEED,
}) {
  const createColliders = useCallback(
    (world, body) => {
      const collider = world.createCollider(
        RAPIER.ColliderDesc.cuboid(width / 2, SENSOR_HEIGHT / 2, length / 2)
          .setTranslation(0, SENSOR_HEIGHT / 2, 0)
          .setSensor(true)
          // The chassis already opts in, so this is belt-and-braces — but it makes the pad
          // work regardless of which collider in the pair is asked about events.
          .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
        body,
      );
      collider.setCollisionGroups(TRIGGER_GROUPS);
      registerTrigger(collider, { type: 'boost', speed });

      // Rapier recycles collider handles, so the registry entry must go BEFORE the body is
      // removed — otherwise a later collider inheriting this handle would fire the boost.
      return () => unregisterTrigger(collider);
    },
    [width, length, speed],
  );

  useObstacleBody(position, rotationY, createColliders);

  const chevronCount = 3;

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {/* Only the ground slab is drawn. The sensor volume above it is deliberately invisible:
          showing it would put a translucent box where the car is supposed to drive.

          These are DECALS on the ground plane, and a small y offset alone does not survive
          the depth test: the ground runs to 20km inside a near=0.1/far=1000 frustum, so
          almost all depth precision sits near the camera and the pad was being swallowed by
          the asphalt (measured — invisible at y=0.02, fine once lifted to y=1). polygonOffset
          biases the depth value in the rasteriser instead of relying on geometric separation,
          which is the standard fix and holds at any viewing distance. The chevrons take a
          bigger bias again so they beat the slab they sit on. */}
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[width, length]} />
        <meshStandardMaterial
          color={PAD_COLOR}
          roughness={0.6}
          emissive={PAD_COLOR}
          emissiveIntensity={0.35}
          polygonOffset
          polygonOffsetFactor={-4}
          polygonOffsetUnits={-8}
        />
      </mesh>
      {Array.from({ length: chevronCount }, (_, i) => (
        <mesh
          key={i}
          // Spread along the pad, pointing the way it accelerates (its local +Z).
          position={[0, 0.04, (i - (chevronCount - 1) / 2) * (length / chevronCount)]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <planeGeometry args={[width * 0.8, length * 0.12]} />
          <meshStandardMaterial
            color={CHEVRON_COLOR}
            emissive={CHEVRON_COLOR}
            emissiveIntensity={0.9}
            roughness={0.4}
            polygonOffset
            polygonOffsetFactor={-8}
            polygonOffsetUnits={-16}
          />
        </mesh>
      ))}
    </group>
  );
}
