// @ts-nocheck
import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

/* ═══════ Animated Tree with swaying ═══════ */
export function Tree({ position, scale = 1, trunkColor = '#4a3520', foliageColors = ['#1a5c10', '#247018', '#2d8a1e'] }: {
  position: [number, number, number]; scale?: number; trunkColor?: string; foliageColors?: string[];
}) {
  const ref = useRef<THREE.Group>(null);
  const swayOffset = useMemo(() => Math.random() * Math.PI * 2, []);

  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.rotation.z = Math.sin(clock.getElapsedTime() * 0.5 + swayOffset) * 0.015;
  });

  return (
    <group ref={ref} position={position} scale={scale}>
      <mesh position={[0, 1.2, 0]}>
        <cylinderGeometry args={[0.1, 0.18, 2.4, 6]} />
        <meshStandardMaterial color={trunkColor} roughness={0.95} />
      </mesh>
      {/* Layered foliage for depth */}
      <mesh position={[0, 2.6, 0]}>
        <sphereGeometry args={[1.1, 8, 6]} />
        <meshStandardMaterial color={foliageColors[0]} roughness={0.85} />
      </mesh>
      <mesh position={[0.3, 3.2, 0.2]}>
        <sphereGeometry args={[0.85, 8, 6]} />
        <meshStandardMaterial color={foliageColors[1]} roughness={0.85} />
      </mesh>
      <mesh position={[-0.2, 3.6, -0.1]}>
        <sphereGeometry args={[0.65, 8, 6]} />
        <meshStandardMaterial color={foliageColors[2]} roughness={0.85} />
      </mesh>
    </group>
  );
}

/* ═══════ Pine Tree (conifer) ═══════ */
export function PineTree({ position, scale = 1 }: { position: [number, number, number]; scale?: number }) {
  const ref = useRef<THREE.Group>(null);
  const swayOffset = useMemo(() => Math.random() * Math.PI * 2, []);

  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.rotation.z = Math.sin(clock.getElapsedTime() * 0.4 + swayOffset) * 0.01;
  });

  return (
    <group ref={ref} position={position} scale={scale}>
      <mesh position={[0, 1.5, 0]}>
        <cylinderGeometry args={[0.08, 0.14, 3, 6]} />
        <meshStandardMaterial color="#3d2b1a" roughness={0.95} />
      </mesh>
      <mesh position={[0, 3.2, 0]}>
        <coneGeometry args={[1.4, 2.2, 8]} />
        <meshStandardMaterial color="#1a4a10" roughness={0.85} />
      </mesh>
      <mesh position={[0, 4.2, 0]}>
        <coneGeometry args={[1.0, 1.8, 8]} />
        <meshStandardMaterial color="#1f5a14" roughness={0.85} />
      </mesh>
      <mesh position={[0, 5.0, 0]}>
        <coneGeometry args={[0.65, 1.4, 7]} />
        <meshStandardMaterial color="#257018" roughness={0.85} />
      </mesh>
    </group>
  );
}

