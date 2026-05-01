import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { PlayerState, ROD_SKINS } from '@/game/types';
import { useI18n } from '@/game/i18n';
import { getLeaderboard, getPlayerRank, LeaderboardPlayer } from '@/game/leaderboard';

interface Props {
  player: PlayerState;
  onBack: () => void;
}

export default function Ranking({ player, onBack }: Props) {
  const { t } = useI18n();
  const leaderboard = useMemo(() => getLeaderboard(), []);
  const playerRank = useMemo(() => getPlayerRank(player.totalFishCaught), [player.totalFishCaught]);
  const inTop100 = leaderboard.some(p => p.isCurrentPlayer);

  const [selected, setSelected] = useState<LeaderboardPlayer | null>(null);
  const [showProfile, setShowProfile] = useState(false);

  const skinById = (id: string) => ROD_SKINS.find(s => s.id === id);

  return (
    <div className="min-h-screen bg-background p-4 md:p-8 relative">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-foreground">🏆 {t('rank.title')}</h1>
            <p className="text-muted-foreground text-sm">{t('rank.subtitle')}</p>
          </div>
          <Button variant="outline" onClick={onBack}>{t('loc.back')}</Button>
        </div>

        <div className="bg-card border border-border rounded-xl overflow-hidden shadow-lg">
          <div className="grid grid-cols-[60px_1fr_80px_100px] gap-2 px-4 py-3 bg-muted/50 text-xs font-bold text-muted-foreground uppercase">
            <span>#</span>
            <span>{t('rank.player')}</span>
            <span className="text-right">{t('rank.level')}</span>
            <span className="text-right">{t('rank.fish')}</span>
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            {leaderboard.length === 0 && (
              <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                {t('rank.empty')}
              </div>
            )}
            {leaderboard.map((p, i) => {
              const isPlayer = !!p.isCurrentPlayer;
              return (
                <button
                  key={p.rank}
                  onClick={() => { setSelected(p); setShowProfile(false); }}
                  className={`w-full grid grid-cols-[60px_1fr_80px_100px] gap-2 px-4 py-2.5 text-sm items-center text-left hover:bg-accent/50 transition-colors border-t border-border ${
                    selected?.rank === p.rank ? 'bg-accent' : ''
                  } ${isPlayer ? 'bg-primary/10 font-bold' : ''}`}
                >
                  <span className={`font-bold ${i < 3 ? 'text-primary text-base' : 'text-muted-foreground'}`}>
                    {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${p.rank}`}
                  </span>
                  <span className="text-foreground truncate flex items-center gap-2">
                    <span>{p.country}</span>
                    <span className="truncate">{p.name}</span>
                  </span>
                  <span className="text-right text-muted-foreground">{p.level}</span>
                  <span className="text-right text-foreground">{p.totalFishCaught.toLocaleString()}</span>
                </button>
              );
            })}
          </div>
        </div>

        {selected && !showProfile && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 flex justify-center"
          >
            <Button onClick={() => setShowProfile(true)} size="lg" className="font-bold">
              👤 {t('rank.profile')} — {selected.name}
            </Button>
          </motion.div>
        )}
      </div>

      {/* Player position when not in top 100 */}
      {!inTop100 && playerRank > 0 && (
        <motion.div
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          className="fixed bottom-4 right-4 z-30 bg-card border-2 border-primary rounded-xl p-4 shadow-2xl max-w-[260px]"
        >
          <p className="text-xs text-muted-foreground mb-1">{t('rank.yourPosition')}</p>
          <p className="text-2xl font-black text-primary">#{playerRank}</p>
          <p className="text-xs text-foreground mt-1">
            {player.totalFishCaught} {t('rank.fish')} • {t('rank.level')} {player.level}
          </p>
        </motion.div>
      )}

      {/* Profile modal */}
      <AnimatePresence>
        {showProfile && selected && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setShowProfile(false)}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-card border-2 border-primary rounded-2xl p-6 max-w-md w-full shadow-2xl"
            >
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-xs text-muted-foreground">#{selected.rank} • {t('rank.level')} {selected.level}</p>
                  <h2 className="text-2xl font-black text-foreground flex items-center gap-2">
                    <span>{selected.country}</span>{selected.name}
                  </h2>
                </div>
                <button onClick={() => setShowProfile(false)} className="text-muted-foreground hover:text-foreground text-2xl leading-none">×</button>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="bg-muted/50 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground">🐟 {t('rank.fishCaught')}</p>
                  <p className="text-xl font-bold text-foreground">{selected.totalFishCaught.toLocaleString()}</p>
                </div>
                <div className="bg-muted/50 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground">💰 {t('mult.coins')}</p>
                  <p className="text-xl font-bold text-foreground">{selected.coins.toLocaleString()}</p>
                </div>
              </div>

              <div className="mb-4">
                <p className="text-sm font-bold text-foreground mb-2">🎨 {t('rank.skinsOwned')} ({selected.skins.length})</p>
                <div className="flex flex-wrap gap-2">
                  {selected.skins.map(id => {
                    const s = skinById(id);
                    if (!s) return null;
                    return (
                      <div
                        key={id}
                        className="w-10 h-10 rounded-lg flex items-center justify-center text-lg"
                        style={{ backgroundColor: s.color + '33', border: `2px solid ${s.color}` }}
                        title={s.name}
                      >
                        {s.emoji}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                <p className="text-sm font-bold text-foreground mb-2">⚡ {t('rank.multipliersUsed')}</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-muted/50 rounded-lg p-3 text-center">
                    <p className="text-2xl">🍀</p>
                    <p className="text-xs text-muted-foreground">{t('mult.luck')}</p>
                    <p className="text-lg font-bold text-foreground">{selected.multipliers.luck}</p>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-3 text-center">
                    <p className="text-2xl">💪</p>
                    <p className="text-xs text-muted-foreground">{t('mult.strength')}</p>
                    <p className="text-lg font-bold text-foreground">{selected.multipliers.strength}</p>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
