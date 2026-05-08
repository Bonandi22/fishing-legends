// @ts-nocheck
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Sky } from '@react-three/drei';
import { useRef, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { FishingLocation, LocationType, ROD_SKINS, RodSkin } from '@/game/types';
import OceanScene from './scene/OceanScene';
import RiverScene from './scene/RiverScene';
import LakeScene from './scene/LakeScene';
import { WeatherSystem } from './scene/WeatherSystem';

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

/* ═══════ BOBBER (realistic slip bobber) ═══════ */
function FishingBobber({ visible, position }: { visible: boolean; position: [number, number, number] }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!ref.current || !visible) return;
    const t = clock.getElapsedTime();
    // Realistic water bobbing — slow primary + fast secondary ripple
    ref.current.position.y = position[1] + Math.sin(t * 1.4) * 0.08 + Math.cos(t * 2.7) * 0.03 + Math.sin(t * 4.2) * 0.015;
    ref.current.rotation.z = Math.sin(t * 1.1) * 0.06 + Math.cos(t * 2.3) * 0.03;
    ref.current.rotation.x = Math.sin(t * 0.9) * 0.04;
  });
  if (!visible) return null;
  return (
    <group ref={ref} position={position}>
      {/* Submerged lead weight */}
      <mesh position={[0, -0.45, 0]}>
        <sphereGeometry args={[0.02, 8, 8]} />
        <meshStandardMaterial color="#555555" metalness={0.8} roughness={0.3} />
      </mesh>
      {/* Line below bobber */}
      <mesh position={[0, -0.25, 0]}>
        <cylinderGeometry args={[0.003, 0.003, 0.45]} />
        <meshStandardMaterial color="#cccccc" transparent opacity={0.4} />
      </mesh>
      {/* Lower body — white (submerged portion) */}
      <mesh position={[0, -0.02, 0]}>
        <cylinderGeometry args={[0.06, 0.09, 0.12, 16]} />
        <meshPhysicalMaterial color="#f0f0f0" roughness={0.25} clearcoat={0.6} clearcoatRoughness={0.15} />
      </mesh>
      {/* Main body — red egg shape */}
      <mesh position={[0, 0.1, 0]}>
        <sphereGeometry args={[0.11, 20, 20]} />
        <meshPhysicalMaterial color="#cc2020" roughness={0.2} clearcoat={0.8} clearcoatRoughness={0.1} metalness={0.05} />
      </mesh>
      {/* Red/white dividing band */}
      <mesh position={[0, 0.02, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.095, 0.006, 8, 20]} />
        <meshStandardMaterial color="#222222" roughness={0.5} />
      </mesh>
      {/* Top taper — red narrowing */}
      <mesh position={[0, 0.2, 0]}>
        <cylinderGeometry args={[0.025, 0.08, 0.1, 14]} />
        <meshPhysicalMaterial color="#cc2020" roughness={0.2} clearcoat={0.7} />
      </mesh>
      {/* Antenna stem — thin yellow */}
      <mesh position={[0, 0.35, 0]}>
        <cylinderGeometry args={[0.008, 0.012, 0.22, 8]} />
        <meshPhysicalMaterial color="#ffcc00" roughness={0.3} clearcoat={0.5} />
      </mesh>
      {/* Antenna tip — bright orange ball */}
      <mesh position={[0, 0.47, 0]}>
        <sphereGeometry args={[0.018, 10, 10]} />
        <meshPhysicalMaterial color="#ff6600" roughness={0.15} clearcoat={0.9} emissive="#ff4400" emissiveIntensity={0.15} />
      </mesh>
      {/* Line clip at top */}
      <mesh position={[0, 0.25, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.015, 0.004, 6, 10]} />
        <meshStandardMaterial color="#888888" metalness={0.9} roughness={0.1} />
      </mesh>
      {/* Water ring effect — subtle ring around waterline */}
      <mesh position={[0, -0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.1, 0.18, 24]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.08} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

/* ═══════ FISHING ROD (follows camera) ═══════ */
function FishingRod({ skin }: { skin: RodSkin }) {
  const ref = useRef<THREE.Group>(null);
  const { camera } = useThree();

  useFrame(({ clock }) => {
    if (!ref.current) return;
    // Anchored at the right side, pointing diagonally up-left so the blank is clearly visible
    const offset = new THREE.Vector3(0.8, 0.0, -2.0);
    offset.applyQuaternion(camera.quaternion);
    ref.current.position.copy(camera.position).add(offset);
    ref.current.quaternion.copy(camera.quaternion);
    ref.current.rotateX(-1.3);  // pitch tip strongly upward
    ref.current.rotateY(0.4);   // yaw across to the left
    ref.current.rotateZ(0.1);
    const t = clock.getElapsedTime();
    ref.current.rotateZ(Math.sin(t * 1.2) * 0.008);
    ref.current.rotateX(Math.sin(t * 0.9) * 0.005);
  });

  const emissiveColor = skin.emissive || '#000000';
  const emissiveIntensity = skin.emissive ? 0.15 : 0;

  return (
    <group ref={ref}>
      {/* Cork grip - textured with multiple segments */}
      {Array.from({ length: 12 }, (_, i) => (
        <mesh key={`cork-${i}`} position={[0, 0, 0.05 + i * 0.05]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.024 + Math.sin(i * 0.8) * 0.003, 0.024 + Math.sin((i + 1) * 0.8) * 0.003, 0.05, 12]} />
          <meshStandardMaterial color={i % 2 === 0 ? skin.gripColor : skin.gripColor} roughness={0.95} />
        </mesh>
      ))}
      {/* Cork grip rings (decorative bands) */}
      {[0.05, 0.15, 0.25, 0.35, 0.5, 0.6].map((z, i) => (
        <mesh key={`ring-${i}`} position={[0, 0, z]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.026, 0.003, 8, 16]} />
          <meshStandardMaterial color={skin.accentColor} metalness={0.7} roughness={0.3} />
        </mesh>
      ))}
      {/* Fore grip */}
      <mesh position={[0, 0, -0.05]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.022, 0.024, 0.15, 12]} />
        <meshStandardMaterial color={skin.gripColor} roughness={0.85} />
      </mesh>
      {/* Reel seat */}
      <mesh position={[0, 0, 0.08]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.028, 0.028, 0.08, 12]} />
        <meshStandardMaterial color={skin.reelColor} metalness={0.85} roughness={0.15} />
      </mesh>
      {/* Reel seat locking rings */}
      <mesh position={[0, 0, 0.04]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.029, 0.004, 8, 16]} />
        <meshStandardMaterial color={skin.accentColor} metalness={0.9} roughness={0.1} />
      </mesh>
      <mesh position={[0, 0, 0.12]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.029, 0.004, 8, 16]} />
        <meshStandardMaterial color={skin.accentColor} metalness={0.9} roughness={0.1} />
      </mesh>
      {/* Spinning reel body */}
      <group position={[0, -0.055, 0.08]}>
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.038, 0.042, 0.05, 16]} />
          <meshStandardMaterial color={skin.reelColor} metalness={0.9} roughness={0.1} />
        </mesh>
        <mesh rotation={[0, 0, Math.PI / 2]} position={[0.03, 0, 0]}>
          <cylinderGeometry args={[0.035, 0.035, 0.02, 16]} />
          <meshStandardMaterial color={skin.accentColor} metalness={0.95} roughness={0.05} />
        </mesh>
        <mesh rotation={[0, 0, Math.PI / 2]} position={[0.04, 0, 0]}>
          <cylinderGeometry args={[0.04, 0.036, 0.005, 16]} />
          <meshStandardMaterial color={skin.accentColor} metalness={0.9} roughness={0.1} />
        </mesh>
        <mesh position={[0.04, 0.02, 0]} rotation={[0.3, 0, 0.5]}>
          <cylinderGeometry args={[0.003, 0.003, 0.07, 6]} />
          <meshStandardMaterial color={skin.accentColor} metalness={0.95} roughness={0.05} />
        </mesh>
        <mesh position={[-0.04, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.004, 0.004, 0.06, 8]} />
          <meshStandardMaterial color={skin.reelColor} metalness={0.8} roughness={0.2} />
        </mesh>
        <mesh position={[-0.07, 0, 0]}>
          <capsuleGeometry args={[0.01, 0.02, 8, 8]} />
          <meshStandardMaterial color={skin.gripColor} roughness={0.6} />
        </mesh>
        <mesh rotation={[0, 0, Math.PI / 2]} position={[0.05, 0, 0]}>
          <cylinderGeometry args={[0.015, 0.015, 0.008, 12]} />
          <meshStandardMaterial color={skin.reelColor} metalness={0.7} roughness={0.3} />
        </mesh>
      </group>
      {/* Rod blank sections */}
      <mesh position={[0, 0, -0.45]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.016, 0.021, 0.85, 10]} />
        <meshStandardMaterial color={skin.rodColor} roughness={0.3} metalness={skin.metalness} emissive={emissiveColor} emissiveIntensity={emissiveIntensity} />
      </mesh>
      <mesh position={[0, 0, -1.15]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.01, 0.016, 0.85, 10]} />
        <meshStandardMaterial color={skin.rodColor} roughness={0.3} metalness={skin.metalness} emissive={emissiveColor} emissiveIntensity={emissiveIntensity} />
      </mesh>
      <mesh position={[0, 0, -1.8]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.006, 0.01, 0.75, 8]} />
        <meshStandardMaterial color={skin.rodColor} roughness={0.25} metalness={skin.metalness} emissive={emissiveColor} emissiveIntensity={emissiveIntensity * 1.2} />
      </mesh>
      <mesh position={[0, 0, -2.3]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.002, 0.006, 0.5, 6]} />
        <meshStandardMaterial color={skin.rodColor} roughness={0.2} metalness={skin.metalness} emissive={emissiveColor} emissiveIntensity={emissiveIntensity * 1.5} />
      </mesh>
      {/* Line guides */}
      {[
        { z: -0.15, r: 0.012, h: 0.025 },
        { z: -0.5, r: 0.011, h: 0.022 },
        { z: -0.85, r: 0.010, h: 0.020 },
        { z: -1.2, r: 0.008, h: 0.017 },
        { z: -1.55, r: 0.007, h: 0.015 },
        { z: -1.85, r: 0.006, h: 0.012 },
        { z: -2.1, r: 0.005, h: 0.010 },
      ].map(({ z, r, h }, i) => (
        <group key={`guide-${i}`} position={[0, 0, z]}>
          <mesh position={[0, h, 0]}>
            <torusGeometry args={[r, 0.0015, 8, 12]} />
            <meshStandardMaterial color={skin.accentColor} metalness={0.9} roughness={0.1} />
          </mesh>
          <mesh position={[0, h * 0.5, 0]}>
            <cylinderGeometry args={[0.002, 0.002, h, 4]} />
            <meshStandardMaterial color={skin.accentColor} metalness={0.8} roughness={0.2} />
          </mesh>
        </group>
      ))}
      {/* Tip-top guide */}
      <mesh position={[0, 0.008, -2.55]}>
        <torusGeometry args={[0.004, 0.0015, 6, 10]} />
        <meshStandardMaterial color={skin.accentColor} metalness={0.95} roughness={0.05} />
      </mesh>
      {/* Thread wraps */}
      {[-0.15, -0.5, -0.85, -1.2, -1.55, -1.85, -2.1].map((z, i) => (
        <mesh key={`wrap-${i}`} position={[0, 0, z]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.018 - i * 0.002, 0.018 - i * 0.002, 0.015, 10]} />
          <meshStandardMaterial color={skin.accentColor} roughness={0.5} metalness={0.1} emissive={emissiveColor} emissiveIntensity={emissiveIntensity * 0.5} />
        </mesh>
      ))}
      {/* Unique skin charm — dangles from grip area */}
      <SkinCharm skin={skin} />
    </group>
  );
}

