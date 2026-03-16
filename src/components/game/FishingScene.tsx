// @ts-nocheck
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Sky } from '@react-three/drei';
import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { FishingLocation, LocationType } from '@/game/types';

/* ══════════════════════════════════════════════════════════
   WATER — adapts shape & animation per location type
   ══════════════════════════════════════════════════════════ */
function Water({ color, locationType }: { color: string; locationType: LocationType }) {
  const meshRef = useRef<THREE.Mesh>(null);

  const { width, depth, segsW, segsD } = useMemo(() => {
    switch (locationType) {
      case 'river': return { width: 18, depth: 80, segsW: 30, segsD: 120 };
      case 'lake': return { width: 40, depth: 40, segsW: 60, segsD: 60 };
      case 'ocean': return { width: 120, depth: 120, segsW: 100, segsD: 100 };
    }
  }, [locationType]);

  const geo = useMemo(() => new THREE.PlaneGeometry(width, depth, segsW, segsD), [width, depth, segsW, segsD]);

  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    const pos = (meshRef.current.geometry as THREE.PlaneGeometry).attributes.position;
    const t = clock.getElapsedTime();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      if (locationType === 'ocean') {
        // Big rolling waves
        pos.setZ(i,
          Math.sin(x * 0.15 + t * 0.6) * 0.6 +
          Math.cos(y * 0.12 + t * 0.4) * 0.45 +
          Math.sin((x + y) * 0.08 + t * 0.9) * 0.3
        );
      } else if (locationType === 'river') {
        // Flowing current along Y axis
        pos.setZ(i,
          Math.sin(y * 0.3 + t * 1.5) * 0.12 +
          Math.cos(x * 0.8 + t * 0.7) * 0.06 +
          Math.sin(y * 0.1 + t * 0.5) * 0.08
        );
      } else {
        // Calm lake ripples
        pos.setZ(i,
          Math.sin(x * 0.3 + t * 0.5) * 0.08 +
          Math.cos(y * 0.35 + t * 0.4) * 0.06 +
          Math.sin((x * x + y * y) * 0.005 + t * 0.3) * 0.04
        );
      }
    }
    pos.needsUpdate = true;
  });

  return (
    <mesh ref={meshRef} geometry={geo} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.5, 0]}>
      <meshStandardMaterial
        color={color}
        transparent
        opacity={locationType === 'ocean' ? 0.85 : 0.9}
        roughness={locationType === 'lake' ? 0.1 : 0.2}
        metalness={0.35}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

/* ══════════════════════════════════════════════════════════
   BOBBER
   ══════════════════════════════════════════════════════════ */
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
      <mesh position={[0, -0.3, 0]}>
        <cylinderGeometry args={[0.008, 0.008, 0.8]} />
        <meshStandardMaterial color="#cccccc" transparent opacity={0.6} />
      </mesh>
    </group>
  );
}

/* ══════════════════════════════════════════════════════════
   SHARED VEGETATION PRIMITIVES
   ══════════════════════════════════════════════════════════ */
function Tree({ position, scale = 1, trunkColor = '#5c3a1e', foliageColor = '#2d6b1e' }: {
  position: [number, number, number]; scale?: number; trunkColor?: string; foliageColor?: string;
}) {
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 1, 0]}>
        <cylinderGeometry args={[0.15, 0.2, 2, 8]} />
        <meshStandardMaterial color={trunkColor} roughness={0.9} />
      </mesh>
      <mesh position={[0, 2.8, 0]}>
        <coneGeometry args={[1.2, 2, 8]} />
        <meshStandardMaterial color={foliageColor} roughness={0.8} />
      </mesh>
      <mesh position={[0, 3.8, 0]}>
        <coneGeometry args={[0.9, 1.6, 8]} />
        <meshStandardMaterial color={foliageColor} roughness={0.8} />
      </mesh>
    </group>
  );
}

