// @ts-nocheck
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Sky } from '@react-three/drei';
import { useRef, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { FishingLocation, LocationType } from '@/game/types';
import OceanScene from './scene/OceanScene';
import RiverScene from './scene/RiverScene';
import LakeScene from './scene/LakeScene';

/* ═══════ WATER ═══════ */
function Water({ color, locationType }: { color: string; locationType: LocationType }) {
  const meshRef = useRef<THREE.Mesh>(null);

  const { width, depth, segsW, segsD } = useMemo(() => {
    switch (locationType) {
      case 'river': return { width: 18, depth: 100, segsW: 35, segsD: 140 };
      case 'lake': return { width: 42, depth: 42, segsW: 70, segsD: 70 };
      case 'ocean': return { width: 140, depth: 140, segsW: 110, segsD: 110 };
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
        pos.setZ(i,
          Math.sin(x * 0.12 + t * 0.5) * 0.7 +
          Math.cos(y * 0.1 + t * 0.35) * 0.5 +
          Math.sin((x + y) * 0.07 + t * 0.8) * 0.35 +
          Math.cos(x * 0.25 + t * 1.2) * 0.15
        );
      } else if (locationType === 'river') {
        pos.setZ(i,
          Math.sin(y * 0.25 + t * 1.8) * 0.1 +
          Math.cos(x * 0.6 + t * 0.6) * 0.05 +
          Math.sin(y * 0.08 + t * 0.4) * 0.07 +
          Math.sin((x * 0.5 + y * 0.15) + t * 1.0) * 0.04
        );
      } else {
        pos.setZ(i,
          Math.sin(x * 0.25 + t * 0.4) * 0.06 +
          Math.cos(y * 0.3 + t * 0.35) * 0.05 +
          Math.sin((x * x + y * y) * 0.003 + t * 0.25) * 0.03 +
          Math.cos(x * 0.5 + y * 0.5 + t * 0.6) * 0.02
        );
      }
    }
    pos.needsUpdate = true;
  });

  return (
    <mesh ref={meshRef} geometry={geo} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.5, 0]}>
      <meshPhysicalMaterial
        color={color}
        transparent
        opacity={locationType === 'ocean' ? 0.82 : locationType === 'lake' ? 0.88 : 0.85}
        roughness={locationType === 'lake' ? 0.05 : locationType === 'ocean' ? 0.15 : 0.12}
        metalness={0.3}
        clearcoat={0.3}
        clearcoatRoughness={0.2}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

/* ═══════ BOBBER ═══════ */
function FishingBobber({ visible, position }: { visible: boolean; position: [number, number, number] }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!ref.current || !visible) return;
    const t = clock.getElapsedTime();
    ref.current.position.y = position[1] + Math.sin(t * 2) * 0.12 + Math.cos(t * 3.1) * 0.05;
    ref.current.rotation.z = Math.sin(t * 1.5) * 0.08;
  });
  if (!visible) return null;
  return (
    <group ref={ref} position={position}>
      <mesh position={[0, 0.15, 0]}>
        <sphereGeometry args={[0.18, 16, 16]} />
        <meshStandardMaterial color="#e03030" roughness={0.4} />
      </mesh>
      <mesh position={[0, 0, 0]}>
        <sphereGeometry args={[0.12, 12, 12]} />
        <meshStandardMaterial color="#ffffff" roughness={0.3} />
      </mesh>
      <mesh position={[0, 0.4, 0]}>
        <cylinderGeometry args={[0.015, 0.015, 0.4]} />
        <meshStandardMaterial color="#dddddd" />
      </mesh>
      <mesh position={[0, -0.25, 0]}>
        <cylinderGeometry args={[0.006, 0.006, 0.6]} />
        <meshStandardMaterial color="#aaaaaa" transparent opacity={0.5} />
      </mesh>
    </group>
  );
}

