import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { PlayerState, Fish } from '@/game/types';
import { FISH } from '@/game/data';
import { rollWeight } from '@/game/fishingLogic';
import { useI18n, getRarityLabel } from '@/game/i18n';
import { FISH_IMAGES } from '@/game/fishImages';

interface Props {
  player: PlayerState;
  onCatch: (fish: Fish, weight: number, locationId: string) => void;
  onBack: () => void;
}

interface SwimmingFish {
  id: string;
  fish: Fish;
  x: number;
  y: number;
  speed: number;
  direction: 1 | -1;
  size: number;
  yOffset: number;
  ySpeed: number;
}

let fishCounter = 0;

function spawnFish(canvasW: number, canvasH: number, playerLevel: number): SwimmingFish {
  const available = FISH.filter(f => {
    const rand = Math.random();
    if (f.rarity === 'cosmic') return rand < 0.002;
    if (f.rarity === 'legends') return rand < 0.005;
    if (f.rarity === 'platinum') return rand < 0.01;
    if (f.rarity === 'volcanic') return rand < 0.02;
    if (f.rarity === 'abyssal') return rand < 0.03;
    if (f.rarity === 'legendary') return rand < 0.08;
    if (f.rarity === 'mythic') return rand < 0.15;
    if (f.rarity === 'uncommon') return rand < 0.3;
    return true;
  });
  const fish = available[Math.floor(Math.random() * available.length)] || FISH[0];
  const direction = Math.random() > 0.5 ? 1 : -1 as 1 | -1;
  const size = 40 + Math.random() * 30;

  return {
    id: `sf-${fishCounter++}`,
    fish,
    x: direction === 1 ? -size : canvasW + size,
    y: 80 + Math.random() * (canvasH - 160),
    speed: 0.5 + Math.random() * 1.5,
    direction,
    size,
    yOffset: 0,
    ySpeed: 0.5 + Math.random() * 1,
  };
}

