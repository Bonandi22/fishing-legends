// @ts-nocheck
import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Cloud, Bird, Rock } from './primitives';

/* Animated foam strips on water surface */
function FoamStrips() {
  const refs = useRef<THREE.Mesh[]>([]);
  const strips = useMemo(() => 
    Array.from({ length: 12 }, (_, i) => ({
      z: -50 + i * 9 + Math.random() * 4,
      x: (Math.random() - 0.5) * 40,
      width: 15 + Math.random() * 30,
      speed: 0.15 + Math.random() * 0.2,
    })), []);

  useFrame(({ clock }) => {
    refs.current.forEach((mesh, i) => {
      if (!mesh) return;
      const t = clock.getElapsedTime();
      mesh.position.y = -0.38 + Math.sin(t * strips[i].speed + i) * 0.08;
      mesh.material.opacity = 0.08 + Math.sin(t * 0.5 + i * 0.7) * 0.05;
    });
  });

  return (
    <group>
      {strips.map((s, i) => (
        <mesh
          key={i}
          ref={el => { refs.current[i] = el; }}
          position={[s.x, -0.38, s.z]}
          rotation={[-Math.PI / 2, 0, Math.random() * 0.3]}
        >
          <planeGeometry args={[s.width, 0.5]} />
          <meshStandardMaterial color="#c8e8f8" transparent opacity={0.1} roughness={0.3} />
        </mesh>
      ))}
    </group>
  );
}

/* Distant swells — large subtle geometry behind the water */
function DistantSwells() {
  const ref = useRef<THREE.Mesh>(null);
  const geo = useMemo(() => new THREE.PlaneGeometry(160, 40, 40, 10), []);

  useFrame(({ clock }) => {
    if (!ref.current) return;
    const pos = ref.current.geometry.attributes.position;
    const t = clock.getElapsedTime();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      pos.setZ(i, Math.sin(x * 0.08 + t * 0.3) * 1.2 + Math.cos(y * 0.2 + t * 0.2) * 0.6);
    }
    pos.needsUpdate = true;
  });

  return (
    <mesh ref={ref} geometry={geo} rotation={[-Math.PI / 2, 0, 0]} position={[0, -1, -60]}>
      <meshStandardMaterial color="#1a3a6a" transparent opacity={0.5} roughness={0.3} />
    </mesh>
  );
}

/* Buoy */
function Buoy({ position }: { position: [number, number, number] }) {
  const ref = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.getElapsedTime();
    ref.current.position.y = position[1] + Math.sin(t * 1.2) * 0.25;
    ref.current.rotation.z = Math.sin(t * 0.8) * 0.1;
  });

  return (
    <group ref={ref} position={position}>
      <mesh>
        <cylinderGeometry args={[0.3, 0.4, 0.8, 8]} />
        <meshStandardMaterial color="#cc3333" roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.2, 0]}>
        <cylinderGeometry args={[0.15, 0.15, 0.3, 8]} />
        <meshStandardMaterial color="#ffaa00" roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.5, 0]}>
        <sphereGeometry args={[0.08, 8, 8]} />
        <meshStandardMaterial color="#ffdd00" emissive="#ffaa00" emissiveIntensity={0.5} />
      </mesh>
    </group>
  );
}

export default function OceanScene() {
  return (
    <group>
      <FoamStrips />
      <DistantSwells />

      {/* Buoys */}
      <Buoy position={[-12, -0.2, -15]} />
      <Buoy position={[18, -0.3, -30]} />

      {/* Distant rocks / reef */}
      <Rock position={[-35, -0.1, -45]} scale={3} color="#3a4a58" />
      <Rock position={[40, -0.2, -50]} scale={2.5} color="#3a4a58" />
      <Rock position={[25, -0.3, -55]} scale={4} color="#2e3e4c" />
      <Rock position={[-20, -0.4, -60]} scale={3.5} color="#354555" />

      {/* Clouds */}
      <Cloud position={[-30, 22, -40]} scale={1.5} speed={0.4} />
      <Cloud position={[20, 25, -50]} scale={2.0} speed={0.25} />
      <Cloud position={[-10, 20, -35]} scale={1.2} speed={0.35} />
      <Cloud position={[40, 23, -45]} scale={1.8} speed={0.3} />
      <Cloud position={[-50, 21, -55]} scale={1.3} speed={0.45} />

      {/* Seagulls */}
      <Bird position={[0, 12, -20]} speed={0.8} />
      <Bird position={[-5, 14, -15]} speed={1.0} />
      <Bird position={[8, 11, -25]} speed={0.6} />
      <Bird position={[-10, 13, -30]} speed={0.9} />
      <Bird position={[15, 15, -10]} speed={0.7} />
    </group>
  );
}
