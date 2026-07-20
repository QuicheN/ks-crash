import { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { GroundPlane } from './GroundPlane';
import { VehicleMesh } from './VehicleMesh';


export function SceneCanvas({ children }) {
  return (
    <Canvas shadows camera={{ position: [0, 5, 10], fov: 60 }}>
      <ambientLight intensity={0.4} />
      <directionalLight position={[10, 15, 10]} intensity={1} castShadow />
      <Suspense fallback={null}>
        <GroundPlane />
        <VehicleMesh />
        {children}
      </Suspense>
    </Canvas>
  );
}