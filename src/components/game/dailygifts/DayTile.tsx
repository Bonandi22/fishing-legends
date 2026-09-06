import { motion } from 'framer-motion';
import { Lock, Check } from 'lucide-react';
import { DailyGiftReward } from '@/game/types';
import { useI18n } from '@/game/i18n';
import RewardIcon from './RewardIcon';
import { rewardLabel, isExclusive } from './rewards';

interface Props {
  day: number;
  reward: DailyGiftReward;
  state: 'claimed' | 'today' | 'locked';
}

export default function DayTile({ day, reward, state }: Props) {
  const { t } = useI18n();
  const exclusive = isExclusive(reward);

  const tone =
    state === 'today'
      ? 'border-lure/70 bg-lure/10 ring-1 ring-lure/40'
      : state === 'claimed'
        ? 'border-border/50 bg-menu-raised/40 opacity-70'
        : exclusive
          ? 'border-biolume/40 bg-biolume/5'
          : 'border-border/50 bg-menu-raised/30';

  return (
    <div className={`relative flex flex-col items-center gap-2 rounded-xl border p-3 text-center ${tone}`}>
      <span className="text-[0.7rem] font-semibold uppercase tracking-wide text-muted-foreground">
        {t('daily.day')} {day}
      </span>
      <span className="flex h-10 items-center justify-center">
        {state === 'locked' ? (
          <Lock className="h-5 w-5 text-muted-foreground/60" aria-hidden="true" />
        ) : state === 'claimed' ? (
          <Check className="h-5 w-5 text-biolume" aria-hidden="true" />
        ) : (
          <RewardIcon r={reward} />
        )}
      </span>
      <span className="min-h-[2.25rem] text-[0.7rem] leading-tight text-muted-foreground">
        {rewardLabel(reward, t)}
      </span>
      {exclusive && (
        <span className="text-[0.6rem] font-bold uppercase text-biolume">{t('daily.exclusive')}</span>
      )}
      {state === 'today' && (
        <motion.span
          animate={{ opacity: [1, 0.5, 1] }}
          transition={{ duration: 1.6, repeat: Infinity }}
          className="absolute -right-1.5 -top-1.5 rounded-full bg-lure px-2 py-0.5 text-[0.6rem] font-bold uppercase text-lure-foreground"
        >
          {t('daily.today')}
        </motion.span>
      )}
    </div>
  );
}