function TropicalTree({ position, scale = 1 }: { position: [number, number, number]; scale?: number }) {
  return (
    <group position={position} scale={scale}>
      {/* Curved trunk */}
      <mesh position={[0, 2, 0]} rotation={[0, 0, 0.15]}>
        <cylinderGeometry args={[0.12, 0.18, 4, 8]} />
        <meshStandardMaterial color="#8B7355" roughness={0.9} />
      </mesh>
      {/* Palm fronds */}
      {[0, 1.2, 2.4, 3.6, 4.8].map((r, i) => (
        <mesh key={i} position={[Math.cos(r) * 0.8, 4.2, Math.sin(r) * 0.8]} rotation={[0.8, r, 0]}>
          <boxGeometry args={[0.6, 0.05, 2.5]} />
          <meshStandardMaterial color="#228B22" roughness={0.8} />
        </mesh>
      ))}
    </group>
  );
}

function Bush({ position, scale = 1, color = '#3d7a2e' }: { position: [number, number, number]; scale?: number; color?: string }) {
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 0.4, 0]}>
        <sphereGeometry args={[0.6, 8, 8]} />
        <meshStandardMaterial color={color} roughness={0.9} />
      </mesh>
      <mesh position={[0.4, 0.3, 0.2]}>
        <sphereGeometry args={[0.45, 8, 8]} />
        <meshStandardMaterial color={color} roughness={0.9} />
      </mesh>
    </group>
  );
}

function Rock({ position, scale = 1, color = '#7a7a72' }: { position: [number, number, number]; scale?: number; color?: string }) {
  return (
    <mesh position={position} scale={scale}>
      <dodecahedronGeometry args={[0.5, 0]} />
      <meshStandardMaterial color={color} roughness={0.95} metalness={0.05} />
    </mesh>
  );
}

function GrassPatch({ position, color = '#5aa840' }: { position: [number, number, number]; color?: string }) {
  return (
    <group position={position}>
      {[0, 0.3, -0.2, 0.15, -0.1].map((offset, i) => (
        <mesh key={i} position={[offset, 0.25, offset * 0.5]} rotation={[0, i * 1.2, 0.1]}>
          <boxGeometry args={[0.03, 0.5, 0.03]} />
          <meshStandardMaterial color={color} roughness={1} />
        </mesh>
      ))}
    </group>
  );
}

function Reeds({ position, scale = 1 }: { position: [number, number, number]; scale?: number }) {
  return (
    <group position={position} scale={scale}>
      {[0, 0.15, -0.1, 0.25, -0.2, 0.08].map((offset, i) => (
        <mesh key={i} position={[offset, 0.6, offset * 0.3]} rotation={[0.05 * i, i * 0.8, 0.03 * i]}>
          <cylinderGeometry args={[0.015, 0.02, 1.2, 4]} />
          <meshStandardMaterial color="#8B7D3C" roughness={1} />
        </mesh>
      ))}
    </group>
  );
}

/* ══════════════════════════════════════════════════════════
   OCEAN SCENE — open water, no banks, distant horizon
   ══════════════════════════════════════════════════════════ */
function OceanScene() {
  return (
    <group>
      {/* Distant waves / foam lines */}
      {[-30, -15, 15, 30].map((z, i) => (
        <mesh key={i} position={[0, -0.35, z]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[120, 0.3]} />
          <meshStandardMaterial color="#ffffff" transparent opacity={0.15} />
        </mesh>
      ))}
      {/* Scattered rocks (distant reef hints) */}
      <Rock position={[-25, -0.2, -35]} scale={2} color="#4a5568" />
      <Rock position={[30, -0.3, -40]} scale={1.5} color="#4a5568" />
      <Rock position={[18, -0.4, -50]} scale={2.5} color="#3d4a5c" />
    </group>
  );
}

/* ══════════════════════════════════════════════════════════
   RIVER SCENE — narrow channel, two banks with vegetation
   ══════════════════════════════════════════════════════════ */
