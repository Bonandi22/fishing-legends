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

/* ═══════ RAIN PARTICLES ═══════ */
function Rain({ intensity = 1 }: { intensity: number }) {
  const count = Math.floor(800 * intensity);
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  const drops = useMemo(() =>
    Array.from({ length: count }, () => ({
      x: (Math.random() - 0.5) * 60,
      y: Math.random() * 30 + 5,
      z: (Math.random() - 0.5) * 60,
      speed: 15 + Math.random() * 10,
    })), [count]);

  useFrame((_, delta) => {
    if (!meshRef.current) return;
    for (let i = 0; i < count; i++) {
      const d = drops[i];
      d.y -= d.speed * delta;
      if (d.y < -1) {
        d.y = 25 + Math.random() * 10;
        d.x = (Math.random() - 0.5) * 60;
        d.z = (Math.random() - 0.5) * 60;
      }
      dummy.position.set(d.x, d.y, d.z);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]}>
      <cylinderGeometry args={[0.008, 0.008, 0.5, 3]} />
      <meshBasicMaterial color="#aabbcc" transparent opacity={0.4} />
    </instancedMesh>
  );
}

/* ═══════ LIGHTNING FLASH ═══════ */
function Lightning() {
  const lightRef = useRef<THREE.PointLight>(null);
  const nextFlash = useRef(2 + Math.random() * 8);
  const flashTime = useRef(0);

  useFrame(({ clock }) => {
    if (!lightRef.current) return;
    const t = clock.getElapsedTime();
    if (t > nextFlash.current && flashTime.current === 0) {
      flashTime.current = t;
      nextFlash.current = t + 5 + Math.random() * 15;
    }
    if (flashTime.current > 0) {
      const elapsed = t - flashTime.current;
      if (elapsed < 0.1) {
        lightRef.current.intensity = 8;
      } else if (elapsed < 0.15) {
        lightRef.current.intensity = 0;
      } else if (elapsed < 0.25) {
        lightRef.current.intensity = 12;
      } else if (elapsed < 0.4) {
        lightRef.current.intensity = Math.max(0, 12 - (elapsed - 0.25) * 80);
      } else {
        lightRef.current.intensity = 0;
        flashTime.current = 0;
      }
    }
  });

  return <pointLight ref={lightRef} position={[0, 30, -20]} intensity={0} color="#ccddff" distance={200} />;
}

/* ═══════ DARK CLOUDS OVERLAY ═══════ */
function DarkClouds({ darkness = 0.5 }: { darkness: number }) {
  const refs = useRef<THREE.Mesh[]>([]);
  const clouds = useMemo(() =>
    Array.from({ length: 20 }, (_, i) => ({
      x: (Math.random() - 0.5) * 100,
      y: 18 + Math.random() * 8,
      z: -30 + (Math.random() - 0.5) * 60,
      scaleX: 8 + Math.random() * 15,
      scaleY: 2 + Math.random() * 3,
      speed: 0.3 + Math.random() * 0.5,
    })), []);

  useFrame(({ clock }) => {
    refs.current.forEach((mesh, i) => {
      if (!mesh) return;
      const t = clock.getElapsedTime();
      mesh.position.x = clouds[i].x + t * clouds[i].speed;
      if (mesh.position.x > 60) mesh.position.x -= 120;
    });
  });

  return (
    <group>
      {clouds.map((c, i) => (
        <mesh
          key={i}
          ref={el => { refs.current[i] = el; }}
          position={[c.x, c.y, c.z]}
        >
          <sphereGeometry args={[1, 8, 6]} />
          <meshStandardMaterial
            color={darkness > 0.6 ? '#2a2a35' : '#667788'}
            transparent
            opacity={0.6 * darkness}
            roughness={1}
          />
          <group scale={[c.scaleX, c.scaleY, 6]} />
        </mesh>
      ))}
    </group>
  );
}

/* ═══════ FOG PARTICLES ═══════ */
function FogParticles() {
  const refs = useRef<THREE.Mesh[]>([]);
  const particles = useMemo(() =>
    Array.from({ length: 15 }, () => ({
      x: (Math.random() - 0.5) * 50,
      y: 1 + Math.random() * 4,
      z: (Math.random() - 0.5) * 50,
      scale: 5 + Math.random() * 10,
      speed: 0.2 + Math.random() * 0.3,
    })), []);

  useFrame(({ clock }) => {
    refs.current.forEach((mesh, i) => {
      if (!mesh) return;
      const t = clock.getElapsedTime();
      mesh.position.x = particles[i].x + Math.sin(t * particles[i].speed + i) * 3;
      mesh.position.y = particles[i].y + Math.sin(t * 0.2 + i * 2) * 0.5;
      mesh.material.opacity = 0.15 + Math.sin(t * 0.3 + i) * 0.05;
    });
  });

  return (
    <group>
      {particles.map((p, i) => (
        <mesh
          key={i}
          ref={el => { refs.current[i] = el; }}
          position={[p.x, p.y, p.z]}
        >
          <sphereGeometry args={[p.scale, 8, 6]} />
          <meshStandardMaterial color="#c0c8d0" transparent opacity={0.15} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

/* ═══════ WEATHER AMBIENT MODIFIER ═══════ */
function WeatherAmbient({ weather }: { weather: WeatherType }) {
  const ambientRef = useRef<THREE.AmbientLight>(null);
  const targetIntensity = useMemo(() => {
    switch (weather) {
      case 'clear': return 0.5;
      case 'cloudy': return 0.35;
      case 'rainy': return 0.25;
      case 'stormy': return 0.15;
      case 'foggy': return 0.3;
    }
  }, [weather]);

  useFrame(() => {
    if (!ambientRef.current) return;
    ambientRef.current.intensity += (targetIntensity - ambientRef.current.intensity) * 0.02;
  });

  return <ambientLight ref={ambientRef} intensity={0.4} color={weather === 'stormy' ? '#8090a0' : '#aabbcc'} />;
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

      {/* Cloudy / Rainy / Stormy → dark clouds */}
      {(weather === 'cloudy' || weather === 'rainy' || weather === 'stormy') && (
        <DarkClouds darkness={weather === 'stormy' ? 0.8 : weather === 'rainy' ? 0.6 : 0.4} />
      )}

      {/* Rain */}
      {(weather === 'rainy' || weather === 'stormy') && (
        <Rain intensity={weather === 'stormy' ? 1.5 : 0.8} />
      )}

      {/* Lightning for storms */}
      {weather === 'stormy' && <Lightning />}

      {/* Dense fog */}
      {weather === 'foggy' && <FogParticles />}
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
