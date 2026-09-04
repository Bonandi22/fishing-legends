import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { PalmTree, Tree, Bush, Rock, Reeds, GrassPatch, Cloud, Bird, FloatingLog, LilyPad } from './primitives';

/* River terrain with natural banks, sand, dirt layers */
function RiverTerrain() {
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(80, 120, 60, 80);
    const pos = g.attributes.position;
    const colors = new Float32Array(pos.count * 3);

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const distFromCenter = Math.abs(x);

      // Organic river edge with sine variations
      const edgeVariation = Math.sin(y * 0.15) * 1.5 + Math.cos(y * 0.08) * 0.8;
      const riverEdge = 8 + edgeVariation;

      let height: number;
      if (distFromCenter < riverEdge) {
        height = -0.7;
      } else if (distFromCenter < riverEdge + 2) {
        // Gradual sandy bank
        const t = (distFromCenter - riverEdge) / 2;
        height = -0.7 + t * 0.5 + Math.random() * 0.05;
      } else {
        const bankDist = distFromCenter - riverEdge - 2;
        height = -0.2 + bankDist * 0.1 + Math.sin(y * 0.1 + x * 0.05) * 0.3 + Math.random() * 0.15;
      }
      pos.setZ(i, height);

      // Vertex colors: water bed = dark, sand = golden, grass = green
      const idx = i * 3;
      if (distFromCenter < riverEdge) {
        colors[idx] = 0.25; colors[idx + 1] = 0.2; colors[idx + 2] = 0.12;
      } else if (distFromCenter < riverEdge + 2.5) {
        colors[idx] = 0.55; colors[idx + 1] = 0.45; colors[idx + 2] = 0.28;
      } else {
        colors[idx] = 0.28 + Math.random() * 0.05;
        colors[idx + 1] = 0.42 + Math.random() * 0.08;
        colors[idx + 2] = 0.18 + Math.random() * 0.03;
      }
    }

    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.computeVertexNormals();
    return g;
  }, []);

  return (
    <mesh geometry={geo} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.6, 0]}>
      <meshStandardMaterial vertexColors roughness={0.92} />
    </mesh>
  );
}

/* Flowing particles on river surface */
function RiverParticles() {
  const count = 40;
  const ref = useRef<THREE.InstancedMesh>(null);
  const particles = useMemo(() =>
    Array.from({ length: count }, () => ({
      x: (Math.random() - 0.5) * 14,
      z: (Math.random() - 0.5) * 80,
      speed: 1.5 + Math.random() * 1.5,
    })), []);

  const dummy = useMemo(() => new THREE.Object3D(), []);

  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.getElapsedTime();
    particles.forEach((p, i) => {
      let z = p.z - t * p.speed;
      // Wrap around
      z = ((z + 60) % 120) - 60;
      dummy.position.set(p.x, -0.35, z);
      dummy.scale.setScalar(0.5 + Math.random() * 0.3);
      dummy.updateMatrix();
      ref.current.setMatrixAt(i, dummy.matrix);
    });
    ref.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, count]}>
      <planeGeometry args={[0.15, 0.15]} />
      <meshStandardMaterial color="#b8d8c8" transparent opacity={0.3} side={THREE.DoubleSide} />
    </instancedMesh>
  );
}