function RiverTerrain() {
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(80, 100, 40, 50);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const distFromCenter = Math.abs(x);
      // River channel is ~9 wide, banks rise on sides
      if (distFromCenter < 9) {
        pos.setZ(i, -0.7);
      } else {
        const bankDist = distFromCenter - 9;
        pos.setZ(i, bankDist * 0.12 + Math.random() * 0.2);
      }
    }
    g.computeVertexNormals();
    return g;
  }, []);

  return (
    <mesh geometry={geo} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.6, 0]}>
      <meshStandardMaterial color="#5a6e3a" roughness={0.9} />
    </mesh>
  );
}

function RiverVegetation() {
  const items = useMemo(() => {
    const trees: { pos: [number, number, number]; s: number }[] = [];
    const bushes: { pos: [number, number, number]; s: number }[] = [];
    const reeds: { pos: [number, number, number]; s: number }[] = [];
    const grass: [number, number, number][] = [];

    // Trees along both banks
    for (let z = -40; z < 40; z += 6) {
      trees.push({ pos: [-(12 + Math.random() * 8), 0.3, z + Math.random() * 3], s: 0.9 + Math.random() * 0.6 });
      trees.push({ pos: [12 + Math.random() * 8, 0.3, z + Math.random() * 3], s: 0.9 + Math.random() * 0.6 });
    }
    // Bushes near waterline
    for (let z = -35; z < 35; z += 5) {
      bushes.push({ pos: [-(10 + Math.random() * 2), 0.1, z + Math.random() * 2], s: 0.7 + Math.random() * 0.5 });
      bushes.push({ pos: [10 + Math.random() * 2, 0.1, z + Math.random() * 2], s: 0.7 + Math.random() * 0.5 });
    }
    // Reeds at water edge
    for (let z = -30; z < 30; z += 4) {
      reeds.push({ pos: [-(9.5 + Math.random()), -0.2, z + Math.random() * 2], s: 0.8 + Math.random() * 0.4 });
      reeds.push({ pos: [9.5 + Math.random(), -0.2, z + Math.random() * 2], s: 0.8 + Math.random() * 0.4 });
    }
    // Grass patches on banks
    for (let z = -30; z < 30; z += 3) {
      grass.push([-(11 + Math.random() * 5), 0, z + Math.random() * 2]);
      grass.push([11 + Math.random() * 5, 0, z + Math.random() * 2]);
    }
    return { trees, bushes, reeds, grass };
  }, []);

  return (
    <group>
      {items.trees.map((t, i) => <TropicalTree key={`t${i}`} position={t.pos} scale={t.s} />)}
      {items.bushes.map((b, i) => <Bush key={`b${i}`} position={b.pos} scale={b.s} color="#2d5a1e" />)}
      {items.reeds.map((r, i) => <Reeds key={`r${i}`} position={r.pos} scale={r.s} />)}
      {items.grass.map((g, i) => <GrassPatch key={`g${i}`} position={g} color="#4a8a30" />)}
    </group>
  );
}

function RiverScene() {
  return (
    <group>
      <RiverTerrain />
      <RiverVegetation />
      {/* Rocks in and around river */}
      <Rock position={[-7, -0.3, -10]} scale={0.8} color="#6b705c" />
      <Rock position={[6, -0.4, 5]} scale={0.6} color="#6b705c" />
      <Rock position={[-5, -0.3, 15]} scale={1.0} color="#7a7a6a" />
      <Rock position={[8, -0.2, -20]} scale={0.7} color="#6b705c" />
      {/* Muddy banks near water */}
      <mesh position={[-9.5, -0.55, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[1.5, 80]} />
        <meshStandardMaterial color="#6d5c3a" roughness={1} />
      </mesh>
      <mesh position={[9.5, -0.55, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[1.5, 80]} />
        <meshStandardMaterial color="#6d5c3a" roughness={1} />
      </mesh>
    </group>
  );
}

/* ══════════════════════════════════════════════════════════
   LAKE SCENE — surrounded by terrain, mountains, calm
   ══════════════════════════════════════════════════════════ */
function LakeTerrain() {
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(100, 100, 50, 50);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const dist = Math.sqrt(x * x + y * y);
      if (dist < 20) {
        pos.setZ(i, -0.7);
      } else {
        const bankDist = dist - 20;
        const height = bankDist * 0.08 + Math.sin(Math.atan2(y, x) * 3) * bankDist * 0.02 + Math.random() * 0.15;
        pos.setZ(i, Math.max(height, -0.5));
      }
    }
    g.computeVertexNormals();
    return g;
  }, []);

  return (
    <mesh geometry={geo} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.6, 0]}>
      <meshStandardMaterial color="#4a7c3f" roughness={0.9} />
    </mesh>
  );
}

