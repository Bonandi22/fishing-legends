// @ts-nocheck
import { useRef, useMemo, useState, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

export type WeatherType = 'clear' | 'cloudy' | 'rainy' | 'stormy' | 'foggy';

const WEATHER_DURATION = 5 * 60 * 1000;
const WEATHER_TYPES: WeatherType[] = ['clear', 'cloudy', 'rainy', 'stormy', 'foggy'];

function pickRandomWeather(current: WeatherType): WeatherType {
  const others = WEATHER_TYPES.filter(w => w !== current);
  return others[Math.floor(Math.random() * others.length)];
}

/* ═══════ RAIN — realistic angled streaks with variable thickness & splash rings ═══════ */
function Rain({ intensity = 1 }: { intensity: number }) {
  const count = Math.floor(1500 * intensity);
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const splashRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const windAngle = useMemo(() => 0.12 + Math.random() * 0.08, []);
  const windX = useMemo(() => 2.5 + Math.random() * 3, []);

  const drops = useMemo(() =>
    Array.from({ length: count }, () => ({
      x: (Math.random() - 0.5) * 90,
      y: Math.random() * 40 + 5,
      z: (Math.random() - 0.5) * 90,
      speed: 20 + Math.random() * 15,
      length: 0.3 + Math.random() * 0.5,
      thickness: 0.004 + Math.random() * 0.006,
      splashTimer: 0,
      splashX: 0, splashZ: 0,
      splashScale: 0,
    })), [count]);

  useFrame((_, delta) => {
    if (!meshRef.current) return;
    for (let i = 0; i < count; i++) {
      const d = drops[i];
      d.y -= d.speed * delta;
      d.x += windX * delta;
      if (d.splashTimer > 0) d.splashTimer -= delta;

      if (d.y < -0.3) {
        d.splashX = d.x;
        d.splashZ = d.z;
        d.splashTimer = 0.2;
        d.splashScale = 0.08 + Math.random() * 0.12;
        d.y = 35 + Math.random() * 10;
        d.x = (Math.random() - 0.5) * 90;
        d.z = (Math.random() - 0.5) * 90;
      }
      dummy.position.set(d.x, d.y, d.z);
      dummy.rotation.set(0, 0, windAngle);
      dummy.scale.set(1, d.length, 1);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;

    // Splash rings
    if (splashRef.current) {
      let si = 0;
      for (let i = 0; i < count && si < 300; i++) {
        const d = drops[i];
        if (d.splashTimer > 0) {
          const progress = 1 - d.splashTimer / 0.2;
          const s = d.splashScale * (0.3 + progress * 0.7);
          const opacity = 1 - progress;
          dummy.position.set(d.splashX, -0.32, d.splashZ);
          dummy.rotation.set(-Math.PI / 2, 0, 0);
          dummy.scale.set(s, s, opacity);
          dummy.updateMatrix();
          splashRef.current.setMatrixAt(si, dummy.matrix);
          si++;
        }
      }
      for (let j = si; j < 300; j++) {
        dummy.position.set(0, -100, 0);
        dummy.scale.set(0, 0, 0);
        dummy.updateMatrix();
        splashRef.current.setMatrixAt(j, dummy.matrix);
      }
      splashRef.current.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <group>
      <instancedMesh ref={meshRef} args={[undefined, undefined, count]}>
        <cylinderGeometry args={[0.005, 0.012, 0.6, 4]} />
        <meshBasicMaterial color="#a0b8d0" transparent opacity={0.3} />
      </instancedMesh>
      <instancedMesh ref={splashRef} args={[undefined, undefined, 300]}>
        <ringGeometry args={[0.04, 0.1, 12]} />
        <meshBasicMaterial color="#b8d4e8" transparent opacity={0.25} side={THREE.DoubleSide} />
      </instancedMesh>
    </group>
  );
}

/* ═══════ LIGHTNING — multi-bolt with branching & ground reflection ═══════ */
function Lightning() {
  const lightRef = useRef<THREE.PointLight>(null);
  const light2Ref = useRef<THREE.PointLight>(null);
  const reflectRef = useRef<THREE.PointLight>(null);
  const nextFlash = useRef(2 + Math.random() * 6);
  const flashTime = useRef(0);
  const flashPos = useRef<[number, number, number]>([0, 30, -20]);
  const boltRef = useRef<THREE.Group>(null);

  const boltLine = useMemo(() => {
    // Generate procedural bolt path
    const points: THREE.Vector3[] = [];
    let x = 0, y = 0, z = 0;
    for (let i = 0; i < 12; i++) {
      points.push(new THREE.Vector3(x, y, z));
      x += (Math.random() - 0.5) * 4;
      y -= 3 + Math.random() * 2;
      z += (Math.random() - 0.5) * 2;
    }
    const geom = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({ color: '#e0e8ff', transparent: true, opacity: 0.8 });
    return new THREE.Line(geom, mat);
  }, []);

  useFrame(({ clock }) => {
    if (!lightRef.current || !light2Ref.current) return;
    const t = clock.getElapsedTime();
    if (t > nextFlash.current && flashTime.current === 0) {
      flashTime.current = t;
      nextFlash.current = t + 3 + Math.random() * 10;
      flashPos.current = [(Math.random() - 0.5) * 60, 25 + Math.random() * 10, -20 + (Math.random() - 0.5) * 30];
      lightRef.current.position.set(...flashPos.current);
      light2Ref.current.position.set(flashPos.current[0] + 10, flashPos.current[1] - 5, flashPos.current[2] + 5);
      if (reflectRef.current) {
        reflectRef.current.position.set(flashPos.current[0], -1, flashPos.current[2]);
      }
      // Show bolt
      if (boltRef.current) {
        boltRef.current.position.set(flashPos.current[0], flashPos.current[1], flashPos.current[2]);
        boltRef.current.visible = true;
      }
    }
    if (flashTime.current > 0) {
      const elapsed = t - flashTime.current;
      let i1 = 0, i2 = 0, ir = 0;
      if (elapsed < 0.04) { i1 = 8; ir = 2; }
      else if (elapsed < 0.08) { i1 = 1; }
      else if (elapsed < 0.12) { i1 = 12; i2 = 5; ir = 3; }
      else if (elapsed < 0.18) { i1 = 4; i2 = 10; ir = 2; }
      else if (elapsed < 0.3) { i1 = 18; i2 = 8; ir = 4; }
      else if (elapsed < 0.55) {
        const fade = 1 - (elapsed - 0.3) / 0.25;
        i1 = 18 * fade; i2 = 8 * fade; ir = 4 * fade;
      } else {
        flashTime.current = 0;
        if (boltRef.current) boltRef.current.visible = false;
      }
      lightRef.current.intensity = i1;
      light2Ref.current.intensity = i2;
      if (reflectRef.current) reflectRef.current.intensity = ir;
    }
  });

  return (
    <group>
      <pointLight ref={lightRef} position={[0, 30, -20]} intensity={0} color="#d8e4f0" distance={280} />
      <pointLight ref={light2Ref} position={[10, 25, -15]} intensity={0} color="#c0d0e4" distance={200} />
      <pointLight ref={reflectRef} position={[0, -1, -20]} intensity={0} color="#6080a0" distance={80} />
      <group ref={boltRef} visible={false}>
        <line_>
          <bufferGeometry attach="geometry" {...boltGeom} />
          <lineBasicMaterial color="#e0e8ff" linewidth={2} transparent opacity={0.8} />
        </line_>
      </group>
    </group>
  );
}

/* ═══════ VOLUMETRIC CLOUD LAYER — realistic layered puffs ═══════ */
function CloudLayer({ darkness = 0.5, count = 30, speed = 0.4, height = 18 }: { darkness: number; count?: number; speed?: number; height?: number }) {
  const groupRef = useRef<THREE.Group>(null);

  const clouds = useMemo(() =>
    Array.from({ length: count }, () => {
      const clusterSize = 4 + Math.floor(Math.random() * 6);
      const baseX = (Math.random() - 0.5) * 130;
      const baseY = height + Math.random() * 8;
      const baseZ = -45 + (Math.random() - 0.5) * 60;
      return {
        baseX, baseY, baseZ,
        speed: speed * (0.5 + Math.random() * 1),
        puffs: Array.from({ length: clusterSize }, () => ({
          offsetX: (Math.random() - 0.5) * 10,
          offsetY: (Math.random() - 0.5) * 2.5 - 0.5,
          offsetZ: (Math.random() - 0.5) * 5,
          scale: 2.5 + Math.random() * 5,
          scaleY: 0.3 + Math.random() * 0.35,
          scaleZ: 0.5 + Math.random() * 0.4,
        })),
      };
    }), [count, speed, height]);

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    const t = clock.getElapsedTime();
    groupRef.current.children.forEach((cluster, ci) => {
      const c = clouds[ci];
      if (!c) return;
      let x = c.baseX + t * c.speed;
      if (x > 75) x -= 150;
      cluster.position.set(x, c.baseY + Math.sin(t * 0.15 + ci) * 0.3, c.baseZ);
    });
  });

  // More nuanced color based on darkness
  const topColor = darkness > 0.7 ? '#1a1e28' : darkness > 0.5 ? '#353a48' : darkness > 0.3 ? '#6a7488' : '#8898aa';
  const bottomColor = darkness > 0.7 ? '#101418' : darkness > 0.5 ? '#252a35' : darkness > 0.3 ? '#4a5468' : '#687888';
  const edgeColor = darkness > 0.7 ? '#252a38' : darkness > 0.5 ? '#454a58' : darkness > 0.3 ? '#7a8498' : '#98a8b8';

  return (
    <group ref={groupRef}>
      {clouds.map((c, ci) => (
        <group key={ci} position={[c.baseX, c.baseY, c.baseZ]}>
          {c.puffs.map((p, pi) => (
            <mesh key={pi} position={[p.offsetX, p.offsetY, p.offsetZ]} scale={[p.scale, p.scale * p.scaleY, p.scale * p.scaleZ]}>
              <sphereGeometry args={[1, 12, 10]} />
              <meshStandardMaterial
                color={p.offsetY < -0.5 ? bottomColor : p.offsetY > 0.5 ? edgeColor : topColor}
                transparent
                opacity={0.5 * darkness + 0.1}
                roughness={1}
                depthWrite={false}
              />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

/* ═══════ CLEAR SKY — sun glow, god rays, lens flare ═══════ */
function SunGlow() {
  const ref = useRef<THREE.Mesh>(null);
  const coronaRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.getElapsedTime();
    ref.current.material.opacity = 0.1 + Math.sin(t * 0.3) * 0.03;
    ref.current.scale.setScalar(1 + Math.sin(t * 0.5) * 0.05);
    if (coronaRef.current) {
      coronaRef.current.rotation.z = t * 0.05;
      coronaRef.current.material.opacity = 0.04 + Math.sin(t * 0.7) * 0.01;
    }
  });

  return (
    <group>
      {/* Sun core */}
      <mesh ref={ref} position={[80, 30, -60]}>
        <sphereGeometry args={[6, 20, 20]} />
        <meshBasicMaterial color="#fff8e0" transparent opacity={0.12} depthWrite={false} />
      </mesh>
      {/* Outer corona */}
      <mesh ref={coronaRef} position={[80, 30, -60]}>
        <sphereGeometry args={[12, 16, 16]} />
        <meshBasicMaterial color="#ffe8a0" transparent opacity={0.04} depthWrite={false} />
      </mesh>
      {/* God rays */}
      {[0, 0.35, 0.7, 1.05, 1.4, 1.75].map((rot, i) => (
        <mesh key={i} position={[80, 25, -60]} rotation={[0, rot, 0.25 + i * 0.05]}>
          <planeGeometry args={[0.8, 35]} />
          <meshBasicMaterial color="#fff4cc" transparent opacity={0.02 + Math.sin(i * 1.2) * 0.008} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
      ))}
      {/* Lens flare dots */}
      {[
        { pos: [60, 24, -50] as const, s: 1.5, c: '#ffe0a0', o: 0.06 },
        { pos: [45, 18, -40] as const, s: 0.8, c: '#c0d8ff', o: 0.04 },
        { pos: [35, 14, -35] as const, s: 0.5, c: '#e0c0ff', o: 0.03 },
      ].map((f, i) => (
        <mesh key={`flare-${i}`} position={f.pos}>
          <circleGeometry args={[f.s, 16]} />
          <meshBasicMaterial color={f.c} transparent opacity={f.o} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
      ))}
      <HeatShimmer />
    </group>
  );
}

function HeatShimmer() {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.getElapsedTime();
    ref.current.material.opacity = 0.015 + Math.sin(t * 2) * 0.008;
    ref.current.position.y = 0.5 + Math.sin(t * 0.8) * 0.3;
  });

  return (
    <mesh ref={ref} position={[0, 0.5, -10]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[50, 50]} />
      <meshBasicMaterial color="#ffeecc" transparent opacity={0.015} depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
  );
}

/* ═══════ FOG — multi-layer with depth variation ═══════ */
function VolumeFog() {
  const groupRef = useRef<THREE.Group>(null);
  const particles = useMemo(() =>
    Array.from({ length: 40 }, () => ({
      x: (Math.random() - 0.5) * 80,
      y: 0.3 + Math.random() * 6,
      z: (Math.random() - 0.5) * 80,
      scale: 5 + Math.random() * 16,
      speedX: 0.1 + Math.random() * 0.3,
      speedY: 0.03 + Math.random() * 0.08,
      phase: Math.random() * Math.PI * 2,
      baseOpacity: 0.1 + Math.random() * 0.08,
      layer: Math.random(), // 0=ground, 1=mid
    })), []);

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    const t = clock.getElapsedTime();
    groupRef.current.children.forEach((mesh, i) => {
      const p = particles[i];
      if (!p || !mesh) return;
      mesh.position.x = p.x + Math.sin(t * p.speedX + p.phase) * 6;
      mesh.position.y = p.y + Math.sin(t * p.speedY + p.phase * 2) * 1.2;
      mesh.position.z = p.z + Math.cos(t * p.speedX * 0.7 + p.phase) * 4;
      mesh.material.opacity = p.baseOpacity + Math.sin(t * 0.2 + p.phase) * 0.03;
    });
  });

  return (
    <group ref={groupRef}>
      {particles.map((p, i) => (
        <mesh key={i} position={[p.x, p.y, p.z]}>
          <sphereGeometry args={[p.scale, 10, 8]} />
          <meshStandardMaterial
            color={p.layer < 0.5 ? '#a8b4c0' : '#c0ccd8'}
            transparent
            opacity={p.baseOpacity}
            roughness={1}
            depthWrite={false}
          />
        </mesh>
      ))}
      {/* Ground fog */}
      <mesh position={[0, 0.2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[120, 120]} />
        <meshBasicMaterial color="#b8c8d4" transparent opacity={0.2} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      {/* Mid-level haze */}
      <mesh position={[0, 4, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[100, 100]} />
        <meshBasicMaterial color="#c8d4dc" transparent opacity={0.08} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

/* ═══════ CLOUDY — multi-altitude scattered cumulus ═══════ */
function ScatteredClouds() {
  return (
    <group>
      <CloudLayer darkness={0.3} count={22} speed={0.25} height={20} />
      <CloudLayer darkness={0.15} count={12} speed={0.12} height={28} />
      <CloudLayer darkness={0.08} count={8} speed={0.08} height={34} />
    </group>
  );
}

/* ═══════ WIND STREAKS for storms ═══════ */
function WindStreaks() {
  const count = 200;
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  const streaks = useMemo(() =>
    Array.from({ length: count }, () => ({
      x: (Math.random() - 0.5) * 90,
      y: 0.5 + Math.random() * 18,
      z: (Math.random() - 0.5) * 90,
      speed: 22 + Math.random() * 18,
      length: 1.5 + Math.random() * 2,
    })), []);

  useFrame((_, delta) => {
    if (!meshRef.current) return;
    for (let i = 0; i < count; i++) {
      const s = streaks[i];
      s.x += s.speed * delta;
      if (s.x > 45) { s.x = -45; s.z = (Math.random() - 0.5) * 90; }
      dummy.position.set(s.x, s.y, s.z);
      dummy.rotation.set(0, 0, Math.PI / 2 + 0.15);
      dummy.scale.set(1, s.length, 1);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]}>
      <cylinderGeometry args={[0.002, 0.002, 1, 3]} />
      <meshBasicMaterial color="#7888a0" transparent opacity={0.12} />
    </instancedMesh>
  );
}

/* ═══════ MIST WISPS for rainy weather ═══════ */
function MistWisps() {
  const groupRef = useRef<THREE.Group>(null);
  const wisps = useMemo(() =>
    Array.from({ length: 12 }, () => ({
      x: (Math.random() - 0.5) * 60,
      y: 0.5 + Math.random() * 3,
      z: (Math.random() - 0.5) * 60,
      scale: 4 + Math.random() * 8,
      speed: 0.3 + Math.random() * 0.4,
      phase: Math.random() * Math.PI * 2,
    })), []);

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    const t = clock.getElapsedTime();
    groupRef.current.children.forEach((mesh, i) => {
      const w = wisps[i];
      if (!w) return;
      mesh.position.x = w.x + t * w.speed;
      if (mesh.position.x > 35) mesh.position.x -= 70;
      mesh.position.y = w.y + Math.sin(t * 0.3 + w.phase) * 0.5;
      mesh.material.opacity = 0.06 + Math.sin(t * 0.4 + w.phase) * 0.02;
    });
  });

  return (
    <group ref={groupRef}>
      {wisps.map((w, i) => (
        <mesh key={i} position={[w.x, w.y, w.z]}>
          <sphereGeometry args={[w.scale, 8, 6]} />
          <meshStandardMaterial color="#8898a8" transparent opacity={0.06} roughness={1} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

/* ═══════ WEATHER AMBIENT — smooth lighting transition ═══════ */
function WeatherAmbient({ weather }: { weather: WeatherType }) {
  const ambientRef = useRef<THREE.AmbientLight>(null);
  const dirRef = useRef<THREE.DirectionalLight>(null);

  const targets = useMemo(() => {
    switch (weather) {
      case 'clear': return { ambient: 0.55, dir: 1.6, ambColor: '#ffe8c0', dirColor: '#fff4e0' };
      case 'cloudy': return { ambient: 0.32, dir: 0.7, ambColor: '#a8b0c0', dirColor: '#c0c8d4' };
      case 'rainy': return { ambient: 0.18, dir: 0.4, ambColor: '#7888a0', dirColor: '#8898a8' };
      case 'stormy': return { ambient: 0.08, dir: 0.18, ambColor: '#404858', dirColor: '#505868' };
      case 'foggy': return { ambient: 0.28, dir: 0.5, ambColor: '#98a0a8', dirColor: '#a8b0b8' };
    }
  }, [weather]);

  useFrame(() => {
    if (ambientRef.current) {
      ambientRef.current.intensity += (targets.ambient - ambientRef.current.intensity) * 0.012;
    }
    if (dirRef.current) {
      dirRef.current.intensity += (targets.dir - dirRef.current.intensity) * 0.012;
    }
  });

  return (
    <group>
      <ambientLight ref={ambientRef} intensity={0.4} color={targets.ambColor} />
      <directionalLight ref={dirRef} position={[10, 20, 5]} intensity={1} color={targets.dirColor} />
    </group>
  );
}

/* ═══════ MAIN WEATHER SYSTEM ═══════ */
export function WeatherSystem() {
  const [weather, setWeather] = useState<WeatherType>(() =>
    WEATHER_TYPES[Math.floor(Math.random() * WEATHER_TYPES.length)]
  );

  useEffect(() => {
    const interval = setInterval(() => {
      setWeather(prev => pickRandomWeather(prev));
    }, WEATHER_DURATION);
    return () => clearInterval(interval);
  }, []);

  return (
    <group>
      <WeatherAmbient weather={weather} />

      {weather === 'clear' && <SunGlow />}

      {weather === 'cloudy' && <ScatteredClouds />}

      {weather === 'rainy' && (
        <group>
          <CloudLayer darkness={0.55} count={28} speed={0.5} height={16} />
          <CloudLayer darkness={0.35} count={12} speed={0.3} height={22} />
          <Rain intensity={0.9} />
          <MistWisps />
        </group>
      )}

      {weather === 'stormy' && (
        <group>
          <CloudLayer darkness={0.9} count={45} speed={0.9} height={14} />
          <CloudLayer darkness={0.7} count={20} speed={0.6} height={20} />
          <Rain intensity={2} />
          <Lightning />
          <WindStreaks />
          <MistWisps />
        </group>
      )}

      {weather === 'foggy' && <VolumeFog />}
    </group>
  );
}

export function useWeatherFog(weather: WeatherType): [string, number, number] | null {
  switch (weather) {
    case 'foggy': return ['#b0b8c0', 6, 35];
    case 'stormy': return ['#3a4450', 10, 45];
    case 'rainy': return ['#6a7888', 15, 55];
    default: return null;
  }
}
