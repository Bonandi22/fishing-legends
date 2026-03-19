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
  const bodyRef = useRef<THREE.Group>(null);
  const leftWingRef = useRef<THREE.Group>(null);
  const rightWingRef = useRef<THREE.Group>(null);
  const leftOuterRef = useRef<THREE.Group>(null);
  const rightOuterRef = useRef<THREE.Group>(null);
  const leftTipRef = useRef<THREE.Group>(null);
  const rightTipRef = useRef<THREE.Group>(null);
  const headRef = useRef<THREE.Group>(null);
  const tailRef = useRef<THREE.Group>(null);
  const offset = useMemo(() => Math.random() * Math.PI * 2, []);
  const radius = useMemo(() => 12 + Math.random() * 20, []);
  const heightVar = useMemo(() => Math.random() * 3, []);
  const birdScale = useMemo(() => 0.9 + Math.random() * 0.3, []);
  const flapCycle = useMemo(() => Math.random() * 10, []);
  const glideRatio = useMemo(() => 0.4 + Math.random() * 0.3, []);

  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.getElapsedTime() * speed * 0.18 + offset;

    // Smooth soaring path with thermals
    const pathX = Math.cos(t) * radius + Math.sin(t * 0.37) * 4 + Math.cos(t * 0.13) * 2;
    const pathZ = Math.sin(t * 1.6) * radius * 0.55 + Math.cos(t * 0.47) * 5;
    ref.current.position.x = position[0] + pathX;
    ref.current.position.z = position[2] + pathZ;
    // Realistic altitude: long gentle climbs in thermals, slow descents
    ref.current.position.y = position[1] + heightVar +
      Math.sin(t * 0.6) * 1.5 +
      Math.sin(t * 1.8) * 0.4 +
      Math.cos(t * 0.25) * 0.8;

    // Heading follows velocity vector
    const dx = -Math.sin(t) * radius + Math.cos(t * 0.37) * 4 * 0.37;
    const dz = Math.cos(t * 1.6) * radius * 0.55 * 1.6 - Math.sin(t * 0.47) * 5 * 0.47;
    ref.current.rotation.y = Math.atan2(dx, dz);
    // Banking proportional to turn rate
    const turnRate = Math.cos(t) * radius * speed * 0.18;
    ref.current.rotation.z = Math.atan2(turnRate, 50) * 0.5;
    // Pitch follows altitude changes
    const dy = Math.cos(t * 0.6) * 1.5 * 0.6 + Math.cos(t * 1.8) * 0.4 * 1.8;
    ref.current.rotation.x = Math.atan2(dy, 8) * 0.3;

    // Subtle body oscillation
    if (bodyRef.current) {
      bodyRef.current.rotation.x = Math.sin(clock.getElapsedTime() * 1.5 + offset) * 0.015;
      bodyRef.current.rotation.z = Math.cos(clock.getElapsedTime() * 0.8 + offset) * 0.008;
    }

    // Head looks around occasionally
    if (headRef.current) {
      const headT = clock.getElapsedTime() * 0.3 + offset;
      headRef.current.rotation.y = Math.sin(headT * 2.3) * 0.15;
      headRef.current.rotation.x = Math.sin(headT * 1.1) * 0.05;
    }

    // Tail adjusts for steering
    if (tailRef.current) {
      tailRef.current.rotation.y = -Math.atan2(turnRate, 80) * 0.2;
      tailRef.current.rotation.x = Math.sin(clock.getElapsedTime() * 0.7) * 0.03;
    }

    const elapsed = clock.getElapsedTime() + flapCycle;
    // Natural flap pattern: bursts of flaps followed by extended glides
    const cycleLen = 4.0; // seconds per full cycle
    const cyclePos = ((elapsed * 0.6) % cycleLen) / cycleLen;
    const isGliding = cyclePos > (1 - glideRatio);

    let wingAngle: number, outerAngle: number, tipAngle: number;

    if (isGliding) {
      // Gliding: wings held in slight dihedral, gentle flex from air currents
      const glideT = clock.getElapsedTime() * 0.5 + offset;
      wingAngle = 0.15 + Math.sin(glideT * 1.3) * 0.025;
      outerAngle = 0.06 + Math.sin(glideT * 1.7) * 0.015;
      tipAngle = -0.1 + Math.sin(glideT * 2.1) * 0.02;
    } else {
      // Flapping: smooth sinusoidal with cascading flex along wing
      const flapSpeed = 6.5;
      const flapT = elapsed * flapSpeed;
      // Downstroke is faster than upstroke (asymmetric)
      const raw = Math.sin(flapT);
      wingAngle = (raw > 0 ? raw * 0.6 : raw * 0.45);
      outerAngle = (Math.sin(flapT - 0.5) > 0 ? Math.sin(flapT - 0.5) * 0.4 : Math.sin(flapT - 0.5) * 0.3);
      tipAngle = Math.sin(flapT - 1.0) * 0.3;
    }

    if (leftWingRef.current) leftWingRef.current.rotation.z = wingAngle;
    if (rightWingRef.current) rightWingRef.current.rotation.z = -wingAngle;
    if (leftOuterRef.current) leftOuterRef.current.rotation.z = outerAngle;
    if (rightOuterRef.current) rightOuterRef.current.rotation.z = -outerAngle;
    if (leftTipRef.current) leftTipRef.current.rotation.z = tipAngle + 0.1;
    if (rightTipRef.current) rightTipRef.current.rotation.z = -tipAngle - 0.1;
  });

  // Wing section builder to avoid duplication
  const WingInner = ({ side }: { side: 1 | -1 }) => (
    <>
      {/* Secondary feathers */}
      <mesh position={[0.14 * side, 0, 0.02]}>
        <boxGeometry args={[0.28, 0.014, 0.22]} />
        <meshStandardMaterial color="#aeb0b8" roughness={0.7} />
      </mesh>
      {/* Greater coverts */}
      <mesh position={[0.12 * side, 0.009, -0.01]}>
        <boxGeometry args={[0.22, 0.007, 0.12]} />
        <meshStandardMaterial color="#c2c4ca" roughness={0.6} />
      </mesh>
      {/* Median coverts */}
      <mesh position={[0.1 * side, 0.014, -0.02]}>
        <boxGeometry args={[0.16, 0.005, 0.08]} />
        <meshStandardMaterial color="#d0d2d6" roughness={0.55} />
      </mesh>
      {/* Scapulars (shoulder feathers) */}
      <mesh position={[0.05 * side, 0.006, 0.06]}>
        <boxGeometry args={[0.08, 0.01, 0.1]} />
        <meshStandardMaterial color="#b5b7be" roughness={0.7} />
      </mesh>
    </>
  );

  const WingOuter = ({ side }: { side: 1 | -1 }) => (
    <>
      <mesh position={[0.11 * side, 0, 0.01]}>
        <boxGeometry args={[0.22, 0.011, 0.17]} />
        <meshStandardMaterial color="#9a9ca5" roughness={0.75} />
      </mesh>
      {/* Alula (thumb feathers) */}
      <mesh position={[0.02 * side, 0.01, -0.06]}>
        <boxGeometry args={[0.04, 0.006, 0.04]} />
        <meshStandardMaterial color="#606068" roughness={0.8} />
      </mesh>
    </>
  );

  const WingTip = ({ side }: { side: 1 | -1 }) => (
    <>
      {/* Primary feathers block - black */}
      <mesh position={[0.07 * side, 0, 0]}>
        <boxGeometry args={[0.14, 0.007, 0.09]} />
        <meshStandardMaterial color="#080808" roughness={0.85} />
      </mesh>
      {/* Individual primaries with white mirrors */}
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <group key={i}>
          <mesh position={[(0.12 + i * 0.01) * side, 0, -0.02 + i * 0.016]} rotation={[0, 0.03 * i * side, 0]}>
            <boxGeometry args={[0.035, 0.004, 0.013]} />
            <meshStandardMaterial color="#050505" roughness={0.9} />
          </mesh>
          {/* White mirrors on P9 and P10 */}
          {i <= 1 && (
            <mesh position={[(0.09 + i * 0.015) * side, 0.002, -0.02 + i * 0.016]}>
              <boxGeometry args={[0.018, 0.003, 0.009]} />
              <meshStandardMaterial color="#ffffff" roughness={0.4} />
            </mesh>
          )}
        </group>
      ))}
    </>
  );

  return (
    <group ref={ref} position={position} scale={birdScale}>
      <group ref={bodyRef}>
        {/* Streamlined body */}
        <mesh>
          <capsuleGeometry args={[0.058, 0.48, 8, 14]} />
          <meshStandardMaterial color="#f5f2ec" roughness={0.55} />
        </mesh>
        {/* White breast/belly */}
        <mesh position={[0, -0.025, -0.06]}>
          <capsuleGeometry args={[0.052, 0.35, 6, 12]} />
          <meshStandardMaterial color="#ffffff" roughness={0.5} />
        </mesh>
        {/* Pearl-grey mantle */}
        <mesh position={[0, 0.028, 0.04]}>
          <capsuleGeometry args={[0.048, 0.3, 6, 12]} />
          <meshStandardMaterial color="#b3b5bc" roughness={0.65} />
        </mesh>
        {/* Rump (lighter grey) */}
        <mesh position={[0, 0.01, 0.22]}>
          <sphereGeometry args={[0.04, 8, 8]} />
          <meshStandardMaterial color="#d8d8dc" roughness={0.6} />
        </mesh>

        {/* Head group - can look around */}
        <group ref={headRef} position={[0, 0.04, -0.32]}>
          {/* Skull */}
          <mesh>
            <sphereGeometry args={[0.06, 12, 12]} />
            <meshStandardMaterial color="#ffffff" roughness={0.45} />
          </mesh>
          {/* Forehead slope */}
          <mesh position={[0, 0.015, -0.03]}>
            <sphereGeometry args={[0.04, 8, 8]} />
            <meshStandardMaterial color="#ffffff" roughness={0.45} />
          </mesh>

          {/* Beak - yellow-orange with red spot and hooked tip */}
          <mesh position={[0, -0.01, -0.1]} rotation={[0.12, 0, 0]}>
            <coneGeometry args={[0.015, 0.18, 8]} />
            <meshStandardMaterial color="#f0a030" roughness={0.3} metalness={0.15} />
          </mesh>
          <mesh position={[0, -0.02, -0.1]} rotation={[0.25, 0, 0]}>
            <coneGeometry args={[0.011, 0.13, 6]} />
            <meshStandardMaterial color="#e89828" roughness={0.35} />
          </mesh>
          {/* Red gonydeal spot */}
          <mesh position={[0, -0.016, -0.07]}>
            <sphereGeometry args={[0.007, 6, 6]} />
            <meshStandardMaterial color="#cc2020" roughness={0.4} />
          </mesh>
          {/* Hooked tip (nail) */}
          <mesh position={[0, -0.014, -0.18]} rotation={[0.6, 0, 0]}>
            <coneGeometry args={[0.004, 0.03, 4]} />
            <meshStandardMaterial color="#cc8820" roughness={0.3} />
          </mesh>

          {/* Eyes with orbital ring */}
          {[1, -1].map((side) => (
            <group key={side} position={[0.038 * side, 0.015, -0.02]}>
              {/* Pale yellow iris */}
              <mesh>
                <sphereGeometry args={[0.013, 10, 10]} />
                <meshStandardMaterial color="#f0e860" roughness={0.25} />
              </mesh>
              {/* Dark pupil */}
              <mesh position={[0.004 * side, 0.001, -0.006]}>
                <sphereGeometry args={[0.006, 8, 8]} />
                <meshStandardMaterial color="#0a0a0a" />
              </mesh>
              {/* Orbital ring (red) */}
              <mesh position={[0.003 * side, 0, -0.009]} rotation={[0, 0.2 * side, 0]}>
                <torusGeometry args={[0.014, 0.0012, 8, 14]} />
                <meshStandardMaterial color="#cc3030" roughness={0.45} />
              </mesh>
              {/* Specular highlight */}
              <mesh position={[0.002 * side, 0.004, -0.01]}>
                <sphereGeometry args={[0.002, 4, 4]} />
                <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.3} />
              </mesh>
            </group>
          ))}
        </group>

        {/* Neck */}
        <mesh position={[0, 0.03, -0.27]} rotation={[0.15, 0, 0]}>
          <capsuleGeometry args={[0.042, 0.1, 6, 10]} />
          <meshStandardMaterial color="#f8f6f0" roughness={0.5} />
        </mesh>

        {/* Tail group */}
        <group ref={tailRef} position={[0, 0, 0.3]}>
          {/* Central tail feathers */}
          <mesh position={[0, 0.003, 0.08]} rotation={[-0.08, 0, 0]}>
            <boxGeometry args={[0.05, 0.007, 0.18]} />
            <meshStandardMaterial color="#c8c4bc" roughness={0.8} />
          </mesh>
          {/* Outer tail feathers */}
          {[1, -1].map((side) => (
            <mesh key={side} position={[0.025 * side, 0.001, 0.09]} rotation={[-0.1, 0.06 * side, 0]}>
              <boxGeometry args={[0.025, 0.005, 0.16]} />
              <meshStandardMaterial color="#bbb8b0" roughness={0.8} />
            </mesh>
          ))}
          {/* Under tail coverts */}
          <mesh position={[0, -0.01, 0.04]}>
            <boxGeometry args={[0.03, 0.006, 0.06]} />
            <meshStandardMaterial color="#ffffff" roughness={0.6} />
          </mesh>
        </group>

        {/* Feet tucked */}
        {[1, -1].map((side) => (
          <group key={side} position={[0.018 * side, -0.065, 0.1]}>
            <mesh rotation={[0.4, 0, 0]}>
              <boxGeometry args={[0.005, 0.045, 0.005]} />
              <meshStandardMaterial color="#e88020" />
            </mesh>
            <mesh position={[0, -0.028, -0.012]} rotation={[0.3, 0, 0]}>
              <boxGeometry args={[0.016, 0.003, 0.022]} />
              <meshStandardMaterial color="#e88020" />
            </mesh>
          </group>
        ))}
      </group>

      {/* LEFT WING */}
      <group ref={leftWingRef} position={[0.065, 0.02, 0.02]}>
        <WingInner side={1} />
        <group ref={leftOuterRef} position={[0.28, 0, 0]}>
          <WingOuter side={1} />
          <group ref={leftTipRef} position={[0.22, 0, 0]}>
            <WingTip side={1} />
          </group>
        </group>
      </group>

      {/* RIGHT WING */}
      <group ref={rightWingRef} position={[-0.065, 0.02, 0.02]}>
        <WingInner side={-1} />
        <group ref={rightOuterRef} position={[-0.28, 0, 0]}>
          <WingOuter side={-1} />
          <group ref={rightTipRef} position={[-0.22, 0, 0]}>
            <WingTip side={-1} />
          </group>
        </group>
      </group>
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
