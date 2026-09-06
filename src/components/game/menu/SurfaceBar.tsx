import { Gift } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/game/i18n';
import SettingsSheet from './SettingsSheet';
import type { MusicTrackId } from '@/game/useBackgroundMusic';

interface Props {
  coins: number;
  giftAvailable: boolean;
  onDailyGifts: () => void;
  musicPlaying: boolean;
  onToggleMusic: () => void;
  musicTrack: MusicTrackId;
  onSetMusicTrack: (id: MusicTrackId) => void;
}

export default function SurfaceBar({
  coins,
  giftAvailable,
  onDailyGifts,
  musicPlaying,
  onToggleMusic,
  musicTrack,
  onSetMusicTrack,
}: Props) {
  const { t } = useI18n();

  return (
    <div className="sticky top-0 z-30 -mx-3 flex items-center justify-between gap-2 border-b border-lure/10 bg-abyss/70 px-3 py-2 backdrop-blur-md sm:-mx-6 sm:px-6">
      <span className="inline-flex items-center gap-1.5 rounded-full border border-lure/20 bg-menu-panel/70 px-3 py-1.5 text-sm font-bold tabular-nums text-foreground">
        <span aria-hidden="true">💰</span>
        {coins.toLocaleString()}
      </span>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onDailyGifts}
          className="relative gap-1.5 border-lure/25 bg-menu-panel/70 text-foreground backdrop-blur hover:border-lure/50"
        >
          <Gift className="h-4 w-4" />
          {t('menu.dailyGifts')}
          {giftAvailable && (
            <span className="absolute -right-1 -top-1 h-2.5 w-2.5 animate-pulse rounded-full bg-biolume" />
          )}
        </Button>
        <SettingsSheet
          musicPlaying={musicPlaying}
          onToggleMusic={onToggleMusic}
          musicTrack={musicTrack}
          onSetMusicTrack={onSetMusicTrack}
        />
      </div>
    </div>
  );
}
