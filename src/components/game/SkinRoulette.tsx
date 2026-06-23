import { useState, useRef, useCallback, useEffect } from 'react';
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

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function SkinRoulette({ player, onAddSkin, onAddBoatSkin, onSpend, onBack }: Props) {
  const { t } = useI18n();
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<Prize | null>(null);
  const [rotation, setRotation] = useState(0);
  const [prizes, setPrizes] = useState<Prize[]>([]);
  const spinTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const buildPrizes = useCallback((): Prize[] => {
    const rods = ROD_SKINS.filter(s => s.price > 0 || s.exclusive);
    const boats = BOAT_SKINS.filter(s => s.price > 0);
    const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];

    const slots: Prize[] = [];
    for (let i = 0; i < 4; i++) {
      const r = pick(rods);
      slots.push({ label: `${r.emoji} ${r.name}`, emoji: r.emoji, color: r.color, kind: 'rod', id: r.id, action: () => onAddSkin(r.id) });
    }
    for (let i = 0; i < 4; i++) {
      const b = pick(boats);
      slots.push({ label: `${b.emoji} ${b.name}`, emoji: b.emoji, color: b.rail[1], kind: 'boat', id: b.id, action: () => onAddBoatSkin(b.id) });
    }
    return shuffle(slots);
  }, [onAddSkin, onAddBoatSkin]);

  useEffect(() => {
    setPrizes(buildPrizes());
  }, [buildPrizes]);

  useEffect(() => {
    return () => {
      if (spinTimeoutRef.current) clearTimeout(spinTimeoutRef.current);
    };
  }, []);

  const spin = useCallback(() => {
    if (spinning) return;
    if (player.coins < SPIN_COST) return;
    if (!onSpend(SPIN_COST)) return;

    setSpinning(true);
    setResult(null);

    const newPrizes = buildPrizes();
    setPrizes(newPrizes);

    const winIndex = Math.floor(Math.random() * newPrizes.length);
    const sliceAngle = 360 / newPrizes.length;
    const midAngle = winIndex * sliceAngle + sliceAngle / 2;
    // Pointer sits at top (270° in SVG coords where 0° is right, clockwise).
    // We want the winning slice's mid angle to align with the pointer after rotation R:
    //   (midAngle + R) mod 360 === 270  =>  R mod 360 = (270 - midAngle + 360) mod 360
    const targetMod = ((270 - midAngle) % 360 + 360) % 360;
    const extraTurns = 5 + Math.floor(Math.random() * 4);
    const base = rotation - (rotation % 360) + extraTurns * 360;
    const targetRotation = base + targetMod;

    setRotation(targetRotation);

    spinTimeoutRef.current = setTimeout(() => {
      setSpinning(false);
      const prize = newPrizes[winIndex];
      prize.action();
      setResult(prize);
    }, 4200);
  }, [spinning, player.coins, onSpend, buildPrizes, rotation]);

  const canSpin = player.coins >= SPIN_COST && !spinning;

  return (
    <div className="min-h-screen bg-background p-4 md:p-8 flex flex-col items-center">
      <div className="w-full max-w-lg">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-foreground">{t('skinRoulette.title')}</h1>
            <p className="text-muted-foreground">{player.coins} {t('mult.coins')}</p>
          </div>
          <Button variant="outline" onClick={onBack}>{t('loc.back')}</Button>
        </div>

        {/* Wheel using CSS rotation for reliable animation */}
        <div className="flex justify-center mb-6">
          <div className="relative" style={{ width: 320, height: 320 }}>
            <div
              className="absolute inset-0 rounded-full shadow-xl"
              style={{
                transform: `rotate(${rotation}deg)`,
                transition: spinning ? 'transform 4s cubic-bezier(0.25, 0.1, 0.25, 1)' : 'none',
              }}
            >
              <svg viewBox="0 0 320 320" width="320" height="320" className="rounded-full">
                {prizes.map((prize, i) => {
                  const startAngle = (i * 360) / prizes.length;
                  const endAngle = ((i + 1) * 360) / prizes.length;
                  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
                  const r = 150;
                  const cx = 160;
                  const cy = 160;
                  const rad = (deg: number) => (deg * Math.PI) / 180;
                  const x1 = cx + r * Math.cos(rad(startAngle));
                  const y1 = cy + r * Math.sin(rad(startAngle));
                  const x2 = cx + r * Math.cos(rad(endAngle));
                  const y2 = cy + r * Math.sin(rad(endAngle));
                  const midAngle = startAngle + (endAngle - startAngle) / 2;
                  const tx = cx + (r * 0.7) * Math.cos(rad(midAngle));
                  const ty = cy + (r * 0.7) * Math.sin(rad(midAngle));
                  return (
                    <g key={i}>
                      <path
                        d={`M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${largeArc},1 ${x2},${y2} Z`}
                        fill={prize.color}
                        stroke="#fff"
                        strokeWidth="2"
                      />
                      <text
                        x={tx}
                        y={ty}
                        textAnchor="middle"
                        dominantBaseline="central"
                        fill="#fff"
                        fontSize="24"
                        fontWeight="bold"
                        style={{ textShadow: '0 1px 3px rgba(0,0,0,0.6)' }}
                      >
                        {prize.emoji}
                      </text>
                    </g>
                  );
                })}
                <circle cx="160" cy="160" r="22" fill="#222" stroke="#fff" strokeWidth="3" />
              </svg>
            </div>
            {/* Pointer */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 z-10" style={{ marginTop: 4 }}>
              <div
                style={{
                  width: 0,
                  height: 0,
                  borderLeft: '12px solid transparent',
                  borderRight: '12px solid transparent',
                  borderTop: '24px solid #ff0000',
                  filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.4))',
                }}
              />
            </div>
          </div>
        </div>

        <div className="text-center mb-4">
          <Button
            onClick={spin}
            disabled={!canSpin}
            size="lg"
            className="text-lg font-bold px-10"
          >
            {spinning ? t('roulette.spinning') : `${t('roulette.spin')} (${SPIN_COST})`}
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