/* ═══════ FISHING ROD (follows camera) ═══════ */
function FishingRod() {
  const ref = useRef<THREE.Group>(null);
  const tipRef = useRef<THREE.Group>(null);
  const { camera } = useThree();

  useFrame(({ clock }) => {
    if (!ref.current) return;
    // Position rod relative to camera (lower-right of view)
    const offset = new THREE.Vector3(0.8, -0.6, -1.5);
    offset.applyQuaternion(camera.quaternion);
    ref.current.position.copy(camera.position).add(offset);

    // Rod points forward-ish with slight angle
    ref.current.quaternion.copy(camera.quaternion);
    ref.current.rotateX(-0.3);
    ref.current.rotateY(0.15);
    ref.current.rotateZ(0.05);

    // Subtle idle sway
    const t = clock.getElapsedTime();
    ref.current.rotateZ(Math.sin(t * 1.2) * 0.008);
    ref.current.rotateX(Math.sin(t * 0.9) * 0.005);
  });

  return (
    <group ref={ref}>
      {/* Handle / grip - cork */}
      <mesh position={[0, 0, 0.35]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.025, 0.03, 0.7, 8]} />
        <meshStandardMaterial color="#c4a066" roughness={0.9} />
      </mesh>
      {/* Handle grip rings */}
      {[0.1, 0.2, 0.3, 0.55, 0.65].map((z, i) => (
        <mesh key={i} position={[0, 0, 0.35 - z * 0.7 + 0.35]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.028, 0.004, 6, 12]} />
          <meshStandardMaterial color="#333333" metalness={0.6} roughness={0.4} />
        </mesh>
      ))}
      {/* Reel seat */}
      <mesh position={[0, -0.03, 0.25]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.035, 0.035, 0.12, 8]} />
        <meshStandardMaterial color="#444444" metalness={0.7} roughness={0.3} />
      </mesh>
      {/* Reel body */}
      <group position={[0, -0.06, 0.25]}>
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.04, 0.04, 0.06, 12]} />
          <meshStandardMaterial color="#555555" metalness={0.8} roughness={0.2} />
        </mesh>
        {/* Reel handle */}
        <mesh position={[0.05, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.005, 0.005, 0.04, 6]} />
          <meshStandardMaterial color="#777777" metalness={0.7} />
        </mesh>
        <mesh position={[0.07, 0, 0]}>
          <sphereGeometry args={[0.012, 6, 6]} />
          <meshStandardMaterial color="#222222" roughness={0.5} />
        </mesh>
      </group>
      {/* Rod sections (increasingly thinner) */}
      <mesh position={[0, 0, -0.35]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.018, 0.022, 1.0, 8]} />
        <meshStandardMaterial color="#1a1a2e" roughness={0.4} metalness={0.2} />
      </mesh>
      <mesh position={[0, 0, -1.1]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.012, 0.018, 0.9, 8]} />
        <meshStandardMaterial color="#1a1a2e" roughness={0.4} metalness={0.2} />
      </mesh>
      <mesh position={[0, 0, -1.75]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.006, 0.012, 0.8, 6]} />
        <meshStandardMaterial color="#222240" roughness={0.35} metalness={0.3} />
      </mesh>
      {/* Rod tip */}
      <group ref={tipRef}>
        <mesh position={[0, 0, -2.25]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.003, 0.006, 0.5, 6]} />
          <meshStandardMaterial color="#333355" roughness={0.3} metalness={0.4} />
        </mesh>
        {/* Tip ring */}
        <mesh position={[0, 0, -2.5]}>
          <torusGeometry args={[0.008, 0.002, 6, 8]} />
          <meshStandardMaterial color="#888888" metalness={0.8} roughness={0.2} />
        </mesh>
      </group>
      {/* Guide rings along the rod */}
      {[-0.1, -0.55, -1.0, -1.45, -1.9].map((z, i) => (
        <mesh key={i} position={[0, 0.02, z]}>
          <torusGeometry args={[0.01 - i * 0.001, 0.002, 6, 8]} />
          <meshStandardMaterial color="#999999" metalness={0.7} roughness={0.3} />
        </mesh>
      ))}
    </group>
  );
}



/* ═══════ SCENE CONFIGS ═══════ */

function SceneEnvironment({ locationType }: { locationType: LocationType }) {
  switch (locationType) {
    case 'ocean': return <OceanScene />;
    case 'river': return <RiverScene />;
    case 'lake': return <LakeScene />;
  }
}

function getCameraConfig(locationType: LocationType) {
  switch (locationType) {
    case 'ocean': return { position: [0, 4, 14] as [number, number, number], target: [0, -1, -12] as [number, number, number], minDist: 8, maxDist: 30 };
    case 'river': return { position: [7, 4, 10] as [number, number, number], target: [0, -1, -5] as [number, number, number], minDist: 5, maxDist: 18 };
    case 'lake': return { position: [0, 5, 14] as [number, number, number], target: [0, -1, -5] as [number, number, number], minDist: 7, maxDist: 24 };
  }
}

function getSkyConfig(locationType: LocationType) {
  switch (locationType) {
    case 'ocean': return { sunPosition: [100, 25, 80] as [number, number, number], turbidity: 10, rayleigh: 3.5 };
    case 'river': return { sunPosition: [60, 45, 50] as [number, number, number], turbidity: 5, rayleigh: 1.2 };
    case 'lake': return { sunPosition: [80, 35, 60] as [number, number, number], turbidity: 3, rayleigh: 0.8 };
  }
}

function getFogConfig(locationType: LocationType): [string, number, number] {
  switch (locationType) {
    case 'ocean': return ['#7ab0d0', 25, 90];
    case 'river': return ['#8ab890', 30, 70];
    case 'lake': return ['#a0c0d8', 35, 85];
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

  const clickPlaneSize = location.type === 'ocean' ? 140 : location.type === 'river' ? [18, 100] : 42;

  return (
    <Canvas
      camera={{ position: cam.position, fov: 55 }}
      style={{ position: 'absolute', inset: 0 }}
      shadows
    >
      <Sky sunPosition={sky.sunPosition} turbidity={sky.turbidity} rayleigh={sky.rayleigh} />
      <fog attach="fog" args={fog} />

      <ambientLight intensity={0.4} color={location.ambientColor} />
      <directionalLight
        position={[15, 20, 8]}
        intensity={1.4}
        castShadow
        shadow-mapSize={2048}
        shadow-camera-far={80}
        shadow-camera-left={-30}
        shadow-camera-right={30}
        shadow-camera-top={30}
        shadow-camera-bottom={-30}
      />
      <pointLight position={[-15, 8, -15]} intensity={0.25} color="#ffeedd" />
      <hemisphereLight args={['#87ceeb', '#3a6a2f', 0.5]} />
      <pointLight position={[0, 3, 10]} intensity={0.15} color="#ffcc88" />

      <Water color={location.waterColor} locationType={location.type} />
      <SceneEnvironment locationType={location.type} />

      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.3, 0]}
        onClick={(e) => { e.stopPropagation(); onWaterClick(e.point); }}
      >
        <planeGeometry args={Array.isArray(clickPlaneSize) ? clickPlaneSize : [clickPlaneSize, clickPlaneSize]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>

      <FishingBobber visible={bobberVisible} position={bobberPosition} />
      <FishingRod />

      <OrbitControls
        maxPolarAngle={Math.PI / 2.2}
        minPolarAngle={Math.PI / 7}
        enablePan={false}
        minDistance={cam.minDist}
        maxDistance={cam.maxDist}
        target={cam.target}
      />
    </Canvas>
  );
}