function Mountains() {
  return (
    <group>
      {/* Background mountains */}
      <mesh position={[-20, 3, -45]}>
        <coneGeometry args={[12, 14, 6]} />
        <meshStandardMaterial color="#5a6a5a" roughness={0.9} />
      </mesh>
      <mesh position={[5, 4, -50]}>
        <coneGeometry args={[15, 18, 6]} />
        <meshStandardMaterial color="#4a5a4a" roughness={0.9} />
      </mesh>
      <mesh position={[30, 2.5, -42]}>
        <coneGeometry args={[10, 12, 5]} />
        <meshStandardMaterial color="#6a7a6a" roughness={0.9} />
      </mesh>
      {/* Snow caps */}
      <mesh position={[5, 11, -50]}>
        <coneGeometry args={[5, 4, 6]} />
        <meshStandardMaterial color="#e8e8e8" roughness={0.5} />
      </mesh>
      <mesh position={[-20, 8.5, -45]}>
        <coneGeometry args={[4, 3, 6]} />
        <meshStandardMaterial color="#e8e8e8" roughness={0.5} />
      </mesh>
    </group>
  );
}

function LakeVegetation() {
  const items = useMemo(() => {
    const trees: { pos: [number, number, number]; s: number }[] = [];
    const bushes: { pos: [number, number, number]; s: number }[] = [];
    const reeds: { pos: [number, number, number]; s: number }[] = [];
    const rocks: { pos: [number, number, number]; s: number }[] = [];

    // Trees around the lake perimeter
    for (let angle = 0; angle < Math.PI * 2; angle += 0.35) {
      const r = 22 + Math.random() * 8;
      trees.push({
        pos: [Math.cos(angle) * r, 0.3, Math.sin(angle) * r],
        s: 0.8 + Math.random() * 0.7
      });
    }
    // Bushes closer to shore
    for (let angle = 0; angle < Math.PI * 2; angle += 0.5) {
      const r = 20 + Math.random() * 3;
      bushes.push({
        pos: [Math.cos(angle) * r, 0.1, Math.sin(angle) * r],
        s: 0.6 + Math.random() * 0.6
      });
    }
    // Reeds at water's edge
    for (let angle = 0; angle < Math.PI * 2; angle += 0.6) {
      const r = 19.5 + Math.random() * 1;
      reeds.push({
        pos: [Math.cos(angle) * r, -0.2, Math.sin(angle) * r],
        s: 0.7 + Math.random() * 0.5
      });
    }
    // Rocks on shore
    for (let angle = 0; angle < Math.PI * 2; angle += 0.8) {
      const r = 20 + Math.random() * 5;
      rocks.push({
        pos: [Math.cos(angle) * r, -0.1, Math.sin(angle) * r],
        s: 0.5 + Math.random() * 0.8
      });
    }

    return { trees, bushes, reeds, rocks };
  }, []);

  return (
    <group>
      {items.trees.map((t, i) => <Tree key={`t${i}`} position={t.pos} scale={t.s} foliageColor="#1a5c10" />)}
      {items.bushes.map((b, i) => <Bush key={`b${i}`} position={b.pos} scale={b.s} color="#2a6a1a" />)}
      {items.reeds.map((r, i) => <Reeds key={`r${i}`} position={r.pos} scale={r.s} />)}
      {items.rocks.map((r, i) => <Rock key={`r${i}`} position={r.pos} scale={r.s} color="#8a8a7a" />)}
    </group>
  );
}

