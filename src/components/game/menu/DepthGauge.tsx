import { motion, useReducedMotion } from 'framer-motion';
import { PlayerState } from '@/game/types';
import { useI18n } from '@/game/i18n';

const R = 42;
const C = 2 * Math.PI * R;

interface Props {
  player: PlayerState;
}

export default function DepthGauge({ player }: Props) {
  const { t } = useI18n();
  const reduce = useReducedMotion();

  const pct = Math.min(1, player.xp / Math.max(1, player.xpToNextLevel));
  const targetOffset = C * (1 - pct);
  const warehouseUsed = player.warehouse?.length ?? 0;
  const warehousePct = Math.min(100, (warehouseUsed / 15) * 100);

  return (
    <div className="menu-panel mx-auto flex w-full max-w-md items-center gap-4 rounded-2xl p-4 text-left sm:gap-5 sm:p-5">
      <div className="relative shrink-0">
        <svg viewBox="0 0 104 104" className="h-20 w-20 -rotate-90 sm:h-[104px] sm:w-[104px]">
          <circle cx="52" cy="52" r={R} fill="none" stroke="hsl(var(--menu-raised))" strokeWidth="7" />
          <motion.circle
            cx="52"
            cy="52"
            r={R}
            fill="none"
            stroke="hsl(var(--lure))"
            strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray={C}
            initial={reduce ? false : { strokeDashoffset: C }}
            animate={{ strokeDashoffset: targetOffset }}
            transition={{ duration: reduce ? 0 : 1.1, ease: 'easeOut' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[0.55rem] uppercase tracking-[0.15em] text-muted-foreground">{t('menu.level')}</span>
          <span className="font-display text-2xl font-black leading-none text-lure sm:text-3xl">{player.level}</span>
        </div>
      </div>

      <div className="min-w-0 flex-1">
        <dl className="grid grid-cols-3 gap-2 tabular-nums">
          <div className="min-w-0">
            <dt className="truncate text-[0.6rem] uppercase tracking-wide text-muted-foreground">{t('menu.fish')}</dt>
            <dd className="text-base font-bold text-foreground sm:text-lg">{player.totalFishCaught.toLocaleString()}</dd>
          </div>
          <div className="min-w-0">
            <dt className="truncate text-[0.6rem] uppercase tracking-wide text-muted-foreground">{t('menu.species')}</dt>
            <dd className="text-base font-bold text-foreground sm:text-lg">{player.collection.length}</dd>
          </div>
          <div className="min-w-0">
            <dt className="truncate text-[0.6rem] uppercase tracking-wide text-muted-foreground">{t('mult.coins')}</dt>
            <dd className="text-base font-bold text-foreground sm:text-lg">{player.coins.toLocaleString()}</dd>
          </div>
        </dl>

        <div className="mt-3">
          <div className="mb-1 flex items-center justify-between text-[0.65rem] uppercase tracking-wide text-muted-foreground">
            <span>🏠 {t('menu.storage')}</span>
            <span className="tabular-nums">{warehouseUsed}/15</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-menu-raised">
            <div className="h-full rounded-full bg-biolume" style={{ width: `${warehousePct}%` }} />
          </div>
        </div>
      </div>
    </div>
  );
}
