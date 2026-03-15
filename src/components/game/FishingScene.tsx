// @ts-nocheck
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Sky } from '@react-three/drei';
import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { FishingLocation } from '@/game/types';

function Water({ color }: { color: string }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const geo = useMemo(() => new THREE.PlaneGeometry(60, 60, 80, 80), []);

  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    const pos = (meshRef.current.geometry as THREE.PlaneGeometry).attributes.position;
    const t = clock.getElapsedTime();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      pos.setZ(i, Math.sin(x * 0.4 + t * 0.8) * 0.25 + Math.cos(y * 0.5 + t * 0.6) * 0.18 + Math.sin((x + y) * 0.2 + t * 1.2) * 0.1);
    }
    pos.needsUpdate = true;
  });

  return (
    <mesh ref={meshRef} geometry={geo} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.5, 0]}>
      <meshStandardMaterial
        color={color}
        transparent
        opacity={0.88}
        roughness={0.15}
        metalness={0.4}
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
      <mesh position={[0, 0.15, 0]}>
        <sphereGeometry args={[0.2, 16, 16]} />
        <meshStandardMaterial color="#ef4444" />
      </mesh>
      <mesh position={[0, 0.5, 0]}>
        <cylinderGeometry args={[0.02, 0.02, 0.5]} />
        <meshStandardMaterial color="#ffffff" />
      </mesh>
      {/* Line going down into water */}
      <mesh position={[0, -0.3, 0]}>
        <cylinderGeometry args={[0.008, 0.008, 0.8]} />
        <meshStandardMaterial color="#cccccc" transparent opacity={0.6} />
      </mesh>
    </group>
  );
}

/* Terrain / bank around the water */
function Terrain() {
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(120, 120, 32, 32);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const distFromCenter = Math.sqrt(x * x + y * y);
      // Raise edges to form banks
      const height = distFromCenter > 28 ? (distFromCenter - 28) * 0.15 + Math.random() * 0.3 : -0.6;
      pos.setZ(i, Math.max(height, -0.6));
    }
    g.computeVertexNormals();
    return g;
  }, []);

  return (
    <mesh geometry={geo} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.6, 0]}>
      <meshStandardMaterial color="#4a7c3f" roughness={0.9} metalness={0} />
    </mesh>
  );
}

/* Simple tree made of cones and cylinder */
function Tree({ position, scale = 1 }: { position: [number, number, number]; scale?: number }) {
  return (
    <group position={position} scale={scale}>
      {/* Trunk */}
      <mesh position={[0, 1, 0]}>
        <cylinderGeometry args={[0.15, 0.2, 2, 8]} />
        <meshStandardMaterial color="#5c3a1e" roughness={0.9} />
      </mesh>
      {/* Foliage layers */}
      <mesh position={[0, 2.8, 0]}>
        <coneGeometry args={[1.2, 2, 8]} />
        <meshStandardMaterial color="#2d6b1e" roughness={0.8} />
      </mesh>
      <mesh position={[0, 3.8, 0]}>
        <coneGeometry args={[0.9, 1.6, 8]} />
        <meshStandardMaterial color="#3a8a2a" roughness={0.8} />
      </mesh>
      <mesh position={[0, 4.6, 0]}>
        <coneGeometry args={[0.6, 1.2, 8]} />
        <meshStandardMaterial color="#4ba33a" roughness={0.8} />
      </mesh>
    </group>
  );
}

/* Bush / low vegetation */
function Bush({ position, scale = 1 }: { position: [number, number, number]; scale?: number }) {
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 0.4, 0]}>
        <sphereGeometry args={[0.6, 8, 8]} />
        <meshStandardMaterial color="#3d7a2e" roughness={0.9} />
      </mesh>
      <mesh position={[0.4, 0.3, 0.2]}>
        <sphereGeometry args={[0.45, 8, 8]} />
        <meshStandardMaterial color="#4a9035" roughness={0.9} />
      </mesh>
      <mesh position={[-0.3, 0.3, -0.2]}>
        <sphereGeometry args={[0.5, 8, 8]} />
        <meshStandardMaterial color="#357025" roughness={0.9} />
      </mesh>
    </group>
  );
}

/* Grass tufts */
function GrassPatch({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {[0, 0.3, -0.2, 0.15, -0.1].map((offset, i) => (
        <mesh key={i} position={[offset, 0.25, offset * 0.5]} rotation={[0, i * 1.2, 0.1]}>
          <boxGeometry args={[0.03, 0.5, 0.03]} />
          <meshStandardMaterial color="#5aa840" roughness={1} />
        </mesh>
      ))}
    </group>
  );
}

/* Rock */
function Rock({ position, scale = 1 }: { position: [number, number, number]; scale?: number }) {
  return (
    <mesh position={position} scale={scale} rotation={[Math.random() * 0.3, Math.random() * Math.PI, 0]}>
      <dodecahedronGeometry args={[0.5, 0]} />
      <meshStandardMaterial color="#7a7a72" roughness={0.95} metalness={0.05} />
    </mesh>
  );
}

