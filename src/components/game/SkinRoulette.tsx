import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { PlayerState, ROD_SKINS, BOAT_SKINS } from '@/game/types';
import { useI18n } from '@/game/i18n';

interface Props {
  player: PlayerState;
  onAddSkin: (skinId: string) => boolean;
  onAddBoatSkin: (skinId: string) => boolean;
  onSpend: (amount: number) => boolean;
  onBack: () => void;
}

interface Prize {
  label: string;
  emoji: string;
  color: string;
  kind: 'rod' | 'boat';
  id: string;
  action: () => void;
}

const SPIN_COST = 1500;

export default function SkinRoulette({ player, onAddSkin, onAddBoatSkin, onSpend, onBack }: Props) {
  const { t } = useI18n();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<Prize | null>(null);
  const [version, setVersion] = useState(0);
  const angleRef = useRef(0);
  const animRef = useRef<number>(0);

  const prizes = useMemo<Prize[]>(() => {
    const rods = ROD_SKINS.filter(s => s.price > 0 || s.exclusive);
    const boats = BOAT_SKINS.filter(s => s.price > 0);
    const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];

    const slots: Prize[] = [];
    for (let i = 0; i < 4; i++) {
      const r = pick(rods);
      slots.push({
        label: `${r.emoji} ${r.name}`, emoji: r.emoji, color: r.color, kind: 'rod', id: r.id,
        action: () => onAddSkin(r.id),
      });
    }
    for (let i = 0; i < 4; i++) {
      const b = pick(boats);
      slots.push({
        label: `${b.emoji} ${b.name}`, emoji: b.emoji, color: b.rail[1], kind: 'boat', id: b.id,
        action: () => onAddBoatSkin(b.id),
      });
    }
    // shuffle
    for (let i = slots.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [slots[i], slots[j]] = [slots[j], slots[i]];
    }
    return slots;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  const drawWheel = useCallback((angle: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const size = canvas.width;
    const cx = size / 2, cy = size / 2, r = size / 2 - 10;
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
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(start + sliceAngle / 2);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 18px sans-serif';
      ctx.shadowColor = 'rgba(0,0,0,0.6)';
      ctx.shadowBlur = 3;
      ctx.fillText(prize.emoji, r * 0.7, 6);
      ctx.restore();
    });

    ctx.beginPath();
    ctx.arc(cx, cy, 22, 0, Math.PI * 2);
    ctx.fillStyle = '#222';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(cx - 12, 5);
    ctx.lineTo(cx + 12, 5);
    ctx.lineTo(cx, 30);
    ctx.closePath();
    ctx.fillStyle = '#ff0000';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();
  }, [prizes]);

  useEffect(() => { drawWheel(angleRef.current); }, [drawWheel]);
  useEffect(() => () => cancelAnimationFrame(animRef.current), []);

  const spin = useCallback(() => {
    if (spinning) return;
    if (player.coins < SPIN_COST) return;
    if (!onSpend(SPIN_COST)) return;

    setSpinning(true);
    setResult(null);

    const TWO_PI = Math.PI * 2;
    const sliceAngle = TWO_PI / prizes.length;
    const winIndex = Math.floor(Math.random() * prizes.length);
    // Angle (mod 2π) such that the arrow at -π/2 lands on the middle of winIndex slice
    const targetMod = ((-winIndex * sliceAngle - sliceAngle / 2 - Math.PI / 2) % TWO_PI + TWO_PI) % TWO_PI;
    const startAngle = angleRef.current;
    const startMod = ((startAngle % TWO_PI) + TWO_PI) % TWO_PI;
    let delta = targetMod - startMod;
    if (delta <= 0) delta += TWO_PI;
    const extraTurns = 5 + Math.floor(Math.random() * 4);
    const totalRotation = startAngle + extraTurns * TWO_PI + delta;

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
        const finalAngle = ((angleRef.current % TWO_PI) + TWO_PI) % TWO_PI;
        const arrowAngle = ((-Math.PI / 2 - finalAngle) % TWO_PI + TWO_PI) % TWO_PI;
        const actualIndex = Math.floor(arrowAngle / sliceAngle) % prizes.length;
        const prize = prizes[actualIndex] ?? prizes[winIndex];
        prize.action();
        setResult(prize);
        setVersion(v => v + 1);
      }
    };
    animRef.current = requestAnimationFrame(animate);
  }, [spinning, player.coins, onSpend, prizes, drawWheel]);

  const canSpin = player.coins >= SPIN_COST && !spinning;

  return (
    <div className="min-h-screen bg-background p-4 md:p-8 flex flex-col items-center">
      <div className="w-full max-w-lg">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-foreground">{t('skinRoulette.title')}</h1>
            <p className="text-muted-foreground">💰 {player.coins} {t('mult.coins')}</p>
          </div>
          <Button variant="outline" onClick={onBack}>{t('loc.back')}</Button>
        </div>

        <div className="flex justify-center mb-6">
          <canvas ref={canvasRef} width={320} height={320} className="rounded-full shadow-xl" />
        </div>

        <div className="text-center mb-4">
          <Button
            onClick={spin}
            disabled={!canSpin}
            size="lg"
            className="text-lg font-bold px-10"
          >
            {spinning ? t('roulette.spinning') : `${t('roulette.spin')} (${SPIN_COST} 💰)`}
          </Button>
          {player.coins < SPIN_COST && (
            <p className="text-destructive text-sm mt-2">{t('skinRoulette.noCoins')}</p>
          )}
        </div>

        {result && (
          <motion.div
            className="text-center bg-card border-2 border-primary rounded-xl p-6 shadow-lg"
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', damping: 15 }}
          >
            <div className="text-4xl mb-2">{result.emoji}</div>
            <p className="text-xl font-bold text-foreground">{t('roulette.won')}</p>
            <p className="text-lg text-primary font-semibold">{result.label}</p>
            <p className="text-xs text-muted-foreground mt-2">
              {result.kind === 'rod' ? t('skinRoulette.rodWon') : t('skinRoulette.boatWon')}
            </p>
          </motion.div>
        )}

        <p className="text-center text-xs text-muted-foreground mt-4">{t('skinRoulette.hint')}</p>
      </div>
    </div>
  );
}
