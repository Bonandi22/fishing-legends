import { useState, useRef, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { PlayerState, ROD_SKINS } from '@/game/types';
import { useI18n } from '@/game/i18n';

interface Props {
  player: PlayerState;
  onAddCoins: (amount: number) => void;
  onAddSkin: (skinId: string) => void;
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

export default function Roulette({ player, onAddCoins, onAddSkin, onAddMultiplier, onSetLastRouletteDate, onBack }: Props) {
  const { t } = useI18n();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<Prize | null>(null);
  const angleRef = useRef(0);
  const animRef = useRef<number>(0);

  const today = new Date().toISOString().slice(0, 10);
  const alreadySpun = player.lastRouletteDate === today;

  const unownedSkins = ROD_SKINS.filter(s => !player.ownedSkins.includes(s.id) && s.price > 0);
  const randomSkin = unownedSkins.length > 0 ? unownedSkins[Math.floor(Math.random() * unownedSkins.length)] : null;

  const prizes: Prize[] = [
    { label: '100 💰', emoji: '💰', color: '#FFD700', action: () => onAddCoins(100) },
    { label: '🍀 ' + t('mult.luck'), emoji: '🍀', color: '#4CAF50', action: () => onAddMultiplier('luck') },
    { label: '250 💰', emoji: '💰', color: '#FFA000', action: () => onAddCoins(250) },
    { label: '💪 ' + t('mult.strength'), emoji: '💪', color: '#F44336', action: () => onAddMultiplier('strength') },
    { label: '500 💰', emoji: '💰', color: '#FF9800', action: () => onAddCoins(500) },
    { label: randomSkin ? `${randomSkin.emoji} ${randomSkin.name}` : '1000 💰', emoji: randomSkin?.emoji || '💰', color: randomSkin?.color || '#E91E63', action: () => randomSkin ? onAddSkin(randomSkin.id) : onAddCoins(1000) },
    { label: '1000 💰', emoji: '💰', color: '#9C27B0', action: () => onAddCoins(1000) },
    { label: '150 💰', emoji: '💰', color: '#00BCD4', action: () => onAddCoins(150) },
  ];

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
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Text
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

    // Center circle
    ctx.beginPath();
    ctx.arc(cx, cy, 20, 0, Math.PI * 2);
    ctx.fillStyle = '#333';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Arrow pointer (top)
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

  useEffect(() => {
    drawWheel(0);
  }, [drawWheel]);

  const spin = useCallback(() => {
    if (spinning || alreadySpun) return;
    setSpinning(true);
    setResult(null);

    const winIndex = Math.floor(Math.random() * prizes.length);
    const sliceAngle = (2 * Math.PI) / prizes.length;
    // Target: the arrow (top, -π/2) should point to the middle of winIndex slice
    const targetAngle = -winIndex * sliceAngle - sliceAngle / 2 - Math.PI / 2;
    const totalRotation = targetAngle + Math.PI * 2 * (5 + Math.random() * 3);

    const startAngle = angleRef.current;
    const startTime = performance.now();
    const duration = 4000;

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const currentAngle = startAngle + (totalRotation - startAngle) * eased;
      angleRef.current = currentAngle;
      drawWheel(currentAngle);

      if (progress < 1) {
        animRef.current = requestAnimationFrame(animate);
      } else {
        setSpinning(false);
        onSetLastRouletteDate(today);
        prizes[winIndex].action();
        setResult(prizes[winIndex]);
      }
    };

    animRef.current = requestAnimationFrame(animate);
  }, [spinning, alreadySpun, prizes, drawWheel, today, onSetLastRouletteDate]);

  useEffect(() => {
    return () => cancelAnimationFrame(animRef.current);
  }, []);

  return (
    <div className="min-h-screen bg-background p-4 md:p-8 flex flex-col items-center">
      <div className="w-full max-w-lg">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-foreground">{t('roulette.title')}</h1>
            <p className="text-muted-foreground">💰 {player.coins} {t('mult.coins')}</p>
          </div>
          <Button variant="outline" onClick={onBack}>{t('loc.back')}</Button>
        </div>

        <div className="flex justify-center mb-6">
          <canvas ref={canvasRef} width={300} height={300} className="rounded-full shadow-xl" />
        </div>

        <div className="text-center mb-4">
          {alreadySpun && !result ? (
            <p className="text-muted-foreground font-medium">{t('roulette.used')}</p>
          ) : (
            <Button
              onClick={spin}
              disabled={spinning || alreadySpun}
              size="lg"
              className="text-lg font-bold px-10"
            >
              {spinning ? t('roulette.spinning') : t('roulette.spin')}
            </Button>
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
          </motion.div>
        )}

        <p className="text-center text-xs text-muted-foreground mt-4">{t('roulette.daily')}</p>
      </div>
    </div>
  );
}
