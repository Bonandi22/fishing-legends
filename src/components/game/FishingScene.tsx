import { Canvas } from '@react-three/fiber';
import { Environment, OrbitControls, Sky, Text } from '@react-three/drei';
import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { FishingLocation } from '@/game/types';

function Water({ color }: { color: string }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const geo = useMemo(() => new THREE.PlaneGeometry(100, 100, 64, 64), []);

  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    const pos = (meshRef.current.geometry as THREE.PlaneGeometry).attributes.position;
    const t = clock.getElapsedTime();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      pos.setZ(i, Math.sin(x * 0.3 + t) * 0.3 + Math.cos(y * 0.4 + t * 0.7) * 0.2);
    }
    pos.needsUpdate = true;
  });

  return (
    <mesh ref={meshRef} geometry={geo} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.5, 0]}>
      <meshStandardMaterial
        color={color}
        transparent
        opacity={0.85}
        roughness={0.2}
        metalness={0.3}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

function FishingBobber({ visible, position }: { visible: boolean; position: [number, number, number] }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!ref.current || !visible) return;
    ref.current.position.y = position[1] + Math.sin(clock.getElapsedTime() * 2) * 0.15;
  });

  if (!visible) return null;

  return (
    <group ref={ref} position={position}>
      {/* bobber body */}
      <mesh position={[0, 0.15, 0]}>
        <sphereGeometry args={[0.2, 16, 16]} />
        <meshStandardMaterial color="#ef4444" />
      </mesh>
      {/* stick */}
      <mesh position={[0, 0.5, 0]}>
        <cylinderGeometry args={[0.02, 0.02, 0.5]} />
        <meshStandardMaterial color="#ffffff" />
      </mesh>
    </group>
  );
}

interface Props {
  location: FishingLocation;
  bobberVisible: boolean;
  bobberPosition: [number, number, number];
  onWaterClick: (point: THREE.Vector3) => void;
}

export function FishingScene3D({ location, bobberVisible, bobberPosition, onWaterClick }: Props) {
  return (
    <Canvas
      camera={{ position: [0, 8, 15], fov: 60 }}
      style={{ position: 'absolute', inset: 0 }}
    >
      <Sky sunPosition={[100, 50, 100]} />
      <ambientLight intensity={0.6} color={location.ambientColor} />
      <directionalLight position={[10, 10, 5]} intensity={1.2} castShadow />
      <pointLight position={[-10, 5, -10]} intensity={0.4} color="#ffd700" />

      <Water color={location.waterColor} />

      {/* Clickable plane for casting */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.3, 0]}
        onClick={(e) => {
          e.stopPropagation();
          onWaterClick(e.point);
        }}
      >
        <planeGeometry args={[100, 100]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>

      <FishingBobber visible={bobberVisible} position={bobberPosition} />

      <OrbitControls
        maxPolarAngle={Math.PI / 2.2}
        minPolarAngle={Math.PI / 6}
        enablePan={false}
        minDistance={8}
        maxDistance={25}
      />
    </Canvas>
  );
}