function LakeScene() {
  return (
    <group>
      <LakeTerrain />
      <Mountains />
      <LakeVegetation />
    </group>
  );
}

/* ══════════════════════════════════════════════════════════
   MAIN SCENE
   ══════════════════════════════════════════════════════════ */

function SceneEnvironment({ locationType }: { locationType: LocationType }) {
  switch (locationType) {
    case 'ocean': return <OceanScene />;
    case 'river': return <RiverScene />;
    case 'lake': return <LakeScene />;
  }
}

function getCameraConfig(locationType: LocationType) {
  switch (locationType) {
    case 'ocean': return { position: [0, 5, 15] as [number, number, number], target: [0, -1, -10] as [number, number, number], minDist: 8, maxDist: 30 };
    case 'river': return { position: [8, 5, 10] as [number, number, number], target: [0, -1, -5] as [number, number, number], minDist: 6, maxDist: 20 };
    case 'lake': return { position: [0, 6, 14] as [number, number, number], target: [0, -1, -5] as [number, number, number], minDist: 8, maxDist: 25 };
  }
}

function getSkyConfig(locationType: LocationType) {
  switch (locationType) {
    case 'ocean': return { sunPosition: [100, 30, 80] as [number, number, number], turbidity: 10, rayleigh: 3 };
    case 'river': return { sunPosition: [80, 50, 60] as [number, number, number], turbidity: 6, rayleigh: 1.5 };
    case 'lake': return { sunPosition: [100, 40, 70] as [number, number, number], turbidity: 4, rayleigh: 1 };
  }
}

function getFogConfig(locationType: LocationType): [string, number, number] {
  switch (locationType) {
    case 'ocean': return ['#8fb8d8', 30, 100];
    case 'river': return ['#a8c8a0', 35, 80];
    case 'lake': return ['#b8d4e8', 40, 90];
  }
}

interface Props {
  location: FishingLocation;
  bobberVisible: boolean;
  bobberPosition: [number, number, number];
  onWaterClick: (point: THREE.Vector3) => void;
}

export function FishingScene3D({ location, bobberVisible, bobberPosition, onWaterClick }: Props) {
  const cam = getCameraConfig(location.type);
  const sky = getSkyConfig(location.type);
  const fog = getFogConfig(location.type);

  const clickPlaneSize = location.type === 'ocean' ? 120 : location.type === 'river' ? [18, 80] : 40;

  return (
    <Canvas
      camera={{ position: cam.position, fov: 55 }}
      style={{ position: 'absolute', inset: 0 }}
      shadows
    >
      <Sky sunPosition={sky.sunPosition} turbidity={sky.turbidity} rayleigh={sky.rayleigh} />
      <fog attach="fog" args={fog} />
      <ambientLight intensity={0.5} color={location.ambientColor} />
      <directionalLight position={[10, 15, 5]} intensity={1.3} castShadow shadow-mapSize={1024} />
      <pointLight position={[-10, 5, -10]} intensity={0.3} color="#ffd700" />
      <hemisphereLight args={['#87ceeb', '#4a7c3f', 0.4]} />

      <Water color={location.waterColor} locationType={location.type} />
      <SceneEnvironment locationType={location.type} />

      {/* Clickable plane for casting */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.3, 0]}
        onClick={(e) => { e.stopPropagation(); onWaterClick(e.point); }}
      >
        <planeGeometry args={Array.isArray(clickPlaneSize) ? clickPlaneSize : [clickPlaneSize, clickPlaneSize]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>

      <FishingBobber visible={bobberVisible} position={bobberPosition} />

      <OrbitControls
        maxPolarAngle={Math.PI / 2.3}
        minPolarAngle={Math.PI / 6}
        enablePan={false}
        minDistance={cam.minDist}
        maxDistance={cam.maxDist}
        target={cam.target}
      />
    </Canvas>
  );
}