/* ══════ Realistic Harpoon SVG ══════ */
function HarpoonSVG({ size = 120 }: { size?: number }) {
  return (
    <svg width={size} height={size * 0.25} viewBox="0 0 200 50" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Shaft */}
      <rect x="40" y="22" width="155" height="6" rx="3" fill="url(#shaft-grad)" />
      <rect x="40" y="23" width="155" height="2" rx="1" fill="#a0a0a0" opacity="0.3" />
      {/* Grip wrapping */}
      {[140, 148, 156, 164, 172, 180].map((gx, i) => (
        <rect key={i} x={gx} y="21" width="3" height="8" rx="1" fill="#5a3a1a" opacity="0.7" />
      ))}
      {/* Spearhead - main point */}
      <polygon points="0,25 38,20 38,30" fill="url(#head-grad)" />
      {/* Barbs */}
      <polygon points="28,19 38,22 32,14" fill="#b0b8c4" />
      <polygon points="28,31 38,28 32,36" fill="#a0a8b4" />
      {/* Second set of barbs */}
      <polygon points="20,18 30,21 24,12" fill="#909aa8" />
      <polygon points="20,32 30,29 24,38" fill="#808a98" />
      {/* Tip highlight */}
      <line x1="2" y1="25" x2="36" y2="25" stroke="#e8eef4" strokeWidth="1" opacity="0.5" />
      {/* Trigger mechanism */}
      <rect x="120" y="28" width="12" height="10" rx="2" fill="#4a4a4a" />
      <rect x="124" y="30" width="4" height="14" rx="2" fill="#3a3a3a" />
      {/* Rubber bands */}
      <path d="M 100 20 Q 70 10 50 22" stroke="#2a2a2a" strokeWidth="2.5" fill="none" />
      <path d="M 100 30 Q 70 40 50 28" stroke="#2a2a2a" strokeWidth="2.5" fill="none" />
      <defs>
        <linearGradient id="shaft-grad" x1="40" y1="22" x2="40" y2="28" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#c0c0c0" />
          <stop offset="0.5" stopColor="#888888" />
          <stop offset="1" stopColor="#606060" />
        </linearGradient>
        <linearGradient id="head-grad" x1="0" y1="25" x2="38" y2="25" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#d0d8e0" />
          <stop offset="0.4" stopColor="#a0a8b4" />
          <stop offset="1" stopColor="#707880" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/* ══════ Flying Harpoon Projectile SVG ══════ */
function HarpoonProjectileSVG({ size = 80 }: { size?: number }) {
  return (
    <svg width={size} height={size * 0.2} viewBox="0 0 120 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Shaft */}
      <rect x="30" y="10" width="88" height="4" rx="2" fill="url(#proj-shaft)" />
      <rect x="30" y="10.5" width="88" height="1.5" rx="0.75" fill="#b0b0b0" opacity="0.3" />
      {/* Spearhead */}
      <polygon points="0,12 28,9 28,15" fill="url(#proj-head)" />
      {/* Barbs */}
      <polygon points="18,8 28,10 22,4" fill="#b0b8c4" />
      <polygon points="18,16 28,14 22,20" fill="#a0a8b4" />
      {/* Tip highlight */}
      <line x1="2" y1="12" x2="26" y2="12" stroke="#e8eef4" strokeWidth="0.8" opacity="0.5" />
      {/* Trail bubbles */}
      <circle cx="110" cy="12" r="2" fill="#7dd3fc" opacity="0.3" />
      <circle cx="116" cy="10" r="1.5" fill="#7dd3fc" opacity="0.2" />
      <circle cx="118" cy="14" r="1" fill="#7dd3fc" opacity="0.15" />
      <defs>
        <linearGradient id="proj-shaft" x1="30" y1="10" x2="30" y2="14" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#b0b0b0" />
          <stop offset="1" stopColor="#707070" />
        </linearGradient>
        <linearGradient id="proj-head" x1="0" y1="12" x2="28" y2="12" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#d0d8e0" />
          <stop offset="1" stopColor="#808890" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export default function SubmarineFishing({ player, onCatch, onBack }: Props) {
  const { lang, t } = useI18n();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [fishes, setFishes] = useState<SwimmingFish[]>([]);
  const [harpoon, setHarpoon] = useState<{ x: number; y: number; targetX: number; targetY: number; progress: number } | null>(null);
  const [caughtFish, setCaughtFish] = useState<{ fish: Fish; weight: number } | null>(null);
  const animRef = useRef<number>(0);
  const fishesRef = useRef<SwimmingFish[]>([]);
  const harpoonRef = useRef(harpoon);
  const containerRef = useRef<HTMLDivElement>(null);

  fishesRef.current = fishes;
  harpoonRef.current = harpoon;

  useEffect(() => {
    const interval = setInterval(() => {
      if (harpoonRef.current || fishesRef.current.length >= 8) return;
      const el = containerRef.current;
      if (!el) return;
      const newFish = spawnFish(el.clientWidth, el.clientHeight, player.level);
      setFishes(prev => [...prev, newFish]);
    }, 1500);
    return () => clearInterval(interval);
  }, [player.level]);

  useEffect(() => {
    let running = true;
    let time = 0;

    const animate = () => {
      if (!running) return;
      time += 0.016;

      setFishes(prev => {
        const el = containerRef.current;
        if (!el) return prev;
        const w = el.clientWidth;

        return prev
          .map(f => ({
            ...f,
            x: f.x + f.speed * f.direction,
            yOffset: Math.sin(time * f.ySpeed * 3) * 15,
          }))
          .filter(f => {
            if (f.direction === 1 && f.x > w + f.size + 20) return false;
            if (f.direction === -1 && f.x < -f.size - 20) return false;
            return true;
          });
      });

      setHarpoon(prev => {
        if (!prev || prev.progress >= 1) return prev;
        return { ...prev, progress: Math.min(1, prev.progress + 0.06) };
      });

      animRef.current = requestAnimationFrame(animate);
    };

    animRef.current = requestAnimationFrame(animate);
    return () => { running = false; cancelAnimationFrame(animRef.current); };
  }, []);

  // Draw underwater scene
  useEffect(() => {
    const canvas = canvasRef.current;
    const el = containerRef.current;
    if (!canvas || !el) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId: number;
    const draw = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      canvas.width = w;
      canvas.height = h;
      const t = Date.now() * 0.001;

      // Deep underwater gradient
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, '#064273');
      grad.addColorStop(0.3, '#04305a');
      grad.addColorStop(0.6, '#021e3a');
      grad.addColorStop(1, '#010e1a');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      // Caustic light patterns
      ctx.save();
      ctx.globalAlpha = 0.04;
      for (let i = 0; i < 8; i++) {
        const cx = w * (0.1 + i * 0.12) + Math.sin(t * 0.3 + i) * 30;
        const cy = h * 0.15 + Math.sin(t * 0.5 + i * 1.5) * 20;
        const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, 80 + Math.sin(t + i) * 20);
        cg.addColorStop(0, '#4ab8e8');
        cg.addColorStop(1, 'transparent');
        ctx.fillStyle = cg;
        ctx.fillRect(cx - 100, cy - 100, 200, 200);
      }
      ctx.restore();

      // Light rays from surface
      ctx.save();
      for (let i = 0; i < 7; i++) {
        const x = w * 0.05 + i * w * 0.14 + Math.sin(t * 0.2 + i * 0.8) * 15;
        const rayW = 25 + Math.sin(t * 0.4 + i) * 10;
        ctx.globalAlpha = 0.03 + Math.sin(t * 0.3 + i * 1.2) * 0.015;
        ctx.beginPath();
        ctx.moveTo(x - rayW * 0.3, 0);
        ctx.lineTo(x + rayW * 2, h);
        ctx.lineTo(x + rayW * 2.8, h);
        ctx.lineTo(x + rayW * 0.3, 0);
        ctx.fillStyle = '#6dcbf5';
        ctx.fill();
      }
      ctx.restore();

      // Floating particles / plankton
      ctx.save();
      for (let i = 0; i < 40; i++) {
        const px = (Math.sin(t * 0.15 + i * 3.7) * 0.5 + 0.5) * w;
        const py = ((t * 0.02 + i * 0.08) % 1.2 - 0.1) * h;
        const ps = 1 + Math.sin(i * 2.1) * 0.8;
        ctx.globalAlpha = 0.15 + Math.sin(t + i * 1.3) * 0.1;
        ctx.beginPath();
        ctx.arc(px, py, ps, 0, Math.PI * 2);
        ctx.fillStyle = '#a0d8f0';
        ctx.fill();
      }
      ctx.restore();

      // Bubbles — rising with wobble
      ctx.save();
      for (let i = 0; i < 20; i++) {
        const bx = (Math.sin(t * 0.4 + i * 2.3) * 0.5 + 0.5) * w + Math.sin(t * 1.2 + i) * 8;
        const by = h - ((t * 0.08 * (0.5 + (i % 5) * 0.2) + i * 0.12) % 1.3) * h;
        const br = 1.5 + Math.sin(i * 1.5) * 1.5;
        ctx.globalAlpha = 0.2 + Math.sin(t * 0.8 + i) * 0.1;
        ctx.beginPath();
        ctx.arc(bx, by, br, 0, Math.PI * 2);
        ctx.strokeStyle = '#8ecae6';
        ctx.lineWidth = 0.8;
        ctx.stroke();
        // Highlight
        ctx.beginPath();
        ctx.arc(bx - br * 0.3, by - br * 0.3, br * 0.3, 0, Math.PI * 2);
        ctx.fillStyle = '#c8e8f8';
        ctx.globalAlpha = 0.3;
        ctx.fill();
      }
      ctx.restore();

      // Seabed with rocks and texture
      const seabedGrad = ctx.createLinearGradient(0, h - 60, 0, h);
      seabedGrad.addColorStop(0, '#1a2e20');
      seabedGrad.addColorStop(1, '#0e1a10');
      ctx.fillStyle = seabedGrad;
      ctx.beginPath();
      ctx.moveTo(0, h - 40);
      for (let x = 0; x <= w; x += 20) {
        ctx.lineTo(x, h - 40 + Math.sin(x * 0.05) * 8 + Math.sin(x * 0.02) * 5);
      }
      ctx.lineTo(w, h);
      ctx.lineTo(0, h);
      ctx.fill();

      // Rocks
      ctx.fillStyle = '#2a3a2e';
      for (let i = 0; i < 6; i++) {
        const rx = (i + 0.5) * (w / 6) + Math.sin(i * 4.5) * 30;
        const ry = h - 35 + Math.sin(i * 2.3) * 5;
        const rw = 15 + Math.sin(i * 3.1) * 10;
        const rh = 8 + Math.sin(i * 1.7) * 5;
        ctx.beginPath();
        ctx.ellipse(rx, ry, rw, rh, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // Seaweed with organic sway
      for (let i = 0; i < 14; i++) {
        const sx = i * (w / 14) + 15 + Math.sin(i * 5) * 10;
        const baseY = h - 38 + Math.sin(sx * 0.05) * 8;
        const segments = 5 + Math.floor(Math.sin(i * 2) * 2);
        const hue = 100 + Math.sin(i * 3) * 20;
        ctx.strokeStyle = `hsl(${hue}, 40%, ${22 + Math.sin(i) * 5}%)`;
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(sx, baseY);
        for (let s = 1; s <= segments; s++) {
          const sway = Math.sin(t * 1.5 + i * 0.8 + s * 0.5) * (4 + s * 1.5);
          ctx.lineTo(sx + sway, baseY - s * 10);
        }
        ctx.stroke();
        // Leaf blobs
        for (let s = 2; s <= segments; s += 2) {
          const sway = Math.sin(t * 1.5 + i * 0.8 + s * 0.5) * (4 + s * 1.5);
          ctx.fillStyle = `hsl(${hue}, 45%, ${28 + Math.sin(i + s) * 5}%)`;
          ctx.beginPath();
          ctx.ellipse(sx + sway, baseY - s * 10, 5, 3, Math.sin(t + i) * 0.3, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      rafId = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(rafId);
  }, []);

  const handleFishClick = useCallback((sf: SwimmingFish) => {
    if (harpoon || caughtFish) return;
    const el = containerRef.current;
    if (!el) return;

    const startX = el.clientWidth - 80;
    const startY = el.clientHeight / 2;
    const targetX = sf.x;
    const targetY = sf.y + sf.yOffset;

    setHarpoon({ x: startX, y: startY, targetX, targetY, progress: 0 });

    setTimeout(() => {
      const weight = rollWeight(sf.fish);
      onCatch(sf.fish, weight, 'submarine');
      setCaughtFish({ fish: sf.fish, weight });
      setFishes(prev => prev.filter(f => f.id !== sf.id));
      setHarpoon(null);
    }, 600);
  }, [harpoon, caughtFish, onCatch]);

  const handleDismissCatch = useCallback(() => {
    setCaughtFish(null);
  }, []);

  return (
    <div ref={containerRef} className="relative w-full h-screen overflow-hidden">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

      {/* Swimming fish */}
      {fishes.map(sf => (
        <motion.div
          key={sf.id}
          className="absolute cursor-pointer z-10 select-none"
          style={{
            left: sf.x - sf.size / 2,
            top: sf.y + sf.yOffset - sf.size / 2,
            width: sf.size,
            height: sf.size,
            transform: sf.direction === -1 ? 'scaleX(-1)' : 'scaleX(1)',
          }}
          whileHover={{ scale: 1.2 }}
          onClick={() => handleFishClick(sf)}
        >
          {FISH_IMAGES[sf.fish.id] ? (
            <motion.img
              src={FISH_IMAGES[sf.fish.id]}
              alt={sf.fish.name}
              className="w-full h-full object-contain drop-shadow-lg pointer-events-none"
              draggable={false}
              style={{ transformOrigin: '30% 50%' }}
              animate={{
                // Multi-keyframe swim cycle simulating distinct poses
                scaleX: [1, 1.06, 1, 0.94, 1, 1.06, 1],
                scaleY: [1, 0.92, 1, 1.08, 1, 0.92, 1],
                skewX: [0, 8, 0, -8, 0, 8, 0],
                rotate: [-4, -1, 3, 1, -3, -1, -4],
                y: [0, -1.5, 0, 1.5, 0, -1.5, 0],
              }}
              transition={{
                duration: 0.7,
                repeat: Infinity,
                ease: 'easeInOut',
                times: [0, 0.16, 0.33, 0.5, 0.66, 0.83, 1],
              }}
            />
          ) : (
            <motion.span
              className="block text-center leading-none"
              style={{ fontSize: sf.size * 0.7, transformOrigin: '30% 50%' }}
              animate={{
                scaleX: [1, 1.06, 1, 0.94, 1, 1.06, 1],
                scaleY: [1, 0.92, 1, 1.08, 1, 0.92, 1],
                skewX: [0, 8, 0, -8, 0, 8, 0],
                rotate: [-4, -1, 3, 1, -3, -1, -4],
              }}
              transition={{
                duration: 0.7,
                repeat: Infinity,
                ease: 'easeInOut',
                times: [0, 0.16, 0.33, 0.5, 0.66, 0.83, 1],
              }}
            >
              {sf.fish.emoji}
            </motion.span>
          )}
        </motion.div>
      ))}

      {/* Harpoon projectile animation */}
      <AnimatePresence>
        {harpoon && (
          <motion.div
            className="absolute z-20 pointer-events-none"
            style={{
              left: harpoon.x + (harpoon.targetX - harpoon.x) * harpoon.progress - 40,
              top: harpoon.y + (harpoon.targetY - harpoon.y) * harpoon.progress - 10,
              transform: `rotate(${Math.atan2(harpoon.targetY - harpoon.y, harpoon.targetX - harpoon.x) * 180 / Math.PI}deg)`,
            }}
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <HarpoonProjectileSVG size={80} />
            {/* Bubble trail */}
            {[0.15, 0.3, 0.45].map((offset, i) => {
              const trailX = harpoon.x + (harpoon.targetX - harpoon.x) * Math.max(0, harpoon.progress - offset);
              const trailY = harpoon.y + (harpoon.targetY - harpoon.y) * Math.max(0, harpoon.progress - offset);
              return (
                <motion.div
                  key={i}
                  className="absolute rounded-full border border-cyan-300/30"
                  style={{
                    width: 6 - i * 1.5,
                    height: 6 - i * 1.5,
                    left: trailX - (harpoon.x + (harpoon.targetX - harpoon.x) * harpoon.progress - 40) + 70,
                    top: trailY - (harpoon.y + (harpoon.targetY - harpoon.y) * harpoon.progress - 10) + 8,
                  }}
                  animate={{ opacity: [0.4, 0], scale: [1, 1.5] }}
                  transition={{ duration: 0.3, delay: i * 0.05 }}
                />
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Harpoon gun on right side */}
      <div className="absolute right-3 top-1/2 -translate-y-1/2 z-10 pointer-events-none">
        <div className="flex flex-col items-center gap-2">
          <div className="drop-shadow-2xl" style={{ transform: 'rotate(180deg)' }}>
            <HarpoonSVG size={140} />
          </div>
          <span className="text-xs font-bold text-cyan-200 bg-black/40 backdrop-blur px-2 py-0.5 rounded">
            {t('sub.hint').split('!')[0]}
          </span>
        </div>
      </div>

      {/* HUD */}
      <div className="absolute top-0 left-0 right-0 p-4 flex items-start justify-between z-20 pointer-events-none">
        <div className="pointer-events-auto">
          <Button variant="outline" size="sm" onClick={onBack} className="bg-background/80 backdrop-blur">
            {t('sub.back')}
          </Button>
        </div>
        <div className="bg-background/80 backdrop-blur rounded-lg px-4 py-2 text-right">
          <div className="text-sm font-bold text-foreground">🤿 {t('sub.title')}</div>
          <div className="text-xs text-muted-foreground">Nv. {player.level} • XP: {player.xp}/{player.xpToNextLevel}</div>
        </div>
      </div>

      {/* Bottom hint */}
      <div className="absolute bottom-4 left-0 right-0 z-20 flex justify-center pointer-events-none">
        <div className="bg-black/50 backdrop-blur rounded-xl px-5 py-2 text-sm text-cyan-100 font-medium">
          {t('sub.hint')}
        </div>
      </div>

      {/* Caught fish overlay */}
      <AnimatePresence>
        {caughtFish && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="text-center bg-card border-2 border-border rounded-2xl p-8 max-w-sm mx-4"
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', damping: 15 }}
            >
              <motion.div
                className="mb-4"
                animate={{ rotate: [0, -15, 15, 0] }}
                transition={{ duration: 0.5 }}
              >
                {FISH_IMAGES[caughtFish.fish.id] ? (
                  <img
                    src={FISH_IMAGES[caughtFish.fish.id]}
                    alt={caughtFish.fish.name}
                    className="w-40 h-40 object-contain mx-auto drop-shadow-lg"
                  />
                ) : (
                  <span className="text-7xl">{caughtFish.fish.emoji}</span>
                )}
              </motion.div>
              <h2 className="text-3xl font-bold text-foreground mb-1">{t('fish.caught')}</h2>
              <h3 className="text-xl font-bold text-foreground">{caughtFish.fish.name}</h3>
              <p className="text-sm font-bold mb-2" style={{ color: `var(--rarity-${caughtFish.fish.rarity}, currentColor)` }}>
                {getRarityLabel(caughtFish.fish.rarity, lang)}
              </p>
              <p className="text-muted-foreground text-sm mb-1">{caughtFish.weight} kg</p>
              <p className="text-primary text-sm font-semibold mb-4">+{caughtFish.fish.xp} XP</p>
              <Button onClick={handleDismissCatch} size="lg" className="w-full">
                {t('fish.fishAgain')}
              </Button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