/* ═══════ Tropical Palm ═══════ */
export function PalmTree({ position, scale = 1 }: { position: [number, number, number]; scale?: number }) {
  const ref = useRef<THREE.Group>(null);
  const swayOffset = useMemo(() => Math.random() * Math.PI * 2, []);

  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.getElapsedTime();
    ref.current.rotation.z = Math.sin(t * 0.6 + swayOffset) * 0.03;
    ref.current.rotation.x = Math.cos(t * 0.4 + swayOffset) * 0.015;
  });

  return (
    <group ref={ref} position={position} scale={scale}>
      {/* Curved segmented trunk */}
      <mesh position={[0, 1, 0.1]} rotation={[0.05, 0, 0.08]}>
        <cylinderGeometry args={[0.14, 0.2, 2, 8]} />
        <meshStandardMaterial color="#7a6040" roughness={0.95} />
      </mesh>
      <mesh position={[0.1, 2.8, 0.2]} rotation={[0.03, 0, 0.1]}>
        <cylinderGeometry args={[0.11, 0.14, 2, 8]} />
        <meshStandardMaterial color="#8a7050" roughness={0.95} />
      </mesh>
      <mesh position={[0.15, 4.2, 0.25]} rotation={[0.02, 0, 0.05]}>
        <cylinderGeometry args={[0.09, 0.11, 1.5, 8]} />
        <meshStandardMaterial color="#8a7050" roughness={0.95} />
      </mesh>
      {/* Coconuts */}
      <mesh position={[0.15, 4.8, 0.25]}>
        <sphereGeometry args={[0.12, 8, 8]} />
        <meshStandardMaterial color="#5a4020" roughness={0.9} />
      </mesh>
      {/* Palm fronds - drooping leaves */}
      {[0, 1.0, 2.0, 3.0, 4.0, 5.0].map((r, i) => (
        <group key={i} position={[0.15, 5.0, 0.25]} rotation={[0.6 + Math.sin(i) * 0.2, r, 0]}>
          <mesh position={[0, 0, 1.2]}>
            <boxGeometry args={[0.4, 0.03, 2.4]} />
            <meshStandardMaterial color={i % 2 === 0 ? '#1a6a10' : '#228B22'} roughness={0.8} side={THREE.DoubleSide} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/* ═══════ Bush with volume ═══════ */
export function Bush({ position, scale = 1, color = '#2a6a1a' }: {
  position: [number, number, number]; scale?: number; color?: string;
}) {
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 0.35, 0]}>
        <sphereGeometry args={[0.55, 8, 6]} />
        <meshStandardMaterial color={color} roughness={0.9} />
      </mesh>
      <mesh position={[0.35, 0.28, 0.15]}>
        <sphereGeometry args={[0.4, 8, 6]} />
        <meshStandardMaterial color={color} roughness={0.9} />
      </mesh>
      <mesh position={[-0.25, 0.3, -0.15]}>
        <sphereGeometry args={[0.42, 8, 6]} />
        <meshStandardMaterial color={color} roughness={0.9} />
      </mesh>
    </group>
  );
}

/* ═══════ Rock with variation ═══════ */
export function Rock({ position, scale = 1, color = '#6a6a62' }: {
  position: [number, number, number]; scale?: number; color?: string;
}) {
  return (
    <group position={position} scale={scale}>
      <mesh rotation={[0.2, 0.5, 0.1]}>
        <dodecahedronGeometry args={[0.5, 1]} />
        <meshStandardMaterial color={color} roughness={0.95} metalness={0.02} />
      </mesh>
    </group>
  );
}

/* ═══════ Animated Reeds ═══════ */
export function Reeds({ position, scale = 1 }: { position: [number, number, number]; scale?: number }) {
  const ref = useRef<THREE.Group>(null);
  const offset = useMemo(() => Math.random() * Math.PI * 2, []);

  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.rotation.z = Math.sin(clock.getElapsedTime() * 0.8 + offset) * 0.06;
  });

  return (
    <group ref={ref} position={position} scale={scale}>
      {[0, 0.12, -0.08, 0.2, -0.15, 0.06, -0.05].map((off, i) => (
        <mesh key={i} position={[off, 0.5 + i * 0.05, off * 0.4]} rotation={[0.04 * i, i * 0.9, 0.02 * i]}>
          <cylinderGeometry args={[0.012, 0.018, 1.0 + Math.random() * 0.4, 4]} />
          <meshStandardMaterial color={i % 2 === 0 ? '#7a6e30' : '#8a7e3a'} roughness={1} />
        </mesh>
      ))}
      {/* Reed head/tip */}
      <mesh position={[0, 1.1, 0]}>
        <cylinderGeometry args={[0.04, 0.02, 0.2, 6]} />
        <meshStandardMaterial color="#a09050" roughness={0.9} />
      </mesh>
    </group>
  );
}

/* ═══════ Grass tuft ═══════ */
export function GrassPatch({ position, color = '#4a8a30' }: { position: [number, number, number]; color?: string }) {
  const ref = useRef<THREE.Group>(null);
  const offset = useMemo(() => Math.random() * Math.PI * 2, []);

  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.rotation.z = Math.sin(clock.getElapsedTime() * 1.2 + offset) * 0.04;
  });

  return (
    <group ref={ref} position={position}>
      {[0, 0.15, -0.12, 0.08, -0.06, 0.2, -0.18].map((off, i) => (
        <mesh key={i} position={[off, 0.2, off * 0.6]} rotation={[0, i * 0.9, 0.08 + i * 0.02]}>
          <boxGeometry args={[0.025, 0.4 + Math.random() * 0.15, 0.015]} />
          <meshStandardMaterial color={color} roughness={1} />
        </mesh>
      ))}
    </group>
  );
}