/* ═══════ UNIQUE CHARM PER SKIN ═══════ */
function SkinCharm({ skin }: { skin: RodSkin }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.getElapsedTime();
    ref.current.rotation.z = Math.sin(t * 2) * 0.25;
    ref.current.rotation.y = Math.sin(t * 1.3) * 0.3;
  });

  // Each skin has a distinctive 3D ornament hanging from the rod butt
  const renderOrnament = () => {
    switch (skin.id) {
      case 'shark':
        // Shark tooth
        return (
          <mesh rotation={[0, 0, Math.PI]}>
            <coneGeometry args={[0.018, 0.05, 4]} />
            <meshStandardMaterial color="#f5f5f0" roughness={0.4} metalness={0.2} />
          </mesh>
        );
      case 'fish':
        // Small fish-shaped lure
        return (
          <group>
            <mesh>
              <sphereGeometry args={[0.022, 12, 8]} />
              <meshPhysicalMaterial color={skin.accentColor} metalness={0.7} roughness={0.2} clearcoat={0.8} />
            </mesh>
            <mesh position={[0, 0, 0.025]}>
              <coneGeometry args={[0.018, 0.03, 6]} />
              <meshStandardMaterial color={skin.rodColor} metalness={0.5} roughness={0.3} />
            </mesh>
            <mesh position={[0.012, 0.005, -0.01]}>
              <sphereGeometry args={[0.004, 6, 6]} />
              <meshStandardMaterial color="#ffffff" emissive="#000000" />
            </mesh>
          </group>
        );
      case 'octopus':
        // Octopus head with little tentacles
        return (
          <group>
            <mesh>
              <sphereGeometry args={[0.025, 12, 12]} />
              <meshPhysicalMaterial color={skin.color} roughness={0.3} clearcoat={0.6} />
            </mesh>
            {[0, 1, 2, 3, 4, 5].map(i => {
              const a = (i / 6) * Math.PI * 2;
              return (
                <mesh key={i} position={[Math.cos(a) * 0.018, -0.015, Math.sin(a) * 0.018]} rotation={[0.4, 0, 0]}>
                  <cylinderGeometry args={[0.003, 0.001, 0.03, 6]} />
                  <meshStandardMaterial color={skin.color} roughness={0.4} />
                </mesh>
              );
            })}
          </group>
        );
      case 'dragon':
        // Dragon claw / spiked horn
        return (
          <group>
            <mesh rotation={[0, 0, Math.PI]}>
              <coneGeometry args={[0.014, 0.06, 6]} />
              <meshPhysicalMaterial color={skin.accentColor} metalness={0.7} roughness={0.2} emissive={skin.emissive} emissiveIntensity={0.4} />
            </mesh>
            <mesh position={[0, -0.01, 0]}>
              <torusGeometry args={[0.018, 0.004, 8, 12]} />
              <meshStandardMaterial color={skin.rodColor} metalness={0.8} roughness={0.2} emissive={skin.emissive} emissiveIntensity={0.3} />
            </mesh>
          </group>
        );
      case 'phoenix':
        // Flame-shaped charm with glow
        return (
          <group>
            <mesh>
              <coneGeometry args={[0.02, 0.05, 8]} />
              <meshPhysicalMaterial color={skin.accentColor} emissive={skin.emissive} emissiveIntensity={0.8} roughness={0.3} />
            </mesh>
            <pointLight color={skin.emissive || '#ff6600'} intensity={0.4} distance={0.5} />
          </group>
        );
      case 'kraken':
        // Tentacle with suction cups + glow
        return (
          <group>
            <mesh rotation={[0.3, 0, 0]}>
              <cylinderGeometry args={[0.012, 0.005, 0.06, 8]} />
              <meshPhysicalMaterial color={skin.accentColor} emissive={skin.emissive} emissiveIntensity={0.5} roughness={0.4} />
            </mesh>
            {[0, 1, 2].map(i => (
              <mesh key={i} position={[0, -0.015 - i * 0.015, 0.005 + i * 0.005]}>
                <sphereGeometry args={[0.004, 6, 6]} />
                <meshStandardMaterial color="#ffffff" />
              </mesh>
            ))}
          </group>
        );
      case 'gold':
        // Gold coin medallion
        return (
          <group>
            <mesh rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.022, 0.022, 0.005, 24]} />
              <meshPhysicalMaterial color={skin.color} metalness={1} roughness={0.05} clearcoat={1} emissive={skin.emissive} emissiveIntensity={0.3} />
            </mesh>
            <mesh rotation={[0, 0, Math.PI / 2]} position={[0, 0, 0.003]}>
              <torusGeometry args={[0.016, 0.002, 8, 24]} />
              <meshStandardMaterial color="#fff8b0" metalness={1} roughness={0.1} />
            </mesh>
          </group>
        );
      case 'diamond':
        // Diamond gem
        return (
          <group>
            <mesh rotation={[Math.PI, 0, 0]}>
              <octahedronGeometry args={[0.025, 0]} />
              <meshPhysicalMaterial color={skin.color} metalness={0.2} roughness={0.05} clearcoat={1} clearcoatRoughness={0} transmission={0.6} thickness={0.5} ior={2.4} emissive={skin.emissive} emissiveIntensity={0.2} />
            </mesh>
            <pointLight color={skin.emissive || '#00ccff'} intensity={0.3} distance={0.4} />
          </group>
        );
      default:
        // Default: simple wooden bobber charm
        return (
          <mesh>
            <sphereGeometry args={[0.018, 10, 10]} />
            <meshStandardMaterial color="#cc2020" roughness={0.4} />
          </mesh>
        );
    }
  };

  return (
    <group position={[0, -0.04, 0.7]}>
      {/* Hanging cord */}
      <mesh position={[0, -0.025, 0]}>
        <cylinderGeometry args={[0.0015, 0.0015, 0.05, 4]} />
        <meshStandardMaterial color={skin.accentColor} roughness={0.7} />
      </mesh>
      {/* Small clip ring */}
      <mesh position={[0, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.005, 0.0015, 6, 10]} />
        <meshStandardMaterial color={skin.accentColor} metalness={0.9} roughness={0.1} />
      </mesh>
      {/* Animated ornament */}
      <group ref={ref} position={[0, -0.06, 0]}>
        {renderOrnament()}
      </group>
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
  activeSkin?: string;
}

export function FishingScene3D({ location, bobberVisible, bobberPosition, onWaterClick, activeSkin }: Props) {
  const cam = getCameraConfig(location.type);
  const sky = getSkyConfig(location.type);
  const fog = getFogConfig(location.type);
  const skin = ROD_SKINS.find(s => s.id === activeSkin) || ROD_SKINS[0];

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
      <WeatherSystem />

      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.3, 0]}
        onClick={(e) => { e.stopPropagation(); onWaterClick(e.point); }}
      >
        <planeGeometry args={Array.isArray(clickPlaneSize) ? clickPlaneSize : [clickPlaneSize, clickPlaneSize]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>

      <FishingBobber visible={bobberVisible} position={bobberPosition} />
      <FishingRod skin={skin} />

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
