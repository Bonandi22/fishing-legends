import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/game/i18n';
import CoinChip from './CoinChip';

interface Props {
  title: string;
  subtitle?: ReactNode;
  coins?: number;
  onBack: () => void;
}

export default function ScreenHeader({ title, subtitle, coins, onBack }: Props) {
  const { t } = useI18n();

  return (
    <header className="mb-6 flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        {coins !== undefined ? <CoinChip coins={coins} /> : <span />}
        <Button
          variant="outline"
          size="sm"
          onClick={onBack}
          className="border-lure/25 bg-menu-panel/60"
        >
          {t('loc.back')}
        </Button>
      </div>

      <div>
        <h1 className="font-display text-4xl font-black uppercase leading-[0.85] tracking-tight text-foreground sm:text-5xl">
          {title}
        </h1>
        {subtitle !== undefined && (
          <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>
        )}
      </div>
    </header>
  );
}