/* ═══════ Floating cloud ═══════ */
export function Cloud({ position, scale = 1, speed = 0.3 }: {
  position: [number, number, number]; scale?: number; speed?: number;
}) {
  const ref = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.position.x = position[0] + Math.sin(clock.getElapsedTime() * speed * 0.1) * 5;
    ref.current.position.x += clock.getElapsedTime() * speed * 0.3;
    // Reset position when too far
    if (ref.current.position.x > 80) ref.current.position.x = -80;
  });

  return (
    <group ref={ref} position={position} scale={scale}>
      <mesh>
        <sphereGeometry args={[2, 8, 6]} />
        <meshStandardMaterial color="#ffffff" transparent opacity={0.85} roughness={1} />
      </mesh>
      <mesh position={[2, -0.3, 0]}>
        <sphereGeometry args={[2.5, 8, 6]} />
        <meshStandardMaterial color="#ffffff" transparent opacity={0.8} roughness={1} />
      </mesh>
      <mesh position={[-1.5, -0.2, 0.5]}>
        <sphereGeometry args={[1.8, 8, 6]} />
        <meshStandardMaterial color="#f8f8f8" transparent opacity={0.8} roughness={1} />
      </mesh>
      <mesh position={[1, 0.5, -0.3]}>
        <sphereGeometry args={[1.5, 8, 6]} />
        <meshStandardMaterial color="#ffffff" transparent opacity={0.75} roughness={1} />
      </mesh>
    </group>
  );
}

