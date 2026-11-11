import { useState } from 'react';
import { Settings, Volume2, VolumeX } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { useI18n, Lang, LANG_LABELS } from '@/game/i18n';
import { MUSIC_TRACKS } from '@/game/useBackgroundMusic';
import type { MusicTrackId } from '@/game/useBackgroundMusic';

const LANGS: Lang[] = ['pt', 'en', 'es', 'fr', 'de', 'ja'];

interface Props {
  musicPlaying: boolean;
  onToggleMusic: () => void;
  musicTrack: MusicTrackId;
  onSetMusicTrack: (id: MusicTrackId) => void;
}

export default function SettingsSheet({ musicPlaying, onToggleMusic, musicTrack, onSetMusicTrack }: Props) {
  const { lang, setLang, t } = useI18n();
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          aria-label={t('menu.settingsTitle')}
          className="h-9 w-9 border-lure/25 bg-menu-panel/70 text-foreground backdrop-blur-sm hover:border-lure/50"
        >
          <Settings className="h-4 w-4" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[min(20rem,88vw)] border-lure/20 bg-menu-panel text-foreground">
        <SheetHeader>
          <SheetTitle className="font-display text-2xl font-semibold tracking-wide text-foreground">
            {t('menu.settingsTitle')}
          </SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          <section>
            <h3 className="mb-2 text-sm font-medium text-muted-foreground">{t('settings.language')}</h3>
            <div className="grid grid-cols-2 gap-1.5">
              {LANGS.map(l => (
                <button
                  key={l}
                  onClick={() => setLang(l)}
                  className={`rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                    l === lang ? 'bg-lure/15 font-semibold text-lure' : 'text-foreground hover:bg-menu-raised/70'
                  }`}
                >
                  {LANG_LABELS[l]}
                </button>
              ))}
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-sm font-medium text-muted-foreground">{t('settings.music')}</h3>
            <Button
              variant="outline"
              onClick={onToggleMusic}
              className="w-full justify-start gap-2 border-lure/25 bg-transparent"
            >
              {musicPlaying ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
              {musicPlaying ? t('mult.active') : t('settings.music')}
            </Button>
          </section>

          <section>
            <h3 className="mb-2 text-sm font-medium text-muted-foreground">{t('menu.musicTrack')}</h3>
            <div className="grid grid-cols-2 gap-1.5">
              {MUSIC_TRACKS.map(tr => (
                <button
                  key={tr.id}
                  onClick={() => onSetMusicTrack(tr.id)}
                  className={`rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                    tr.id === musicTrack ? 'bg-lure/15 font-semibold text-lure' : 'text-foreground hover:bg-menu-raised/70'
                  }`}
                >
                  {tr.label}
                </button>
              ))}
            </div>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
