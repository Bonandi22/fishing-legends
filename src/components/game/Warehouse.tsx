import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { PlayerState, WAREHOUSE_LIMIT } from '@/game/types';
import { useI18n } from '@/game/i18n';
import GameScreen from './shell/GameScreen';
import { screenItem } from './shell/motion';
import HaulTile from './warehouse/HaulTile';
import { haulXp, haulCoins } from './warehouse/haul';

interface Props {
  player: PlayerState;
  onSell: () => void;
  onBack: () => void;
  selling?: boolean;
}

export default function Warehouse({ player, onSell, onBack, selling = false }: Props) {
  const { t } = useI18n();
  const warehouse = player.warehouse;

  const totalWeight = warehouse.reduce((sum, c) => sum + c.weight, 0);
  const totalXp = warehouse.reduce((sum, c) => sum + haulXp(c), 0);
  const totalCoins = warehouse.reduce((sum, c) => sum + haulCoins(c), 0);

  const action =
    warehouse.length > 0 ? (
      <Button
        onClick={onSell}
        disabled={selling || warehouse.length === 0}
        size="lg"
        className="h-14 w-full bg-lure text-base font-black uppercase tracking-wide text-lure-foreground shadow-[0_0_30px_hsl(var(--lure)/0.4)] hover:bg-lure/90"
      >
        {t('wh.sellAll')} · +{totalXp} XP · 💰 +{totalCoins}
      </Button>
    ) : undefined;

  return (
    <GameScreen
      title={t('wh.name')}
      onBack={onBack}
      coins={player.coins}
      subtitle={`${warehouse.length}/${WAREHOUSE_LIMIT} ${t('wh.stored')}`}
      action={action}
    >
      {warehouse.length === 0 ? (
        <motion.div
          variants={screenItem}
          className="menu-panel mt-4 flex flex-col items-center gap-2 rounded-2xl px-6 py-16 text-center"
        >
          <span className="text-4xl opacity-60" aria-hidden="true">🪣</span>
          <p className="text-lg font-semibold text-foreground">{t('wh.empty')}</p>
          <p className="max-w-xs text-sm text-muted-foreground">{t('wh.emptyMsg')}</p>
        </motion.div>
      ) : (
        <>
          <motion.dl
            variants={screenItem}
            className="menu-panel mb-5 flex flex-wrap gap-x-10 gap-y-3 rounded-2xl p-4 sm:w-fit"
          >
            <div>
              <dt className="text-[0.7rem] uppercase tracking-wide text-muted-foreground">{t('wh.totalWeight')}</dt>
              <dd className="text-lg font-bold tabular-nums text-foreground">{totalWeight.toFixed(1)} kg</dd>
            </div>
            <div>
              <dt className="text-[0.7rem] uppercase tracking-wide text-muted-foreground">{t('wh.yield')}</dt>
              <dd className="whitespace-nowrap text-lg font-bold tabular-nums text-foreground">
                <span className="text-biolume">+{totalXp} XP</span>{' '}
                <span className="text-lure">💰 +{totalCoins}</span>
              </dd>
            </div>
          </motion.dl>

          <motion.div
            variants={screenItem}
            className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5"
          >
            {warehouse.map((caught, i) => (
              <HaulTile key={`${caught.timestamp}-${i}`} caught={caught} />
            ))}
          </motion.div>
        </>
      )}
    </GameScreen>
  );
}
