import { Suspense, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { useSelector } from 'react-redux';
import { GroundPlane } from './GroundPlane';
import { VehicleMesh } from './VehicleMesh';
import { OBSTACLE_COMPONENTS } from './obstacles';
import { selectSceneObstacles } from '../state/selectors';
import { CameraRig } from './CameraRig';


export function SceneCanvas({ children }) {
  // Owned here so both the vehicle (which writes it) and the camera (which reads it) can
  // share the car's <group>.
  const vehicleBodyRef = useRef(null);
  // The active layout, straight from the store — editing it in the editor tab rebuilds the
  // bodies here (useObstacleBody keys its effect on the position/size primitives, and its
  // cleanup removes the collider and body, so this needs no teardown of its own).
  //
  // This useSelector is deliberately OUTSIDE <Canvas>: r3f's reconciler is a separate root,
  // so React context inside the canvas subtree is not something to depend on. The array is
  // read here and consumed below as a plain value.
  const obstacles = useSelector(selectSceneObstacles);

  return (
    // The initial camera is roughly the chase pose so the very first frame is sensible;
    // CameraRig snaps it exactly into place as soon as the car mounts.
    <Canvas shadows camera={{ position: [0, 2.6, -7.5], fov: 60 }}>
      <ambientLight intensity={0.8} />
      <hemisphereLight args={['#ffffff', '#444444', 0.6]} />
      <directionalLight
        position={[10, 15, 10]}
        intensity={2}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={0.5}
        shadow-camera-far={60}
        shadow-camera-left={-20}
        shadow-camera-right={20}
        shadow-camera-top={20}
        shadow-camera-bottom={-20}
      />
      <directionalLight position={[-10, 8, -10]} intensity={0.5} />
      <Suspense fallback={null}>
        <GroundPlane />
        {/* Placement is data (the active layout); this only resolves type -> component. */}
        {obstacles.map(({ id, type, ...props }) => {
          const Obstacle = OBSTACLE_COMPONENTS[type];
          if (!Obstacle) {
            console.warn(`SceneCanvas: unknown obstacle type "${type}" (id "${id}")`);
            return null;
          }
          return <Obstacle key={id} {...props} />;
        })}
        <VehicleMesh bodyRef={vehicleBodyRef} />
        {/* Must stay AFTER <VehicleMesh/>: useFrame callbacks of equal priority run in
            subscription order, so this ordering is what lets the camera read the car
            transform written by useVehicleSync this frame rather than last frame's. */}
        <CameraRig targetRef={vehicleBodyRef} />
        {children}
      </Suspense>
    </Canvas>
  );
}