/* ═══════ Realistic Seagull ═══════ */
export function Bird({ position, speed = 1 }: { position: [number, number, number]; speed?: number }) {
  const ref = useRef<THREE.Group>(null);
  const leftWingRef = useRef<THREE.Group>(null);
  const rightWingRef = useRef<THREE.Group>(null);
  const leftTipRef = useRef<THREE.Group>(null);
  const rightTipRef = useRef<THREE.Group>(null);
  const offset = useMemo(() => Math.random() * Math.PI * 2, []);
  const radius = useMemo(() => 8 + Math.random() * 15, []);
  const glidePhase = useMemo(() => Math.random() * Math.PI * 2, []);
  const birdScale = useMemo(() => 0.9 + Math.random() * 0.4, []);

  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.getElapsedTime() * speed * 0.25 + offset;
    // Figure-8 flight path for more natural movement
    ref.current.position.x = position[0] + Math.cos(t) * radius;
    ref.current.position.z = position[2] + Math.sin(t * 2) * radius * 0.5;
    ref.current.position.y = position[1] + Math.sin(t * 1.5) * 0.8 + Math.sin(t * 0.5) * 0.4;
    // Face direction of movement
    const dx = -Math.sin(t) * radius;
    const dz = Math.cos(t * 2) * radius;
    ref.current.rotation.y = Math.atan2(dx, dz);
    // Banking on turns
    ref.current.rotation.z = Math.cos(t) * 0.2;
    // Slight pitch
    ref.current.rotation.x = Math.sin(t * 1.5) * 0.05;

    const elapsed = clock.getElapsedTime();
    // Alternating flap and glide phases
    const glide = Math.sin(elapsed * 0.6 + glidePhase);
    const isGliding = glide > 0.2;
    const flapIntensity = isGliding ? 0.03 : 0.5;
    const flapSpeed = isGliding ? 1.5 : 9;
    const wingAngle = Math.sin(elapsed * flapSpeed + offset) * flapIntensity;
    // Wingtip flex (secondary feathers bend more)
    const tipAngle = Math.sin(elapsed * flapSpeed * 1.2 + offset) * flapIntensity * 0.6;

    if (leftWingRef.current) {
      leftWingRef.current.rotation.z = wingAngle + (isGliding ? 0.15 : 0.08);
    }
    if (rightWingRef.current) {
      rightWingRef.current.rotation.z = -wingAngle - (isGliding ? 0.15 : 0.08);
    }
    if (leftTipRef.current) {
      leftTipRef.current.rotation.z = tipAngle + 0.1;
    }
    if (rightTipRef.current) {
      rightTipRef.current.rotation.z = -tipAngle - 0.1;
    }
  });

  return (
    <group ref={ref} position={position} scale={birdScale}>
      {/* Body - streamlined */}
      <mesh>
        <capsuleGeometry args={[0.07, 0.4, 8, 10]} />
        <meshStandardMaterial color="#f0ece6" roughness={0.65} />
      </mesh>
      {/* Breast (white, slightly bigger) */}
      <mesh position={[0, -0.02, -0.08]}>
        <sphereGeometry args={[0.075, 8, 6]} />
        <meshStandardMaterial color="#ffffff" roughness={0.6} />
      </mesh>
      {/* Head */}
      <mesh position={[0, 0.06, -0.28]}>
        <sphereGeometry args={[0.065, 8, 8]} />
        <meshStandardMaterial color="#ffffff" roughness={0.55} />
      </mesh>
      {/* Dark head marking (varies by species) */}
      <mesh position={[0, 0.09, -0.3]}>
        <sphereGeometry args={[0.04, 8, 6]} />
        <meshStandardMaterial color="#1a1a1a" roughness={0.7} />
      </mesh>
      {/* Beak - yellow with red spot */}
      <mesh position={[0, 0.03, -0.38]} rotation={[0.2, 0, 0]}>
        <coneGeometry args={[0.018, 0.14, 5]} />
        <meshStandardMaterial color="#e8a020" roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.02, -0.36]}>
        <sphereGeometry args={[0.008, 4, 4]} />
        <meshStandardMaterial color="#cc3333" roughness={0.5} />
      </mesh>
      {/* Eyes */}
      <mesh position={[0.04, 0.08, -0.29]}>
        <sphereGeometry args={[0.01, 6, 6]} />
        <meshStandardMaterial color="#ffee00" roughness={0.3} />
      </mesh>
      <mesh position={[0.041, 0.081, -0.295]}>
        <sphereGeometry args={[0.005, 4, 4]} />
        <meshStandardMaterial color="#000000" />
      </mesh>
      <mesh position={[-0.04, 0.08, -0.29]}>
        <sphereGeometry args={[0.01, 6, 6]} />
        <meshStandardMaterial color="#ffee00" roughness={0.3} />
      </mesh>
      <mesh position={[-0.041, 0.081, -0.295]}>
        <sphereGeometry args={[0.005, 4, 4]} />
        <meshStandardMaterial color="#000000" />
      </mesh>
      {/* Tail fan */}
      <mesh position={[0, 0.01, 0.28]} rotation={[-0.15, 0, 0]}>
        <boxGeometry args={[0.08, 0.012, 0.2]} />
        <meshStandardMaterial color="#e0dcd4" roughness={0.8} />
      </mesh>
      <mesh position={[0.025, 0.01, 0.3]} rotation={[-0.15, 0.1, 0]}>
        <boxGeometry args={[0.04, 0.01, 0.18]} />
        <meshStandardMaterial color="#d8d4cc" roughness={0.8} />
      </mesh>
      <mesh position={[-0.025, 0.01, 0.3]} rotation={[-0.15, -0.1, 0]}>
        <boxGeometry args={[0.04, 0.01, 0.18]} />
        <meshStandardMaterial color="#d8d4cc" roughness={0.8} />
      </mesh>
      {/* Left Wing (articulated with inner + outer + tip) */}
      <group ref={leftWingRef} position={[0.08, 0.02, 0]}>
        {/* Inner wing (shoulder) */}
        <mesh position={[0.14, 0, 0.02]}>
          <boxGeometry args={[0.28, 0.018, 0.18]} />
          <meshStandardMaterial color="#e8e4dc" roughness={0.7} />
        </mesh>
        {/* Mid wing */}
        <mesh position={[0.32, 0.005, 0.01]}>
          <boxGeometry args={[0.14, 0.014, 0.15]} />
          <meshStandardMaterial color="#d0ccc4" roughness={0.75} />
        </mesh>
        {/* Outer wing / primary feathers (dark tips) */}
        <group ref={leftTipRef} position={[0.4, 0.01, 0]}>
          <mesh position={[0.08, 0, 0.01]}>
            <boxGeometry args={[0.14, 0.01, 0.12]} />
            <meshStandardMaterial color="#1a1a1a" roughness={0.8} />
          </mesh>
          {/* Individual primary feather tips */}
          {[0, 1, 2, 3].map((i) => (
            <mesh key={i} position={[0.15, 0, -0.03 + i * 0.025]} rotation={[0, 0.05 * i, 0]}>
              <boxGeometry args={[0.06, 0.006, 0.02]} />
              <meshStandardMaterial color="#111111" roughness={0.85} />
            </mesh>
          ))}
        </group>
      </group>
      {/* Right Wing (mirrored) */}
      <group ref={rightWingRef} position={[-0.08, 0.02, 0]}>
        <mesh position={[-0.14, 0, 0.02]}>
          <boxGeometry args={[0.28, 0.018, 0.18]} />
          <meshStandardMaterial color="#e8e4dc" roughness={0.7} />
        </mesh>
        <mesh position={[-0.32, 0.005, 0.01]}>
          <boxGeometry args={[0.14, 0.014, 0.15]} />
          <meshStandardMaterial color="#d0ccc4" roughness={0.75} />
        </mesh>
        <group ref={rightTipRef} position={[-0.4, 0.01, 0]}>
          <mesh position={[-0.08, 0, 0.01]}>
            <boxGeometry args={[0.14, 0.01, 0.12]} />
            <meshStandardMaterial color="#1a1a1a" roughness={0.8} />
          </mesh>
          {[0, 1, 2, 3].map((i) => (
            <mesh key={i} position={[-0.15, 0, -0.03 + i * 0.025]} rotation={[0, -0.05 * i, 0]}>
              <boxGeometry args={[0.06, 0.006, 0.02]} />
              <meshStandardMaterial color="#111111" roughness={0.85} />
            </mesh>
          ))}
        </group>
      </group>
      {/* Feet (tucked) */}
      <mesh position={[0.025, -0.07, 0.08]}>
        <boxGeometry args={[0.008, 0.05, 0.008]} />
        <meshStandardMaterial color="#e89020" />
      </mesh>
      <mesh position={[-0.025, -0.07, 0.08]}>
        <boxGeometry args={[0.008, 0.05, 0.008]} />
        <meshStandardMaterial color="#e89020" />
      </mesh>
    </group>
  );
}

