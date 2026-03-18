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
  const offset = useMemo(() => Math.random() * Math.PI * 2, []);
  const radius = useMemo(() => 10 + Math.random() * 18, []);
  const heightVar = useMemo(() => Math.random() * 2, []);
  const birdScale = useMemo(() => 0.85 + Math.random() * 0.35, []);
  const flapCycle = useMemo(() => Math.random() * 10, []);

  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.getElapsedTime() * speed * 0.2 + offset;

    // Organic flight path with thermal-like circles and drift
    const pathX = Math.cos(t) * radius + Math.sin(t * 0.3) * 3;
    const pathZ = Math.sin(t * 1.7) * radius * 0.6 + Math.cos(t * 0.5) * 4;
    ref.current.position.x = position[0] + pathX;
    ref.current.position.z = position[2] + pathZ;
    // Altitude varies - thermals and dips
    ref.current.position.y = position[1] + heightVar + Math.sin(t * 0.8) * 1.2 + Math.sin(t * 2.1) * 0.3;

    // Face direction of travel
    const dx = -Math.sin(t) * radius + Math.cos(t * 0.3) * 3 * 0.3;
    const dz = Math.cos(t * 1.7) * radius * 0.6 * 1.7 - Math.sin(t * 0.5) * 4 * 0.5;
    ref.current.rotation.y = Math.atan2(dx, dz);
    // Bank into turns
    const turnRate = Math.cos(t) * radius;
    ref.current.rotation.z = Math.atan2(turnRate, 40) * 0.4;
    // Pitch with altitude changes
    ref.current.rotation.x = Math.cos(t * 0.8) * 0.08;

    // Body bob
    if (bodyRef.current) {
      bodyRef.current.rotation.x = Math.sin(clock.getElapsedTime() * 2 + offset) * 0.02;
    }

    const elapsed = clock.getElapsedTime() + flapCycle;
    // Realistic flap cycle: rapid flaps then long glide
    const cyclePos = (elapsed * 0.4) % 1;
    const isGliding = cyclePos > 0.35 && cyclePos < 0.85;
    
    let wingAngle: number, outerAngle: number, tipAngle: number;
    
    if (isGliding) {
      // Gliding - wings held steady with slight dihedral
      const glideT = (cyclePos - 0.35) / 0.5;
      const glideLift = Math.sin(glideT * Math.PI) * 0.02;
      wingAngle = 0.18 + glideLift;
      outerAngle = 0.05 + glideLift * 0.5;
      tipAngle = -0.08;
    } else {
      // Flapping - smooth sinusoidal with acceleration
      const flapT = elapsed * 7;
      wingAngle = Math.sin(flapT) * 0.55;
      // Outer wing lags slightly (flex)
      outerAngle = Math.sin(flapT - 0.4) * 0.35;
      // Tips flex most
      tipAngle = Math.sin(flapT - 0.8) * 0.25;
    }

    if (leftWingRef.current) leftWingRef.current.rotation.z = wingAngle;
    if (rightWingRef.current) rightWingRef.current.rotation.z = -wingAngle;
    if (leftOuterRef.current) leftOuterRef.current.rotation.z = outerAngle;
    if (rightOuterRef.current) rightOuterRef.current.rotation.z = -outerAngle;
    if (leftTipRef.current) leftTipRef.current.rotation.z = tipAngle + 0.12;
    if (rightTipRef.current) rightTipRef.current.rotation.z = -tipAngle - 0.12;
  });

  return (
    <group ref={ref} position={position} scale={birdScale}>
      <group ref={bodyRef}>
        {/* Body - elongated fusiform shape */}
        <mesh rotation={[0, 0, 0]}>
          <capsuleGeometry args={[0.06, 0.45, 6, 12]} />
          <meshStandardMaterial color="#f5f2ec" roughness={0.6} />
        </mesh>
        {/* White underbelly */}
        <mesh position={[0, -0.03, -0.05]}>
          <capsuleGeometry args={[0.055, 0.3, 5, 10]} />
          <meshStandardMaterial color="#ffffff" roughness={0.55} />
        </mesh>
        {/* Grey mantle/back */}
        <mesh position={[0, 0.03, 0.05]}>
          <capsuleGeometry args={[0.045, 0.25, 5, 10]} />
          <meshStandardMaterial color="#b8b8be" roughness={0.7} />
        </mesh>

        {/* Head - round with smooth neck */}
        <mesh position={[0, 0.04, -0.32]}>
          <sphereGeometry args={[0.058, 10, 10]} />
          <meshStandardMaterial color="#ffffff" roughness={0.5} />
        </mesh>
        {/* Neck transition */}
        <mesh position={[0, 0.03, -0.26]} rotation={[0.2, 0, 0]}>
          <capsuleGeometry args={[0.04, 0.08, 5, 8]} />
          <meshStandardMaterial color="#f8f6f0" roughness={0.55} />
        </mesh>

        {/* Beak - longer, hooked tip, yellow-orange with red gonydeal spot */}
        <mesh position={[0, 0.025, -0.42]} rotation={[0.15, 0, 0]}>
          <coneGeometry args={[0.014, 0.16, 6]} />
          <meshStandardMaterial color="#f0a030" roughness={0.35} metalness={0.1} />
        </mesh>
        {/* Lower mandible */}
        <mesh position={[0, 0.015, -0.41]} rotation={[0.3, 0, 0]}>
          <coneGeometry args={[0.01, 0.12, 5]} />
          <meshStandardMaterial color="#e89828" roughness={0.4} />
        </mesh>
        {/* Red gonydeal spot */}
        <mesh position={[0, 0.018, -0.39]}>
          <sphereGeometry args={[0.006, 5, 5]} />
          <meshStandardMaterial color="#cc2020" roughness={0.4} />
        </mesh>
        {/* Hooked tip */}
        <mesh position={[0, 0.02, -0.49]} rotation={[0.5, 0, 0]}>
          <coneGeometry args={[0.005, 0.04, 4]} />
          <meshStandardMaterial color="#d48820" roughness={0.35} />
        </mesh>

        {/* Eyes - pale iris with dark pupil */}
        {[1, -1].map((side) => (
          <group key={side} position={[0.035 * side, 0.055, -0.33]}>
            <mesh>
              <sphereGeometry args={[0.012, 8, 8]} />
              <meshStandardMaterial color="#f0e860" roughness={0.3} />
            </mesh>
            <mesh position={[0.003 * side, 0.001, -0.005]}>
              <sphereGeometry args={[0.006, 6, 6]} />
              <meshStandardMaterial color="#111111" />
            </mesh>
            {/* Eye ring */}
            <mesh position={[0.002 * side, 0, -0.008]} rotation={[0, 0.2 * side, 0]}>
              <torusGeometry args={[0.013, 0.001, 6, 10]} />
              <meshStandardMaterial color="#cc3030" roughness={0.5} />
            </mesh>
          </group>
        ))}

        {/* Tail feathers - forked */}
        <mesh position={[0, 0.005, 0.32]} rotation={[-0.1, 0, 0]}>
          <boxGeometry args={[0.06, 0.008, 0.16]} />
          <meshStandardMaterial color="#c8c4bc" roughness={0.8} />
        </mesh>
        {[1, -1].map((side) => (
          <mesh key={side} position={[0.03 * side, 0.003, 0.35]} rotation={[-0.12, 0.08 * side, 0]}>
            <boxGeometry args={[0.03, 0.006, 0.14]} />
            <meshStandardMaterial color="#bbb8b0" roughness={0.8} />
          </mesh>
        ))}

        {/* Feet - tucked under in flight */}
        {[1, -1].map((side) => (
          <group key={side} position={[0.02 * side, -0.07, 0.1]}>
            <mesh>
              <boxGeometry args={[0.006, 0.04, 0.006]} />
              <meshStandardMaterial color="#e88020" />
            </mesh>
            {/* Webbed toes */}
            <mesh position={[0, -0.025, -0.01]} rotation={[0.3, 0, 0]}>
              <boxGeometry args={[0.015, 0.004, 0.02]} />
              <meshStandardMaterial color="#e88020" />
            </mesh>
          </group>
        ))}
      </group>

      {/* LEFT WING - 3-section articulation */}
      <group ref={leftWingRef} position={[0.07, 0.02, 0.02]}>
        {/* Inner wing (secondary feathers) - grey */}
        <mesh position={[0.13, 0, 0.02]}>
          <boxGeometry args={[0.26, 0.016, 0.2]} />
          <meshStandardMaterial color="#b0b0b8" roughness={0.7} />
        </mesh>
        {/* Wing coverts (layered look) */}
        <mesh position={[0.12, 0.008, 0.0]}>
          <boxGeometry args={[0.2, 0.008, 0.14]} />
          <meshStandardMaterial color="#c0c0c6" roughness={0.65} />
        </mesh>
        {/* Outer wing */}
        <group ref={leftOuterRef} position={[0.26, 0, 0]}>
          <mesh position={[0.1, 0, 0.01]}>
            <boxGeometry args={[0.2, 0.012, 0.16]} />
            <meshStandardMaterial color="#a0a0a8" roughness={0.75} />
          </mesh>
          {/* Primary feathers (wingtips) - BLACK */}
          <group ref={leftTipRef} position={[0.2, 0, 0]}>
            <mesh position={[0.06, 0, 0]}>
              <boxGeometry args={[0.12, 0.008, 0.1]} />
              <meshStandardMaterial color="#0a0a0a" roughness={0.85} />
            </mesh>
            {/* Individual primary tips with white mirrors */}
            {[0, 1, 2, 3, 4].map((i) => (
              <group key={i}>
                <mesh position={[0.12 + i * 0.012, 0, -0.025 + i * 0.018]} rotation={[0, 0.04 * i, 0]}>
                  <boxGeometry args={[0.04, 0.005, 0.015]} />
                  <meshStandardMaterial color="#050505" roughness={0.9} />
                </mesh>
                {/* White mirror on P10 */}
                {i === 0 && (
                  <mesh position={[0.1, 0.002, -0.025]}>
                    <boxGeometry args={[0.015, 0.004, 0.01]} />
                    <meshStandardMaterial color="#ffffff" roughness={0.5} />
                  </mesh>
                )}
              </group>
            ))}
          </group>
        </group>
      </group>

      {/* RIGHT WING - mirrored */}
      <group ref={rightWingRef} position={[-0.07, 0.02, 0.02]}>
        <mesh position={[-0.13, 0, 0.02]}>
          <boxGeometry args={[0.26, 0.016, 0.2]} />
          <meshStandardMaterial color="#b0b0b8" roughness={0.7} />
        </mesh>
        <mesh position={[-0.12, 0.008, 0.0]}>
          <boxGeometry args={[0.2, 0.008, 0.14]} />
          <meshStandardMaterial color="#c0c0c6" roughness={0.65} />
        </mesh>
        <group ref={rightOuterRef} position={[-0.26, 0, 0]}>
          <mesh position={[-0.1, 0, 0.01]}>
            <boxGeometry args={[0.2, 0.012, 0.16]} />
            <meshStandardMaterial color="#a0a0a8" roughness={0.75} />
          </mesh>
          <group ref={rightTipRef} position={[-0.2, 0, 0]}>
            <mesh position={[-0.06, 0, 0]}>
              <boxGeometry args={[0.12, 0.008, 0.1]} />
              <meshStandardMaterial color="#0a0a0a" roughness={0.85} />
            </mesh>
            {[0, 1, 2, 3, 4].map((i) => (
              <group key={i}>
                <mesh position={[-0.12 - i * 0.012, 0, -0.025 + i * 0.018]} rotation={[0, -0.04 * i, 0]}>
                  <boxGeometry args={[0.04, 0.005, 0.015]} />
                  <meshStandardMaterial color="#050505" roughness={0.9} />
                </mesh>
                {i === 0 && (
                  <mesh position={[-0.1, 0.002, -0.025]}>
                    <boxGeometry args={[0.015, 0.004, 0.01]} />
                    <meshStandardMaterial color="#ffffff" roughness={0.5} />
                  </mesh>
                )}
              </group>
            ))}
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