function RiverVegetation() {
  const items = useMemo(() => {
    const trees: { pos: [number, number, number]; s: number; type: 'palm' | 'tree' }[] = [];
    const bushes: { pos: [number, number, number]; s: number }[] = [];
    const reeds: { pos: [number, number, number]; s: number }[] = [];
    const grass: [number, number, number][] = [];
    const lilies: [number, number, number][] = [];
    const logs: [number, number, number][] = [];

    // Dense trees along both banks
    for (let z = -50; z < 50; z += 4) {
      const edgeVar = Math.sin(z * 0.15) * 1.5;
      const edge = 10 + edgeVar;
      // Left bank
      trees.push({ pos: [-(edge + 2 + Math.random() * 6), 0.2, z + Math.random() * 2], s: 0.8 + Math.random() * 0.5, type: Math.random() > 0.4 ? 'palm' : 'tree' });
      if (Math.random() > 0.4) trees.push({ pos: [-(edge + 5 + Math.random() * 8), 0.3, z + Math.random() * 2], s: 0.7 + Math.random() * 0.6, type: 'tree' });
      // Right bank
      trees.push({ pos: [edge + 2 + Math.random() * 6, 0.2, z + Math.random() * 2], s: 0.8 + Math.random() * 0.5, type: Math.random() > 0.4 ? 'palm' : 'tree' });
      if (Math.random() > 0.4) trees.push({ pos: [edge + 5 + Math.random() * 8, 0.3, z + Math.random() * 2], s: 0.7 + Math.random() * 0.6, type: 'tree' });
    }

    // Bushes near waterline
    for (let z = -45; z < 45; z += 3.5) {
      const edgeVar = Math.sin(z * 0.15) * 1.5;
      const edge = 9 + edgeVar;
      bushes.push({ pos: [-(edge + 1 + Math.random()), 0.05, z + Math.random()], s: 0.5 + Math.random() * 0.5 });
      bushes.push({ pos: [edge + 1 + Math.random(), 0.05, z + Math.random()], s: 0.5 + Math.random() * 0.5 });
    }

    // Reeds at water edge
    for (let z = -40; z < 40; z += 2.5) {
      const edgeVar = Math.sin(z * 0.15) * 1.5;
      const edge = 8 + edgeVar;
      reeds.push({ pos: [-(edge + Math.random() * 0.5), -0.3, z + Math.random()], s: 0.7 + Math.random() * 0.4 });
      reeds.push({ pos: [edge + Math.random() * 0.5, -0.3, z + Math.random()], s: 0.7 + Math.random() * 0.4 });
    }

    // Grass
    for (let z = -40; z < 40; z += 2) {
      grass.push([-(10 + Math.random() * 5), -0.1, z + Math.random()]);
      grass.push([10 + Math.random() * 5, -0.1, z + Math.random()]);
    }

    // Lily pads near edges
    for (let z = -30; z < 30; z += 6) {
      const edgeVar = Math.sin(z * 0.15) * 1.5;
      const edge = 7 + edgeVar;
      lilies.push([-(edge - 1 + Math.random() * 2), -0.42, z + Math.random() * 3]);
      lilies.push([edge - 1 + Math.random() * 2, -0.42, z + Math.random() * 3]);
    }

    // Floating logs
    logs.push([-3, -0.4, -15]);
    logs.push([4, -0.4, 10]);

    return { trees, bushes, reeds, grass, lilies, logs };
  }, []);

  return (
    <group>
      {items.trees.map((t, i) =>
        t.type === 'palm'
          ? <PalmTree key={`t${i}`} position={t.pos} scale={t.s} />
          : <Tree key={`t${i}`} position={t.pos} scale={t.s} foliageColors={['#1a5510', '#206618', '#287a20']} />
      )}
      {items.bushes.map((b, i) => <Bush key={`b${i}`} position={b.pos} scale={b.s} color="#1a5a10" />)}
      {items.reeds.map((r, i) => <Reeds key={`r${i}`} position={r.pos} scale={r.s} />)}
      {items.grass.map((g, i) => <GrassPatch key={`g${i}`} position={g} color="#3a7a20" />)}
      {items.lilies.map((l, i) => <LilyPad key={`l${i}`} position={l} />)}
      {items.logs.map((l, i) => <FloatingLog key={`log${i}`} position={l} />)}
    </group>
  );
}

export default function RiverScene() {
  return (
    <group>
      <RiverTerrain />
      <RiverVegetation />
      <RiverParticles />

      {/* Rocks in the river */}
      <Rock position={[-5, -0.25, -12]} scale={1.0} color="#5a5a4a" />
      <Rock position={[4, -0.3, 8]} scale={0.7} color="#5a5a4a" />
      <Rock position={[-3, -0.2, 20]} scale={1.2} color="#6a6a5a" />
      <Rock position={[6, -0.35, -25]} scale={0.9} color="#5a5a4a" />
      {/* Larger rocks on banks */}
      <Rock position={[-12, 0.1, -8]} scale={1.5} color="#7a7a6a" />
      <Rock position={[13, 0, 15]} scale={1.8} color="#7a7a6a" />

      {/* Clouds */}
      <Cloud position={[-20, 18, -30]} scale={1.0} speed={0.2} />
      <Cloud position={[15, 20, -40]} scale={1.3} speed={0.25} />
      <Cloud position={[0, 22, -50]} scale={0.9} speed={0.3} />

      {/* Birds */}
      <Bird position={[0, 10, -10]} speed={0.6} />
      <Bird position={[-5, 12, -5]} speed={0.8} />
    </group>
  );
}
