import { Button } from '@/components/ui/button';
import { useI18n } from '@/game/i18n';

interface Props {
  world: 1 | 2 | 3;
  charted: number;
  total: number;
  playerLevel: number;
  onBack: () => void;
}

export default function SurveyHeader({ world, charted, total, playerLevel, onBack }: Props) {
  const { t } = useI18n();
  const ratio = total > 0 ? charted / total : 0;

  return (
    <header className="mb-6 flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {t('loc.world')} {world} · {t('loc.level')} {playerLevel}
        </p>
        <Button variant="outline" size="sm" onClick={onBack} className="border-lure/25 bg-menu-panel/60">
          {t('loc.back')}
        </Button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-x-8">
        <h1 className="font-display text-4xl font-black uppercase leading-[0.85] tracking-tight text-foreground sm:text-5xl">
          {t('loc.title')}
        </h1>
        <div className="flex w-full flex-col gap-1.5 sm:max-w-[16rem]">
          <p className="text-xs text-muted-foreground">
            <span className="tabular-nums text-foreground">{charted}/{total}</span> {t('loc.charted')}
          </p>
          <div className="h-[3px] w-full overflow-hidden rounded-full bg-lure/15">
            <div className="h-full rounded-full bg-lure" style={{ width: `${ratio * 100}%` }} />
          </div>
        </div>
      </div>
    </header>
  );
}
