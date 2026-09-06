import { motion, AnimatePresence } from 'framer-motion';
import { ROD_SKINS, BOAT_SKINS } from '@/game/types';
import { useI18n } from '@/game/i18n';
import type { LeaderboardPlayer } from '@/game/leaderboard';

interface Props {
  player: LeaderboardPlayer | null;
  onClose: () => void;
}

export default function ProfileModal({ player, onClose }: Props) {
  const { t } = useI18n();

  return (
    <AnimatePresence>
      {player && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
        >
          <motion.div
            initial={{ scale: 0.92, y: 16 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.92, y: 16 }}
            onClick={e => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="profile-modal-title"
            className="menu-panel w-full max-w-md rounded-2xl border border-lure/30 p-6"
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs text-muted-foreground">
                  #{player.rank} · {t('rank.level')} {player.level}
                </p>
                <h2 id="profile-modal-title" className="font-display text-2xl font-black tracking-wide text-foreground">
                  <span className="mr-1">{player.country}</span>{player.name}
                </h2>
              </div>
              <button
                onClick={onClose}
                aria-label={t('menu.close')}
                className="text-2xl leading-none text-muted-foreground hover:text-foreground"
              >
                ×
              </button>
            </div>

            <dl className="mb-4 grid grid-cols-2 gap-3">
              <div className="menu-row rounded-lg p-3">
                <dt className="text-xs text-muted-foreground">🐟 {t('rank.fishCaught')}</dt>
                <dd className="text-xl font-bold tabular-nums text-foreground">{player.totalFishCaught.toLocaleString()}</dd>
              </div>
              <div className="menu-row rounded-lg p-3">
                <dt className="text-xs text-muted-foreground">💰 {t('mult.coins')}</dt>
                <dd className="text-xl font-bold tabular-nums text-foreground">{player.coins.toLocaleString()}</dd>
              </div>
            </dl>

            <Section title={`🎨 ${t('rank.skinsOwned')} (${player.skins.length})`}>
              {player.skins.map(id => {
                const s = ROD_SKINS.find(x => x.id === id);
                if (!s) return null;
                return (
                  <span
                    key={id}
                    title={s.name}
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-base"
                    style={{ backgroundColor: `${s.color}22`, border: `1px solid ${s.color}` }}
                  >
                    {s.emoji}
                  </span>
                );
              })}
            </Section>

            <Section title={`🛶 ${t('rank.boatsOwned')} (${player.boatSkins.length})`}>
              {player.boatSkins.map(id => {
                const b = BOAT_SKINS.find(x => x.id === id);
                if (!b) return null;
                return (
                  <span
                    key={id}
                    title={b.name}
                    className="h-9 w-11 rounded-md"
                    style={{ background: `linear-gradient(to bottom, ${b.hull[0]}, ${b.hull[2]})`, border: `1px solid ${b.rail[1]}` }}
                  />
                );
              })}
            </Section>

            <div>
              <p className="mb-2 text-sm font-semibold text-foreground">⚡ {t('rank.multipliersUsed')}</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="menu-row rounded-lg p-3 text-center">
                  <p className="text-lg">🍀</p>
                  <p className="text-xs text-muted-foreground">{t('mult.luck')}</p>
                  <p className="text-lg font-bold tabular-nums text-foreground">{player.multipliers.luck}</p>
                </div>
                <div className="menu-row rounded-lg p-3 text-center">
                  <p className="text-lg">💪</p>
                  <p className="text-xs text-muted-foreground">{t('mult.strength')}</p>
                  <p className="text-lg font-bold tabular-nums text-foreground">{player.multipliers.strength}</p>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <p className="mb-2 text-sm font-semibold text-foreground">{title}</p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}
