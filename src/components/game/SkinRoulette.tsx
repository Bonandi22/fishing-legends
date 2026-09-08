import { useState, useRef, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { PlayerState } from '@/game/types';
import { SKIN_ROULETTE_COST, type RewardGrant } from '@/game/rewards';
import { useI18n } from '@/game/i18n';
import GameScreen from './shell/GameScreen';
import { rewardEmoji, rewardLabel } from './dailygifts/rewards';

interface Props {
  player: PlayerState;
  /** Resolves the reward the server (or the local rule) granted, or null on failure. */
  onSpin: () => Promise<RewardGrant | null>;
  busy?: boolean;
  onBack: () => void;
}

const INK = '#0a141b';
const POINTER = '#2bd4ee';
const SLICE_EMOJI = ['🎣', '⛵', '🎣', '⛵', '🎣', '⛵', '🎣', '⛵'];
const SLICE_COLORS = ['#0e7490', '#155e75', '#0891b2', '#164e63', '#0e7490', '#155e75', '#0891b2', '#164e63'];

export default function SkinRoulette({ player, onSpin, busy = false, onBack }: Props) {
  const { t } = useI18n();
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [result, setResult] = useState<RewardGrant | null>(null);
  const [failed, setFailed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const canAfford = player.coins >= SKIN_ROULETTE_COST;

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const spin = useCallback(async () => {
    if (spinning || busy || !canAfford) return;
    setSpinning(true);
    setResult(null);
    setFailed(false);
    setRotation(r => r + 360 * (5 + Math.floor(Math.random() * 4)) + Math.floor(Math.random() * 360));

    const reward = await onSpin();
    timer.current = setTimeout(() => {
      setSpinning(false);
      if (reward) setResult(reward);
      else setFailed(true);
    }, 400);
  }, [spinning, busy, canAfford, onSpin]);

  return (
    <GameScreen title={t('skinRoulette.name')} onBack={onBack} coins={player.coins} width="narrow">
      <div className="flex flex-col items-center gap-5">
        <div className="relative" style={{ width: 300, height: 300 }}>
          <div
            className="absolute inset-0 rounded-full ring-1 ring-lure/25"
            style={{
              transform: `rotate(${rotation}deg)`,
              transition: spinning ? 'transform 3.6s cubic-bezier(0.25, 0.1, 0.25, 1)' : 'none',
            }}
          >
            <svg viewBox="0 0 300 300" width="300" height="300" className="rounded-full">
              {SLICE_EMOJI.map((emoji, i) => {
                const start = (i * 360) / 8;
                const end = ((i + 1) * 360) / 8;
                const r = 140;
                const rad = (d: number) => (d * Math.PI) / 180;
                const x1 = 150 + r * Math.cos(rad(start));
                const y1 = 150 + r * Math.sin(rad(start));
                const x2 = 150 + r * Math.cos(rad(end));
                const y2 = 150 + r * Math.sin(rad(end));
                const mid = start + (end - start) / 2;
                const tx = 150 + r * 0.66 * Math.cos(rad(mid));
                const ty = 150 + r * 0.66 * Math.sin(rad(mid));
                return (
                  <g key={i}>
                    <path d={`M150,150 L${x1},${y1} A${r},${r} 0 0,1 ${x2},${y2} Z`} fill={SLICE_COLORS[i]} stroke={INK} strokeWidth="2" />
                    <text x={tx} y={ty} textAnchor="middle" dominantBaseline="central" fontSize="18" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.6)' }}>{emoji}</text>
                  </g>
                );
              })}
              <circle cx="150" cy="150" r="20" fill="#12212b" stroke={POINTER} strokeWidth="3" />
            </svg>
          </div>
          <div
            className="absolute left-1/2 top-0 z-10 -translate-x-1/2"
            style={{ width: 0, height: 0, borderLeft: '12px solid transparent', borderRight: '12px solid transparent', borderTop: `24px solid ${POINTER}` }}
          />
        </div>

        <div className="text-center">
          <Button
            onClick={spin}
            disabled={!canAfford || spinning || busy}
            size="lg"
            className="bg-lure px-10 text-base font-black uppercase tracking-wide text-lure-foreground hover:bg-lure/90"
          >
            {spinning ? t('roulette.spinning') : `${t('roulette.spin')} · 💰 ${SKIN_ROULETTE_COST}`}
          </Button>
          {!canAfford && <p className="mt-2 text-sm text-destructive">{t('skinRoulette.noCoins')}</p>}
        </div>

        {failed && <p className="text-center text-sm text-destructive">{t('roulette.failed')}</p>}

        {result && (
          <motion.div
            className="menu-panel w-full max-w-xs rounded-2xl border border-lure/40 p-6 text-center"
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', damping: 15 }}
          >
            <div className="mb-2 text-4xl">{rewardEmoji(result)}</div>
            <p className="text-lg font-bold text-foreground">{t('roulette.won')}</p>
            <p className="font-semibold text-lure">{rewardLabel(result, t)}</p>
            {(result.type === 'rodSkin' || result.type === 'boatSkin') && result.duplicate && (
              <p className="mt-2 text-xs text-muted-foreground">{t('roulette.duplicate')}</p>
            )}
          </motion.div>
        )}

        <p className="text-center text-xs text-muted-foreground">{t('skinRoulette.hint')}</p>
      </div>
    </GameScreen>
  );
}
