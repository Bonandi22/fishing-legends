import { Lock } from 'lucide-react';
import { useI18n } from '@/game/i18n';

type World = 1 | 2 | 3;

const UNLOCK_LEVEL: Record<World, number> = { 1: 1, 2: 12, 3: 20 };

interface Props {
  world: World;
  level: number;
  onSetWorld: (w: World) => void;
}

export default function WorldDial({ world, level, onSetWorld }: Props) {
  const { t } = useI18n();

  return (
    <div
      role="group"
      aria-label={t('menu.worldLabel')}
      className="mx-auto flex w-full max-w-xs gap-1 rounded-full border border-lure/20 bg-menu-panel/60 p-1"
    >
      {([1, 2, 3] as World[]).map(w => {
        const locked = level < UNLOCK_LEVEL[w];
        const active = world === w;
        return (
          <button
            key={w}
            type="button"
            aria-pressed={active}
            disabled={locked}
            onClick={() => onSetWorld(w)}
            title={locked ? `${t('menu.unlockAt')} ${UNLOCK_LEVEL[w]}` : undefined}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-full px-2 py-1.5 text-xs font-semibold tracking-wide transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
              active
                ? 'bg-lure text-lure-foreground shadow-[0_0_18px_hsl(var(--lure)/0.45)]'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {locked && <Lock className="h-3 w-3" aria-hidden="true" />}
            {t('menu.worldLabel')} {w}
          </button>
        );
      })}
    </div>
  );
}
