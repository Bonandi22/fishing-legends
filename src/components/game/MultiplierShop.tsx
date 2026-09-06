import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { PlayerState, MULTIPLIER_COST, MULTIPLIER_COST_4X } from '@/game/types';
import { useI18n } from '@/game/i18n';
import GameScreen from './shell/GameScreen';
import { screenItem } from './shell/motion';
import PriceTag from './shops/PriceTag';

interface Props {
  player: PlayerState;
  onBuy: (type: 'luck' | 'strength', power?: number) => void;
  onBack: () => void;
}

export default function MultiplierShop({ player, onBuy, onBack }: Props) {
  const { t } = useI18n();
  const now = Date.now();
  const luckActive = !!player.luckMultiplierEnd && player.luckMultiplierEnd > now;
  const strengthActive = !!player.strengthMultiplierEnd && player.strengthMultiplierEnd > now;

  const buffs = [
    { type: 'luck' as const, power: 2, emoji: '🍀', name: `2x ${t('mult.luck')}`, desc: t('mult.luckDesc'), active: luckActive, cost: MULTIPLIER_COST },
    { type: 'strength' as const, power: 2, emoji: '💪', name: `2x ${t('mult.strength')}`, desc: t('mult.strengthDesc'), active: strengthActive, cost: MULTIPLIER_COST },
    { type: 'luck' as const, power: 4, emoji: '🍀', name: `4x ${t('mult.luck')}`, desc: t('mult.luckDesc'), active: luckActive && player.luckMultiplierPower === 4, cost: MULTIPLIER_COST_4X },
    { type: 'strength' as const, power: 4, emoji: '💪', name: `4x ${t('mult.strength')}`, desc: t('mult.strengthDesc'), active: strengthActive && player.strengthMultiplierPower === 4, cost: MULTIPLIER_COST_4X },
  ];

  return (
    <GameScreen title={t('mult.name')} onBack={onBack} coins={player.coins} width="narrow">
      <motion.div variants={screenItem} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {buffs.map(b => (
          <div
            key={b.type + b.power}
            className={`menu-panel flex flex-col gap-2 rounded-2xl p-5 ${b.active ? 'ring-2 ring-lure' : ''}`}
          >
            <div className="flex items-center gap-2">
              <span className="text-2xl" aria-hidden="true">{b.emoji}</span>
              <h2 className="font-display text-lg font-bold tracking-wide text-foreground">{b.name}</h2>
            </div>
            <p className="text-xs leading-snug text-muted-foreground">{b.desc}</p>
            <div className="mt-1 flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">⏱️ 1 {t('mult.minute')}</span>
              <PriceTag price={b.cost} />
            </div>
            {b.active ? (
              <motion.span
                className="rounded-lg bg-lure/15 py-2 text-center text-sm font-semibold text-lure"
                animate={{ opacity: [1, 0.6, 1] }}
                transition={{ duration: 1.6, repeat: Infinity }}
              >
                {t('mult.active')}
              </motion.span>
            ) : (
              <Button
                onClick={() => onBuy(b.type, b.power)}
                disabled={player.coins < b.cost}
                className="w-full bg-lure font-semibold text-lure-foreground hover:bg-lure/90"
              >
                {player.coins < b.cost ? t('mult.noCoins') : t('mult.buy')}
              </Button>
            )}
          </div>
        ))}
      </motion.div>
    </GameScreen>
  );
}
