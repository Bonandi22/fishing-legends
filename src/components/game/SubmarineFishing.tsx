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
  // Filter fish available to player level (simple: all fish for now)
  const available = FISH.filter(f => {
    const rand = Math.random();
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

  // Spawn fish periodically
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

  // Animation loop
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

      // Animate harpoon
      setHarpoon(prev => {
        if (!prev || prev.progress >= 1) return prev;
        return { ...prev, progress: Math.min(1, prev.progress + 0.06) };
      });

      animRef.current = requestAnimationFrame(animate);
    };

    animRef.current = requestAnimationFrame(animate);
    return () => { running = false; cancelAnimationFrame(animRef.current); };
  }, []);

  // Draw underwater scene on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    const el = containerRef.current;
    if (!canvas || !el) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      canvas.width = w;
      canvas.height = h;

      // Underwater gradient
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, '#0a4a7a');
      grad.addColorStop(0.5, '#062e52');
      grad.addColorStop(1, '#031a30');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      // Light rays
      ctx.save();
      ctx.globalAlpha = 0.06;
      for (let i = 0; i < 6; i++) {
        const x = w * 0.1 + i * w * 0.15;
        ctx.beginPath();
        ctx.moveTo(x - 20, 0);
        ctx.lineTo(x + 60, h);
        ctx.lineTo(x + 100, h);
        ctx.lineTo(x + 20, 0);
        ctx.fillStyle = '#7dd3fc';
        ctx.fill();
      }
      ctx.restore();

      // Bubbles
      ctx.globalAlpha = 0.3;
      for (let i = 0; i < 15; i++) {
        const bx = (Math.sin(Date.now() * 0.001 + i * 2) * 0.5 + 0.5) * w;
        const by = ((Date.now() * 0.0003 + i * 0.15) % 1) * h;
        const br = 2 + Math.sin(i * 1.5) * 2;
        ctx.beginPath();
        ctx.arc(bx, by, br, 0, Math.PI * 2);
        ctx.fillStyle = '#7dd3fc';
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // Seabed
      ctx.fillStyle = '#1a3a20';
      ctx.fillRect(0, h - 40, w, 40);
      // Seaweed
      for (let i = 0; i < 12; i++) {
        const sx = i * (w / 12) + 20;
        const sheight = 30 + Math.sin(Date.now() * 0.002 + i) * 10;
        ctx.fillStyle = '#2d5a30';
        ctx.beginPath();
        ctx.ellipse(sx, h - 40, 4, sheight, Math.sin(Date.now() * 0.003 + i) * 0.2, 0, Math.PI * 2);
        ctx.fill();
      }

      requestAnimationFrame(draw);
    };

    draw();
  }, []);

  const handleFishClick = useCallback((sf: SwimmingFish) => {
    if (harpoon || caughtFish) return;

    const el = containerRef.current;
    if (!el) return;

    // Harpoon starts from right side
    const startX = el.clientWidth - 60;
    const startY = el.clientHeight / 2;
    const targetX = sf.x;
    const targetY = sf.y + sf.yOffset;

    setHarpoon({ x: startX, y: startY, targetX, targetY, progress: 0 });

    // After harpoon reaches target
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
      {/* Underwater canvas background */}
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
            <img
              src={FISH_IMAGES[sf.fish.id]}
              alt={sf.fish.name}
              className="w-full h-full object-contain drop-shadow-lg pointer-events-none"
              draggable={false}
            />
          ) : (
            <span className="text-4xl block text-center leading-none" style={{ fontSize: sf.size * 0.7 }}>
              {sf.fish.emoji}
            </span>
          )}
        </motion.div>
      ))}

      {/* Harpoon animation */}
      <AnimatePresence>
        {harpoon && (
          <motion.div
            className="absolute z-20 pointer-events-none"
            style={{
              left: harpoon.x + (harpoon.targetX - harpoon.x) * harpoon.progress - 20,
              top: harpoon.y + (harpoon.targetY - harpoon.y) * harpoon.progress - 5,
              transform: `rotate(${Math.atan2(harpoon.targetY - harpoon.y, harpoon.targetX - harpoon.x) * 180 / Math.PI}deg)`,
            }}
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="text-3xl">🔱</div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Harpoon on right side */}
      <div className="absolute right-4 top-1/2 -translate-y-1/2 z-10 pointer-events-none">
        <div className="flex flex-col items-center gap-1">
          <div className="text-6xl drop-shadow-lg">🔱</div>
          <span className="text-xs font-bold text-cyan-200 bg-background/30 backdrop-blur px-2 py-0.5 rounded">
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
        <div className="bg-background/70 backdrop-blur rounded-xl px-5 py-2 text-sm text-foreground font-medium">
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
