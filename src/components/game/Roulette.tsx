import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { PlayerState, ROD_SKINS, BOAT_SKINS } from '@/game/types';
import { useI18n } from '@/game/i18n';
import GameScreen from './shell/GameScreen';

interface Props {
  player: PlayerState;
  onAddCoins: (amount: number) => void;
  onAddSkin: (skinId: string) => void;
  onAddBoatSkin: (skinId: string) => void;
  onAddMultiplier: (type: 'luck' | 'strength') => void;
  onSetLastRouletteDate: (date: string) => void;
  onBack: () => void;
}

interface Prize {
  label: string;
  emoji: string;
  color: string;
  action: () => void;
}

// Canvas can't read CSS custom properties — these track the deep-blue tokens.
const INK = '#0a141b';       // --abyss
const HUB = '#12212b';       // --menu-panel
const POINTER = '#2bd4ee';   // --lure

export default function Roulette({ player, onAddCoins, onAddSkin, onAddBoatSkin, onAddMultiplier, onSetLastRouletteDate, onBack }: Props) {
  const { t } = useI18n();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<Prize | null>(null);
  const angleRef = useRef(0);
  const animRef = useRef<number>(0);

  const today = new Date().toISOString().slice(0, 10);
  const alreadySpun = player.lastRouletteDate === today;

  // Freeze prizes for the lifetime of the component to ensure the prize matches the arrow.
  const prizes = useMemo<Prize[]>(() => {
    const unownedRods = ROD_SKINS.filter(s => !player.ownedSkins.includes(s.id) && (s.price > 0 || s.exclusive));
    const randomRod = unownedRods.length > 0 ? unownedRods[Math.floor(Math.random() * unownedRods.length)] : null;
    const unownedBoats = BOAT_SKINS.filter(s => !player.ownedBoatSkins.includes(s.id) && s.price > 0);
    const randomBoat = unownedBoats.length > 0 ? unownedBoats[Math.floor(Math.random() * unownedBoats.length)] : null;
    return [
      { label: '100 💰', emoji: '💰', color: '#d9a441', action: () => onAddCoins(100) },
      { label: '🍀 ' + t('mult.luck'), emoji: '🍀', color: '#2dd4bf', action: () => onAddMultiplier('luck') },
      { label: '250 💰', emoji: '💰', color: '#c08a35', action: () => onAddCoins(250) },
      { label: '💪 ' + t('mult.strength'), emoji: '💪', color: '#f59e0b', action: () => onAddMultiplier('strength') },
      randomBoat
        ? { label: `${randomBoat.emoji} ${randomBoat.name}`, emoji: randomBoat.emoji, color: randomBoat.rail[1], action: () => onAddBoatSkin(randomBoat.id) }
        : { label: '500 💰', emoji: '💰', color: '#0e7490', action: () => onAddCoins(500) },
      randomRod
        ? { label: `${randomRod.emoji} ${randomRod.name}`, emoji: randomRod.emoji, color: randomRod.color, action: () => onAddSkin(randomRod.id) }
        : { label: '1000 💰', emoji: '💰', color: '#155e75', action: () => onAddCoins(1000) },
      { label: '1000 💰', emoji: '💰', color: '#0891b2', action: () => onAddCoins(1000) },
      { label: '150 💰', emoji: '💰', color: '#164e63', action: () => onAddCoins(150) },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const drawWheel = useCallback((angle: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = canvas.width;
    const cx = size / 2;
    const cy = size / 2;
    const r = size / 2 - 10;
    const sliceAngle = (2 * Math.PI) / prizes.length;

    ctx.clearRect(0, 0, size, size);

    prizes.forEach((prize, i) => {
      const start = angle + i * sliceAngle;
      const end = start + sliceAngle;

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, start, end);
      ctx.closePath();
      ctx.fillStyle = prize.color;
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(start + sliceAngle / 2);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 14px sans-serif';
      ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.shadowBlur = 3;
      ctx.fillText(prize.emoji, r * 0.65, 5);
      ctx.restore();
    });

    ctx.beginPath();
    ctx.arc(cx, cy, 20, 0, Math.PI * 2);
    ctx.fillStyle = HUB;
    ctx.fill();
    ctx.strokeStyle = POINTER;
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(cx - 12, 5);
    ctx.lineTo(cx + 12, 5);
    ctx.lineTo(cx, 30);
    ctx.closePath();
    ctx.fillStyle = POINTER;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.stroke();
  }, [prizes]);

  useEffect(() => {
    drawWheel(0);
  }, [drawWheel]);

  const spin = useCallback(() => {
    if (spinning || alreadySpun) return;
    setSpinning(true);
    setResult(null);

    const sliceAngle = (2 * Math.PI) / prizes.length;
    const winIndex = Math.floor(Math.random() * prizes.length);
    const baseTarget = -winIndex * sliceAngle - sliceAngle / 2 - Math.PI / 2;
    const extraTurns = 5 + Math.floor(Math.random() * 4);
    const totalRotation = baseTarget + Math.PI * 2 * extraTurns;

    const startAngle = angleRef.current;
    const startTime = performance.now();
    const duration = 4000;

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const currentAngle = startAngle + (totalRotation - startAngle) * eased;
      angleRef.current = currentAngle;
      drawWheel(currentAngle);

      if (progress < 1) {
        animRef.current = requestAnimationFrame(animate);
      } else {
        setSpinning(false);
        onSetLastRouletteDate(today);
        const TWO_PI = Math.PI * 2;
        const finalAngle = ((angleRef.current % TWO_PI) + TWO_PI) % TWO_PI;
        const arrowAngle = ((-Math.PI / 2 - finalAngle) % TWO_PI + TWO_PI) % TWO_PI;
        const actualIndex = Math.floor(arrowAngle / sliceAngle) % prizes.length;
        const prize = prizes[actualIndex] ?? prizes[winIndex];
        prize.action();
        setResult(prize);
      }
    };

    animRef.current = requestAnimationFrame(animate);
  }, [spinning, alreadySpun, prizes, drawWheel, today, onSetLastRouletteDate]);

  useEffect(() => {
    return () => cancelAnimationFrame(animRef.current);
  }, []);

  return (
    <GameScreen title={t('roulette.name')} onBack={onBack} coins={player.coins} width="narrow">
      <div className="flex flex-col items-center gap-5">
        <canvas
          ref={canvasRef}
          width={300}
          height={300}
          className="rounded-full ring-1 ring-lure/25"
        />

        {alreadySpun && !result ? (
          <p className="text-center font-medium text-muted-foreground">{t('roulette.used')}</p>
        ) : (
          <Button
            onClick={spin}
            disabled={spinning || alreadySpun}
            size="lg"
            className="bg-lure px-10 text-base font-black uppercase tracking-wide text-lure-foreground hover:bg-lure/90"
          >
            {spinning ? t('roulette.spinning') : t('roulette.spin')}
          </Button>
        )}

        {result && (
          <motion.div
            className="menu-panel w-full max-w-xs rounded-2xl border border-lure/40 p-6 text-center"
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', damping: 15 }}
          >
            <div className="mb-2 text-4xl">{result.emoji}</div>
            <p className="text-lg font-bold text-foreground">{t('roulette.won')}</p>
            <p className="font-semibold text-lure">{result.label}</p>
          </motion.div>
        )}

        <p className="text-center text-xs text-muted-foreground">{t('roulette.daily')}</p>
      </div>
    </GameScreen>
  );
}
