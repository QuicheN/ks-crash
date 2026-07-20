import { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { GroundPlane } from './GroundPlane';
import { VehicleMesh } from './VehicleMesh';


export function SceneCanvas({ children }) {
  return (
    <Canvas shadows camera={{ position: [0, 5, 10], fov: 60 }}>
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
        <VehicleMesh />
        {children}
      </Suspense>
    </Canvas>
  );
}