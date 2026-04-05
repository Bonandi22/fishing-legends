// @ts-nocheck
import { useRef, useMemo, useState, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

export type WeatherType = 'clear' | 'cloudy' | 'rainy' | 'stormy' | 'foggy';

const WEATHER_DURATION = 5 * 60 * 1000; // 5 minutes

const WEATHER_TYPES: WeatherType[] = ['clear', 'cloudy', 'rainy', 'stormy', 'foggy'];

function pickRandomWeather(current: WeatherType): WeatherType {
  const others = WEATHER_TYPES.filter(w => w !== current);
  return others[Math.floor(Math.random() * others.length)];
}

/* ═══════ RAIN PARTICLES — streaks with wind angle & splash ═══════ */
function Rain({ intensity = 1 }: { intensity: number }) {
  const count = Math.floor(1200 * intensity);
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const splashRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const windAngle = useMemo(() => 0.15 + Math.random() * 0.1, []);
  const windX = useMemo(() => 2 + Math.random() * 3, []);

  const drops = useMemo(() =>
    Array.from({ length: count }, () => ({
      x: (Math.random() - 0.5) * 80,
      y: Math.random() * 35 + 5,
      z: (Math.random() - 0.5) * 80,
      speed: 18 + Math.random() * 12,
      length: 0.4 + Math.random() * 0.4,
      splashTimer: 0,
      splashX: 0, splashZ: 0,
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
        d.splashTimer = 0.15;
        d.y = 30 + Math.random() * 10;
        d.x = (Math.random() - 0.5) * 80;
        d.z = (Math.random() - 0.5) * 80;
      }
      dummy.position.set(d.x, d.y, d.z);
      dummy.rotation.set(0, 0, windAngle);
      dummy.scale.set(1, d.length, 1);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;

    // Splashes on water surface
    if (splashRef.current) {
      let si = 0;
      for (let i = 0; i < count && si < 200; i++) {
        const d = drops[i];
        if (d.splashTimer > 0) {
          const progress = 1 - d.splashTimer / 0.15;
          const s = 0.05 + progress * 0.15;
          dummy.position.set(d.splashX, -0.35, d.splashZ);
          dummy.rotation.set(-Math.PI / 2, 0, 0);
          dummy.scale.set(s, s, 1);
          dummy.updateMatrix();
          splashRef.current.setMatrixAt(si, dummy.matrix);
          si++;
        }
      }
      for (let j = si; j < 200; j++) {
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
        <cylinderGeometry args={[0.006, 0.01, 0.6, 3]} />
        <meshBasicMaterial color="#9aabbd" transparent opacity={0.35} />
      </instancedMesh>
      {/* Splash rings on water */}
      <instancedMesh ref={splashRef} args={[undefined, undefined, 200]}>
        <ringGeometry args={[0.03, 0.08, 8]} />
        <meshBasicMaterial color="#b0c8e0" transparent opacity={0.3} side={THREE.DoubleSide} />
      </instancedMesh>
    </group>
  );
}

/* ═══════ LIGHTNING — multi-bolt with branching ═══════ */
function Lightning() {
  const lightRef = useRef<THREE.PointLight>(null);
  const light2Ref = useRef<THREE.PointLight>(null);
  const nextFlash = useRef(2 + Math.random() * 6);
  const flashTime = useRef(0);
  const flashPos = useRef<[number, number, number]>([0, 30, -20]);

  useFrame(({ clock }) => {
    if (!lightRef.current || !light2Ref.current) return;
    const t = clock.getElapsedTime();
    if (t > nextFlash.current && flashTime.current === 0) {
      flashTime.current = t;
      nextFlash.current = t + 4 + Math.random() * 12;
      flashPos.current = [(Math.random() - 0.5) * 60, 25 + Math.random() * 10, -20 + (Math.random() - 0.5) * 30];
      lightRef.current.position.set(...flashPos.current);
      light2Ref.current.position.set(flashPos.current[0] + 10, flashPos.current[1] - 5, flashPos.current[2] + 5);
    }
    if (flashTime.current > 0) {
      const elapsed = t - flashTime.current;
      // Multi-flash pattern: flash-dark-flash-flash-fade
      let i1 = 0, i2 = 0;
      if (elapsed < 0.05) { i1 = 6; }
      else if (elapsed < 0.1) { i1 = 0; }
      else if (elapsed < 0.15) { i1 = 10; i2 = 4; }
      else if (elapsed < 0.2) { i1 = 3; i2 = 8; }
      else if (elapsed < 0.35) { i1 = 15; i2 = 6; }
      else if (elapsed < 0.6) {
        const fade = 1 - (elapsed - 0.35) / 0.25;
        i1 = 15 * fade; i2 = 6 * fade;
      } else {
        flashTime.current = 0;
      }
      lightRef.current.intensity = i1;
      light2Ref.current.intensity = i2;
    }
  });

  return (
    <group>
      <pointLight ref={lightRef} position={[0, 30, -20]} intensity={0} color="#d0ddef" distance={250} />
      <pointLight ref={light2Ref} position={[10, 25, -15]} intensity={0} color="#b8c8e0" distance={180} />
    </group>
  );
}

/* ═══════ VOLUMETRIC CLOUD LAYER ═══════ */
function CloudLayer({ darkness = 0.5, count = 30, speed = 0.4 }: { darkness: number; count?: number; speed?: number }) {
  const groupRef = useRef<THREE.Group>(null);

  const clouds = useMemo(() =>
    Array.from({ length: count }, () => {
      const clusterSize = 3 + Math.floor(Math.random() * 5);
      const baseX = (Math.random() - 0.5) * 120;
      const baseY = 16 + Math.random() * 10;
      const baseZ = -40 + (Math.random() - 0.5) * 60;
      return {
        baseX, baseY, baseZ,
        speed: speed * (0.6 + Math.random() * 0.8),
        puffs: Array.from({ length: clusterSize }, () => ({
          offsetX: (Math.random() - 0.5) * 8,
          offsetY: (Math.random() - 0.5) * 2,
          offsetZ: (Math.random() - 0.5) * 4,
          scale: 2 + Math.random() * 4,
          scaleY: 0.4 + Math.random() * 0.3,
        })),
      };
    }), [count, speed]);

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    const t = clock.getElapsedTime();
    groupRef.current.children.forEach((cluster, ci) => {
      const c = clouds[ci];
      if (!c) return;
      let x = c.baseX + t * c.speed;
      if (x > 70) x -= 140;
      cluster.position.set(x, c.baseY, c.baseZ);
    });
  });

  const baseColor = darkness > 0.7 ? '#1e2028' : darkness > 0.5 ? '#3a3e4a' : '#6a7080';
  const underColor = darkness > 0.7 ? '#151820' : darkness > 0.5 ? '#2a2e38' : '#505868';

  return (
    <group ref={groupRef}>
      {clouds.map((c, ci) => (
        <group key={ci} position={[c.baseX, c.baseY, c.baseZ]}>
          {c.puffs.map((p, pi) => (
            <mesh key={pi} position={[p.offsetX, p.offsetY, p.offsetZ]} scale={[p.scale, p.scale * p.scaleY, p.scale * 0.7]}>
              <sphereGeometry args={[1, 10, 8]} />
              <meshStandardMaterial
                color={p.offsetY < 0 ? underColor : baseColor}
                transparent
                opacity={0.55 * darkness}
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

/* ═══════ CLEAR SKY — god rays / sun glow ═══════ */
function SunGlow() {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.getElapsedTime();
    ref.current.material.opacity = 0.08 + Math.sin(t * 0.3) * 0.02;
    ref.current.scale.setScalar(1 + Math.sin(t * 0.5) * 0.05);
  });

  return (
    <group>
      <mesh ref={ref} position={[80, 30, -60]}>
        <sphereGeometry args={[8, 16, 16]} />
        <meshBasicMaterial color="#fff8e0" transparent opacity={0.1} depthWrite={false} />
      </mesh>
      {/* Light shafts */}
      {[0, 0.4, 0.8, 1.2].map((rot, i) => (
        <mesh key={i} position={[80, 25, -60]} rotation={[0, rot, 0.3]}>
          <planeGeometry args={[1, 30]} />
          <meshBasicMaterial color="#fff4cc" transparent opacity={0.03} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
      ))}
      {/* Warm ambient particles */}
      <HeatShimmer />
    </group>
  );
}

/* Heat shimmer for clear weather */
function HeatShimmer() {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.getElapsedTime();
    ref.current.material.opacity = 0.02 + Math.sin(t * 2) * 0.01;
    ref.current.position.y = 0.5 + Math.sin(t * 0.8) * 0.3;
  });

  return (
    <mesh ref={ref} position={[0, 0.5, -10]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[40, 40]} />
      <meshBasicMaterial color="#ffeecc" transparent opacity={0.02} depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
  );
}

/* ═══════ FOG — multi-layer volumetric ═══════ */
function VolumeFog() {
  const groupRef = useRef<THREE.Group>(null);
  const particles = useMemo(() =>
    Array.from({ length: 30 }, () => ({
      x: (Math.random() - 0.5) * 70,
      y: 0.5 + Math.random() * 5,
      z: (Math.random() - 0.5) * 70,
      scale: 6 + Math.random() * 14,
      speedX: 0.15 + Math.random() * 0.25,
      speedY: 0.05 + Math.random() * 0.1,
      phase: Math.random() * Math.PI * 2,
      baseOpacity: 0.12 + Math.random() * 0.1,
    })), []);

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    const t = clock.getElapsedTime();
    groupRef.current.children.forEach((mesh, i) => {
      const p = particles[i];
      if (!p || !mesh) return;
      mesh.position.x = p.x + Math.sin(t * p.speedX + p.phase) * 5;
      mesh.position.y = p.y + Math.sin(t * p.speedY + p.phase * 2) * 1;
      mesh.position.z = p.z + Math.cos(t * p.speedX * 0.7 + p.phase) * 3;
      mesh.material.opacity = p.baseOpacity + Math.sin(t * 0.25 + p.phase) * 0.04;
    });
  });

  return (
    <group ref={groupRef}>
      {particles.map((p, i) => (
        <mesh key={i} position={[p.x, p.y, p.z]}>
          <sphereGeometry args={[p.scale, 10, 8]} />
          <meshStandardMaterial color="#b8c4cc" transparent opacity={p.baseOpacity} roughness={1} depthWrite={false} />
        </mesh>
      ))}
      {/* Ground-hugging fog layer */}
      <mesh position={[0, 0.3, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[100, 100]} />
        <meshBasicMaterial color="#c0ccd4" transparent opacity={0.18} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

/* ═══════ CLOUDY — scattered cumulus with varying depths ═══════ */
function ScatteredClouds() {
  return (
    <group>
      <CloudLayer darkness={0.35} count={25} speed={0.3} />
      {/* Wispy high altitude layer */}
      <CloudLayer darkness={0.15} count={10} speed={0.15} />
    </group>
  );
}

/* ═══════ WIND PARTICLES for storms ═══════ */
function WindStreaks() {
  const count = 150;
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  const streaks = useMemo(() =>
    Array.from({ length: count }, () => ({
      x: (Math.random() - 0.5) * 80,
      y: 1 + Math.random() * 15,
      z: (Math.random() - 0.5) * 80,
      speed: 20 + Math.random() * 15,
    })), []);

  useFrame((_, delta) => {
    if (!meshRef.current) return;
    for (let i = 0; i < count; i++) {
      const s = streaks[i];
      s.x += s.speed * delta;
      if (s.x > 40) { s.x = -40; s.z = (Math.random() - 0.5) * 80; }
      dummy.position.set(s.x, s.y, s.z);
      dummy.rotation.set(0, 0, Math.PI / 2 + 0.2);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]}>
      <cylinderGeometry args={[0.003, 0.003, 2, 3]} />
      <meshBasicMaterial color="#8899aa" transparent opacity={0.15} />
    </instancedMesh>
  );
}

/* ═══════ WEATHER AMBIENT MODIFIER — smooth transition ═══════ */
function WeatherAmbient({ weather }: { weather: WeatherType }) {
  const ambientRef = useRef<THREE.AmbientLight>(null);
  const dirRef = useRef<THREE.DirectionalLight>(null);

  const targets = useMemo(() => {
    switch (weather) {
      case 'clear': return { ambient: 0.55, dir: 1.6, ambColor: '#ffe8c0', dirColor: '#fff4e0' };
      case 'cloudy': return { ambient: 0.35, dir: 0.8, ambColor: '#b0b8c8', dirColor: '#c8d0d8' };
      case 'rainy': return { ambient: 0.22, dir: 0.5, ambColor: '#8090a8', dirColor: '#909aa8' };
      case 'stormy': return { ambient: 0.12, dir: 0.25, ambColor: '#505868', dirColor: '#606878' };
      case 'foggy': return { ambient: 0.3, dir: 0.6, ambColor: '#a0a8b0', dirColor: '#b0b8c0' };
    }
  }, [weather]);

  useFrame(() => {
    if (ambientRef.current) {
      ambientRef.current.intensity += (targets.ambient - ambientRef.current.intensity) * 0.015;
    }
    if (dirRef.current) {
      dirRef.current.intensity += (targets.dir - dirRef.current.intensity) * 0.015;
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

      {/* ☀️ CLEAR — sun glow, god rays, heat shimmer */}
      {weather === 'clear' && <SunGlow />}

      {/* ☁️ CLOUDY — layered scattered cumulus */}
      {weather === 'cloudy' && <ScatteredClouds />}

      {/* 🌧️ RAINY — dark clouds + angled rain with splashes */}
      {weather === 'rainy' && (
        <group>
          <CloudLayer darkness={0.55} count={25} speed={0.5} />
          <Rain intensity={0.8} />
        </group>
      )}

      {/* ⛈️ STORMY — heavy clouds, intense rain, lightning, wind */}
      {weather === 'stormy' && (
        <group>
          <CloudLayer darkness={0.85} count={40} speed={0.8} />
          <Rain intensity={1.8} />
          <Lightning />
          <WindStreaks />
        </group>
      )}

      {/* 🌫️ FOGGY — volumetric fog layers */}
      {weather === 'foggy' && <VolumeFog />}
    </group>
  );
}

export function useWeatherFog(weather: WeatherType): [string, number, number] | null {
  switch (weather) {
    case 'foggy': return ['#b0b8c0', 8, 40];
    case 'stormy': return ['#4a5060', 15, 55];
    case 'rainy': return ['#7a8898', 20, 65];
    default: return null;
  }
}