/* All vegetation and margin elements */
function VegetationLayer() {
  const trees = useMemo(() => [
    // Back row
    { pos: [-18, 0.5, -32] as [number, number, number], s: 1.4 },
    { pos: [-12, 0.3, -30] as [number, number, number], s: 1.1 },
    { pos: [-5, 0.6, -33] as [number, number, number], s: 1.6 },
    { pos: [3, 0.4, -31] as [number, number, number], s: 1.2 },
    { pos: [10, 0.5, -34] as [number, number, number], s: 1.5 },
    { pos: [17, 0.3, -30] as [number, number, number], s: 1.0 },
    { pos: [24, 0.6, -33] as [number, number, number], s: 1.3 },
    // Left side
    { pos: [-32, 0.5, -20] as [number, number, number], s: 1.3 },
    { pos: [-34, 0.4, -10] as [number, number, number], s: 1.1 },
    { pos: [-30, 0.6, 0] as [number, number, number], s: 1.5 },
    { pos: [-33, 0.3, 10] as [number, number, number], s: 1.0 },
    // Right side
    { pos: [32, 0.5, -15] as [number, number, number], s: 1.2 },
    { pos: [34, 0.4, -5] as [number, number, number], s: 1.4 },
    { pos: [30, 0.6, 5] as [number, number, number], s: 1.1 },
    { pos: [33, 0.3, 15] as [number, number, number], s: 1.3 },
  ], []);

  const bushes = useMemo(() => [
    { pos: [-28, 0.2, -28] as [number, number, number], s: 1.0 },
    { pos: [-15, 0.1, -28] as [number, number, number], s: 0.8 },
    { pos: [8, 0.2, -29] as [number, number, number], s: 1.1 },
    { pos: [20, 0.1, -28] as [number, number, number], s: 0.9 },
    { pos: [-30, 0.2, -5] as [number, number, number], s: 1.0 },
    { pos: [30, 0.1, 0] as [number, number, number], s: 0.8 },
    { pos: [-29, 0.2, 8] as [number, number, number], s: 1.2 },
    { pos: [29, 0.2, 10] as [number, number, number], s: 0.9 },
  ], []);

  const rocks = useMemo(() => [
    { pos: [-28, 0, -25] as [number, number, number], s: 0.8 },
    { pos: [25, 0, -27] as [number, number, number], s: 1.2 },
    { pos: [-31, 0, 3] as [number, number, number], s: 0.6 },
    { pos: [31, 0, -8] as [number, number, number], s: 1.0 },
    { pos: [0, 0, -29] as [number, number, number], s: 0.7 },
  ], []);

  const grass = useMemo(() => [
    [-27, 0, -26], [-20, 0, -28], [-8, 0, -29], [5, 0, -28],
    [15, 0, -29], [-29, 0, -15], [-30, 0, 5], [29, 0, -12],
    [30, 0, 8], [22, 0, -28],
  ].map(p => p as [number, number, number]), []);

  return (
    <group>
      {trees.map((t, i) => <Tree key={`t${i}`} position={t.pos} scale={t.s} />)}
      {bushes.map((b, i) => <Bush key={`b${i}`} position={b.pos} scale={b.s} />)}
      {rocks.map((r, i) => <Rock key={`r${i}`} position={r.pos} scale={r.s} />)}
      {grass.map((g, i) => <GrassPatch key={`g${i}`} position={g} />)}
    </group>
  );
}

/* Fishing rod visible from camera POV */
function FishingRod() {
  return (
    <group position={[2, 0.5, 8]} rotation={[0, -0.3, 0]}>
      {/* Rod */}
      <mesh position={[0, 2, 0]} rotation={[0.6, 0, 0.1]}>
        <cylinderGeometry args={[0.03, 0.06, 5, 8]} />
        <meshStandardMaterial color="#8B6914" roughness={0.7} />
      </mesh>
      {/* Reel */}
      <mesh position={[0, 0.8, 0.3]}>
        <torusGeometry args={[0.12, 0.04, 8, 16]} />
        <meshStandardMaterial color="#888" metalness={0.8} roughness={0.2} />
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
      camera={{ position: [0, 6, 12], fov: 55 }}
      style={{ position: 'absolute', inset: 0 }}
      shadows
    >
      <Sky sunPosition={[100, 40, 80]} turbidity={8} rayleigh={2} />
      <fog attach="fog" args={['#b8d4e8', 40, 90]} />
      <ambientLight intensity={0.5} color={location.ambientColor} />
      <directionalLight position={[10, 15, 5]} intensity={1.3} castShadow shadow-mapSize={1024} />
      <pointLight position={[-10, 5, -10]} intensity={0.3} color="#ffd700" />
      <hemisphereLight args={['#87ceeb', '#4a7c3f', 0.4]} />

      <Terrain />
      <Water color={location.waterColor} />
      <VegetationLayer />
      <FishingRod />

      {/* Clickable plane for casting */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.3, 0]}
        onClick={(e) => {
          e.stopPropagation();
          onWaterClick(e.point);
        }}
      >
        <planeGeometry args={[60, 60]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>

      <FishingBobber visible={bobberVisible} position={bobberPosition} />

      <OrbitControls
        maxPolarAngle={Math.PI / 2.3}
        minPolarAngle={Math.PI / 6}
        enablePan={false}
        minDistance={8}
        maxDistance={22}
        target={[0, -1, -5]}
      />
    </Canvas>
  );
}
