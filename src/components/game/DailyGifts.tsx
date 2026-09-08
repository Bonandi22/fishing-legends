import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { PlayerState, getDailyGiftsForWeek } from '@/game/types';
import type { RewardGrant } from '@/game/rewards';
import { useI18n } from '@/game/i18n';
import GameScreen from './shell/GameScreen';
import { screenItem } from './shell/motion';
import DayTile from './dailygifts/DayTile';
import RewardIcon from './dailygifts/RewardIcon';
import { rewardLabel } from './dailygifts/rewards';

interface Props {
  player: PlayerState;
  /** Resolves the reward the server (or the local rule) granted, or null on failure. */
  onClaim: () => Promise<RewardGrant | null>;
  onBack: () => void;
}

export default function DailyGifts({ player, onClaim, onBack }: Props) {
  const { t } = useI18n();
  const today = new Date().toISOString().slice(0, 10);
  const claimedToday = player.dailyGiftsLastClaim === today;
  const currentDay = player.dailyGiftsDay || 1;
  const currentWeek = player.dailyGiftsWeek || 1;
  const gifts = getDailyGiftsForWeek(currentWeek);
  const [popup, setPopup] = useState<{ reward: RewardGrant; day: number } | null>(null);
  const [claiming, setClaiming] = useState(false);

  const handleClaim = async () => {
    if (claimedToday || claiming) return;
    setClaiming(true);
    const day = currentDay;
    try {
      const reward = await onClaim();
      if (reward) setPopup({ reward, day });
    } finally {
      setClaiming(false);
    }
  };

  const subtitle =
    currentWeek <= 1
      ? t('daily.subtitleFirst')
      : t('daily.subtitleRotation').replace('{n}', String(currentWeek));

  const action = (
    <Button
      size="lg"
      onClick={handleClaim}
      disabled={claimedToday || claiming}
      className="h-14 w-full bg-lure text-base font-black uppercase tracking-wide text-lure-foreground shadow-[0_0_30px_hsl(var(--lure)/0.4)] hover:bg-lure/90 disabled:bg-menu-raised disabled:text-muted-foreground disabled:shadow-none"
    >
      {claimedToday ? t('daily.comeBack') : `${t('daily.claimDay')} ${currentDay}`}
    </Button>
  );

  return (
    <GameScreen title={t('daily.name')} onBack={onBack} coins={player.coins} subtitle={subtitle} action={action}>
      <motion.div
        variants={screenItem}
        className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7"
      >
        {gifts.map((reward, i) => {
          const day = i + 1;
          const claimedDay = claimedToday ? (currentDay === 1 ? 7 : currentDay - 1) : 0;
          const isCurrent = day === currentDay && !claimedToday;
          const isClaimed = claimedToday ? day <= claimedDay : day < currentDay;
          return (
            <DayTile
              key={day}
              day={day}
              reward={reward}
              state={isCurrent ? 'today' : isClaimed ? 'claimed' : 'locked'}
            />
          );
        })}
      </motion.div>

      <AnimatePresence>
        {popup && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setPopup(null)}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.85, y: 16 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.85 }}
              onClick={e => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="daily-claimed-title"
              className="menu-panel w-full max-w-sm rounded-2xl border border-lure/40 p-8 text-center"
            >
              <div className="mb-3 flex justify-center">
                <RewardIcon r={popup.reward} className="h-9 w-9" />
              </div>
              <h2 id="daily-claimed-title" className="font-display text-2xl font-black text-foreground">
                {t('daily.day')} {popup.day} {t('daily.claimedSuffix')}
              </h2>
              <p className="mb-5 mt-1 text-sm text-muted-foreground">{rewardLabel(popup.reward, t)}</p>
              <Button
                onClick={() => setPopup(null)}
                className="w-full bg-lure font-semibold text-lure-foreground hover:bg-lure/90"
              >
                {t('daily.continue')}
              </Button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </GameScreen>
  );
}
