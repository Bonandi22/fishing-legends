import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { PlayerState } from '@/game/types';
import { useI18n } from '@/game/i18n';
import { getLeaderboard, getPlayerRank, LeaderboardPlayer } from '@/game/leaderboard';
import GameScreen from './shell/GameScreen';
import { screenItem } from './shell/motion';
import ProfileModal from './ranking/ProfileModal';

interface Props {
  player: PlayerState;
  onBack: () => void;
}

const GRID = 'grid grid-cols-[2.5rem_1fr_2.75rem_4.5rem] gap-2 px-3 sm:px-4';
const MEDAL = ['🥇', '🥈', '🥉'];

export default function Ranking({ player, onBack }: Props) {
  const { t } = useI18n();
  const leaderboard = useMemo(() => getLeaderboard(), []);
  const playerRank = useMemo(() => getPlayerRank(player.totalFishCaught), [player.totalFishCaught]);
  const inBoard = leaderboard.some(p => p.isCurrentPlayer);

  const [selected, setSelected] = useState<LeaderboardPlayer | null>(null);
  const [profile, setProfile] = useState<LeaderboardPlayer | null>(null);

  return (
    <GameScreen title={t('rank.title')} onBack={onBack} subtitle={t('rank.subtitle')} width="default">
      <motion.div variants={screenItem} className="menu-panel overflow-hidden rounded-2xl">
        <div className={`${GRID} border-b border-border/60 py-3 text-[0.7rem] font-semibold uppercase tracking-wide text-muted-foreground`}>
          <span>#</span>
          <span>{t('rank.player')}</span>
          <span className="text-right">{t('rank.level')}</span>
          <span className="text-right">{t('rank.fish')}</span>
        </div>

        <div className="max-h-[58vh] overflow-y-auto">
          {leaderboard.length === 0 && (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">{t('rank.empty')}</p>
          )}
          {leaderboard.map((p, i) => (
            <button
              key={p.rank}
              onClick={() => setSelected(p)}
              className={`${GRID} w-full items-center border-t border-border/40 py-3 text-left text-sm transition-colors hover:bg-menu-raised/60 ${
                p.isCurrentPlayer ? 'bg-lure/10 font-semibold' : ''
              } ${selected?.rank === p.rank ? 'bg-menu-raised/80' : ''}`}
            >
              <span className={i < 3 ? 'text-base' : 'text-muted-foreground'}>{MEDAL[i] ?? `#${p.rank}`}</span>
              <span className="flex items-center gap-2 truncate text-foreground">
                <span aria-hidden="true">{p.country}</span>
                <span className="truncate">{p.name}</span>
              </span>
              <span className="text-right tabular-nums text-muted-foreground">{p.level}</span>
              <span className="text-right tabular-nums text-foreground">{p.totalFishCaught.toLocaleString()}</span>
            </button>
          ))}
        </div>
      </motion.div>

      {selected && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-4 flex justify-center">
          <Button onClick={() => setProfile(selected)} className="bg-lure font-semibold text-lure-foreground hover:bg-lure/90">
            👤 {t('rank.profile')} — {selected.name}
          </Button>
        </motion.div>
      )}

      {!inBoard && playerRank > 0 && (
        <motion.div
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          className="menu-panel fixed bottom-4 right-4 z-30 max-w-[15rem] rounded-xl border border-lure/40 p-4"
        >
          <p className="mb-1 text-xs text-muted-foreground">{t('rank.yourPosition')}</p>
          <p className="font-display text-3xl font-black text-lure">#{playerRank}</p>
          <p className="mt-1 text-xs text-foreground">
            {player.totalFishCaught.toLocaleString()} {t('rank.fish')} · {t('rank.level')} {player.level}
          </p>
        </motion.div>
      )}

      <ProfileModal player={profile} onClose={() => setProfile(null)} />
    </GameScreen>
  );
}
