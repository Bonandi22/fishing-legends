import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { PlayerState, NET_LIMIT, NET_PRICE } from '@/game/types';
import { useI18n } from '@/game/i18n';
import GameScreen from './shell/GameScreen';
import { screenItem } from './shell/motion';

interface Props {
  player: PlayerState;
  onBuy: () => void;
  onBack: () => void;
  buying?: boolean;
}

export default function NetShop({ player, onBuy, onBack, buying = false }: Props) {
  const { t } = useI18n();
  const nets = player.nets ?? 0;
  const full = nets >= NET_LIMIT;
  const canAfford = player.coins >= NET_PRICE;
  const level = Math.round((nets / NET_LIMIT) * 100);

  const label = full
    ? t('net.full')
    : canAfford
      ? `${t('net.buyOne')} · 💰 ${NET_PRICE.toLocaleString()}`
      : t('mult.noCoins');

  return (
    <GameScreen
      title={t('net.name')}
      onBack={onBack}
      coins={player.coins}
      subtitle={t('net.subtitle').replace('{n}', NET_PRICE.toLocaleString())}
      width="narrow"
    >
      <motion.div variants={screenItem} className="menu-panel flex flex-col gap-5 rounded-2xl p-6 text-center">
        <div>
          <p className="font-display text-5xl font-black tabular-nums text-lure">
            {nets}
            <span className="text-2xl text-muted-foreground">/{NET_LIMIT}</span>
          </p>
          <p className="mt-1 text-sm text-muted-foreground">{t('net.available')}</p>
        </div>

        <div className="h-2 overflow-hidden rounded-full bg-menu-raised">
          <div className="h-full rounded-full bg-lure transition-[width]" style={{ width: `${level}%` }} />
        </div>

        <Button
          size="lg"
          onClick={onBuy}
          disabled={full || !canAfford || buying}
          className="w-full bg-lure font-semibold text-lure-foreground hover:bg-lure/90"
        >
          {label}
        </Button>
      </motion.div>
    </GameScreen>
  );
}
