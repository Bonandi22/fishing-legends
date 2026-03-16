// @ts-nocheck
import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { PineTree, Tree, Bush, Rock, Reeds, GrassPatch, Cloud, Bird, LilyPad } from './primitives';

/* Lake terrain with vertex colors for shore gradient */
function LakeTerrain() {
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(120, 120, 70, 70);
    const pos = g.attributes.position;
    const colors = new Float32Array(pos.count * 3);

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const dist = Math.sqrt(x * x + y * y);

      // Organic lake edge
      const angle = Math.atan2(y, x);
      const lakeEdge = 18 + Math.sin(angle * 3) * 2 + Math.cos(angle * 5) * 1;

      let height: number;
      if (dist < lakeEdge) {
        height = -0.7;
      } else if (dist < lakeEdge + 3) {
        const t = (dist - lakeEdge) / 3;
        height = -0.7 + t * 0.6 + Math.random() * 0.05;
      } else {
        const bankDist = dist - lakeEdge - 3;
        height = -0.1 + bankDist * 0.06 + Math.sin(angle * 4 + dist * 0.1) * 0.4 + Math.random() * 0.2;
      }
      pos.setZ(i, height);

      // Vertex colors
      const idx = i * 3;
      if (dist < lakeEdge) {
        colors[idx] = 0.2; colors[idx + 1] = 0.18; colors[idx + 2] = 0.12;
      } else if (dist < lakeEdge + 3) {
        // Sandy shore
        colors[idx] = 0.6; colors[idx + 1] = 0.52; colors[idx + 2] = 0.32;
      } else {
        // Grass with variation
        colors[idx] = 0.22 + Math.random() * 0.06;
        colors[idx + 1] = 0.38 + Math.random() * 0.1;
        colors[idx + 2] = 0.15 + Math.random() * 0.04;
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

/* Detailed mountain range */
function Mountains() {
  const mountains = useMemo(() => [
    { pos: [-25, 0, -55] as [number, number, number], r: 14, h: 18, color: '#4a5a48', snow: true },
    { pos: [8, 0, -60] as [number, number, number], r: 18, h: 24, color: '#3e4e3c', snow: true },
    { pos: [35, 0, -52] as [number, number, number], r: 12, h: 15, color: '#5a6a58', snow: true },
    { pos: [-45, 0, -48] as [number, number, number], r: 10, h: 12, color: '#556654', snow: false },
    { pos: [50, 0, -58] as [number, number, number], r: 11, h: 13, color: '#4e5e4c', snow: false },
    // Foothills
    { pos: [-15, 0, -42] as [number, number, number], r: 8, h: 6, color: '#5a7a4a', snow: false },
    { pos: [20, 0, -44] as [number, number, number], r: 9, h: 7, color: '#4a6a3a', snow: false },
    { pos: [-35, 0, -40] as [number, number, number], r: 7, h: 5, color: '#5a7a4a', snow: false },
  ], []);

  return (
    <group>
      {mountains.map((m, i) => (
        <group key={i}>
          <mesh position={m.pos}>
            <coneGeometry args={[m.r, m.h, 8]} />
            <meshStandardMaterial color={m.color} roughness={0.95} />
          </mesh>
          {m.snow && (
            <mesh position={[m.pos[0], m.h * 0.75, m.pos[2]]}>
              <coneGeometry args={[m.r * 0.35, m.h * 0.2, 8]} />
              <meshStandardMaterial color="#e8eaec" roughness={0.4} />
            </mesh>
          )}
        </group>
      ))}
    </group>
  );
}

/* Mist effect on the lake surface */
function LakeMist() {
  const refs = useRef<THREE.Mesh[]>([]);

  useFrame(({ clock }) => {
    refs.current.forEach((mesh, i) => {
      if (!mesh) return;
      const t = clock.getElapsedTime();
      mesh.material.opacity = 0.06 + Math.sin(t * 0.2 + i * 1.5) * 0.03;
      mesh.position.y = 0.1 + Math.sin(t * 0.15 + i) * 0.1;
    });
  });

  return (
    <group>
      {[0, 1, 2, 3].map((i) => (
        <mesh
          key={i}
          ref={el => { refs.current[i] = el; }}
          position={[(i - 1.5) * 8, 0.1, -5 + i * 3]}
          rotation={[-Math.PI / 2, 0, i * 0.5]}
        >
          <planeGeometry args={[12, 12]} />
          <meshStandardMaterial color="#c8dce8" transparent opacity={0.06} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </group>
  );
}

function LakeVegetation() {
  const items = useMemo(() => {
    const pines: { pos: [number, number, number]; s: number }[] = [];
    const trees: { pos: [number, number, number]; s: number }[] = [];
    const bushes: { pos: [number, number, number]; s: number }[] = [];
    const reeds: { pos: [number, number, number]; s: number }[] = [];
    const rocks: { pos: [number, number, number]; s: number }[] = [];
    const grass: [number, number, number][] = [];
    const lilies: [number, number, number][] = [];

    // Pine trees around the lake
    for (let angle = 0; angle < Math.PI * 2; angle += 0.25) {
      const lakeEdge = 18 + Math.sin(angle * 3) * 2;
      const r = lakeEdge + 4 + Math.random() * 8;
      pines.push({
        pos: [Math.cos(angle) * r, 0.2, Math.sin(angle) * r],
        s: 0.7 + Math.random() * 0.6
      });
      // Second row further back
      if (Math.random() > 0.3) {
        const r2 = lakeEdge + 10 + Math.random() * 10;
        trees.push({
          pos: [Math.cos(angle + 0.1) * r2, 0.3, Math.sin(angle + 0.1) * r2],
          s: 0.8 + Math.random() * 0.7
        });
      }
    }

    // Bushes closer to shore
    for (let angle = 0; angle < Math.PI * 2; angle += 0.4) {
      const lakeEdge = 18 + Math.sin(angle * 3) * 2;
      const r = lakeEdge + 2 + Math.random() * 2;
      bushes.push({
        pos: [Math.cos(angle) * r, 0, Math.sin(angle) * r],
        s: 0.5 + Math.random() * 0.5
      });
    }

    // Reeds at water's edge
    for (let angle = 0; angle < Math.PI * 2; angle += 0.35) {
      const lakeEdge = 18 + Math.sin(angle * 3) * 2;
      const r = lakeEdge - 0.5 + Math.random() * 1.5;
      reeds.push({
        pos: [Math.cos(angle) * r, -0.3, Math.sin(angle) * r],
        s: 0.6 + Math.random() * 0.5
      });
    }

    // Rocks on shore
    for (let angle = 0; angle < Math.PI * 2; angle += 0.6) {
      const lakeEdge = 18 + Math.sin(angle * 3) * 2;
      const r = lakeEdge + 1 + Math.random() * 4;
      rocks.push({
        pos: [Math.cos(angle) * r, -0.1, Math.sin(angle) * r],
        s: 0.4 + Math.random() * 0.8
      });
    }

    // Grass
    for (let angle = 0; angle < Math.PI * 2; angle += 0.3) {
      const lakeEdge = 18 + Math.sin(angle * 3) * 2;
      const r = lakeEdge + 2 + Math.random() * 3;
      grass.push([Math.cos(angle) * r, -0.1, Math.sin(angle) * r]);
    }

    // Lily pads
    for (let angle = 0; angle < Math.PI * 2; angle += 0.7) {
      const lakeEdge = 18 + Math.sin(angle * 3) * 2;
      const r = lakeEdge - 2 - Math.random() * 3;
      lilies.push([Math.cos(angle) * r, -0.45, Math.sin(angle) * r]);
    }

    return { pines, trees, bushes, reeds, rocks, grass, lilies };
  }, []);

  return (
    <group>
      {items.pines.map((t, i) => <PineTree key={`p${i}`} position={t.pos} scale={t.s} />)}
      {items.trees.map((t, i) => <Tree key={`t${i}`} position={t.pos} scale={t.s} foliageColors={['#1a4a10', '#1f5514', '#256618']} />)}
      {items.bushes.map((b, i) => <Bush key={`b${i}`} position={b.pos} scale={b.s} color="#1a5510" />)}
      {items.reeds.map((r, i) => <Reeds key={`r${i}`} position={r.pos} scale={r.s} />)}
      {items.rocks.map((r, i) => <Rock key={`r${i}`} position={r.pos} scale={r.s} color="#7a7a6a" />)}
      {items.grass.map((g, i) => <GrassPatch key={`g${i}`} position={g} color="#3a7020" />)}
      {items.lilies.map((l, i) => <LilyPad key={`l${i}`} position={l} />)}
    </group>
  );
}

export default function LakeScene() {
  return (
    <group>
      <LakeTerrain />
      <Mountains />
      <LakeVegetation />
      <LakeMist />

      {/* Clouds */}
      <Cloud position={[-25, 20, -35]} scale={1.2} speed={0.15} />
      <Cloud position={[15, 22, -45]} scale={1.5} speed={0.2} />
      <Cloud position={[40, 19, -30]} scale={1.0} speed={0.18} />
      <Cloud position={[-10, 24, -55]} scale={1.8} speed={0.12} />

      {/* Birds */}
      <Bird position={[0, 10, -15]} speed={0.5} />
      <Bird position={[-8, 12, -10]} speed={0.7} />
      <Bird position={[5, 11, -20]} speed={0.4} />
    </group>
  );
}