/* ═══════ Lily Pad ═══════ */
export function LilyPad({ position }: { position: [number, number, number] }) {
  const ref = useRef<THREE.Mesh>(null);
  const offset = useMemo(() => Math.random() * Math.PI * 2, []);

  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.position.y = position[1] + Math.sin(clock.getElapsedTime() * 0.5 + offset) * 0.03;
    ref.current.rotation.z = Math.sin(clock.getElapsedTime() * 0.3 + offset) * 0.02;
  });

  return (
    <group>
      <mesh ref={ref} position={position} rotation={[-Math.PI / 2, 0, offset]}>
        <circleGeometry args={[0.4 + Math.random() * 0.3, 12, 0, Math.PI * 1.85]} />
        <meshStandardMaterial color="#2a6a15" roughness={0.7} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

/* ═══════ Floating log / debris ═══════ */
export function FloatingLog({ position }: { position: [number, number, number] }) {
  const ref = useRef<THREE.Mesh>(null);
  const offset = useMemo(() => Math.random() * Math.PI * 2, []);

  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.getElapsedTime();
    ref.current.position.y = position[1] + Math.sin(t * 0.4 + offset) * 0.05;
    ref.current.rotation.z = Math.sin(t * 0.3 + offset) * 0.05;
  });

  return (
    <mesh ref={ref} position={position} rotation={[0, offset, 0]}>
      <cylinderGeometry args={[0.08, 0.1, 1.5, 6]} />
      <meshStandardMaterial color="#5a4530" roughness={0.95} />
    </mesh>
  );
}
