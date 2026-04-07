import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { PlayerState } from '@/game/types';
import { useI18n } from '@/game/i18n';
import { Volume2, VolumeX, Globe } from 'lucide-react';

interface Props {
  player: PlayerState;
  onPlay: () => void;
  onCollection: () => void;
  onWarehouse: () => void;
  onReset: () => void;
  musicPlaying: boolean;
  onToggleMusic: () => void;
}

export default function MainMenu({ player, onPlay, onCollection, onWarehouse, onReset, musicPlaying, onToggleMusic }: Props) {
  const { lang, setLang, t } = useI18n();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background relative overflow-hidden">
      {/* Animated background waves */}
      <div className="absolute inset-0 opacity-20">
        {[...Array(5)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-[200%] h-24 rounded-[50%] bg-primary/30"
            style={{ bottom: `${i * 40 - 20}px`, left: '-50%' }}
            animate={{ x: [0, 80, 0], y: [0, -10, 0] }}
            transition={{ duration: 4 + i, repeat: Infinity, ease: 'easeInOut', delay: i * 0.5 }}
          />
        ))}
      </div>

      {/* Settings bar - top right */}
      <div className="absolute top-4 right-4 z-20 flex items-center gap-3">
        {/* Language toggle */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => setLang(lang === 'pt' ? 'en' : 'pt')}
          className="bg-background/80 backdrop-blur gap-1.5"
        >
          <Globe className="w-4 h-4" />
          {lang === 'pt' ? 'PT' : 'EN'}
        </Button>

        {/* Music toggle */}
        <Button
          variant="outline"
          size="sm"
          onClick={onToggleMusic}
          className="bg-background/80 backdrop-blur gap-1.5"
        >
          {musicPlaying ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          {t('settings.music')}
        </Button>
      </div>

      <motion.div
        className="z-10 text-center"
        initial={{ opacity: 0, y: -40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
      >
        <motion.div
          className="text-7xl mb-4"
          animate={{ rotate: [0, -10, 10, 0] }}
          transition={{ duration: 3, repeat: Infinity }}
        >
          🎣
        </motion.div>
        <h1 className="text-5xl md:text-7xl font-black text-foreground tracking-tight mb-2">
          PESCA<span className="text-primary">3D</span>
        </h1>
        <p className="text-muted-foreground text-lg mb-8">
          {t('menu.subtitle')}
        </p>

        {player.level > 1 && (
          <motion.div
            className="mb-6 inline-flex items-center gap-3 rounded-full bg-secondary px-5 py-2 text-sm"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
          >
            <span className="text-primary font-bold">{t('menu.level')} {player.level}</span>
            <span className="text-muted-foreground">•</span>
            <span className="text-muted-foreground">{player.totalFishCaught} {t('menu.fish')}</span>
          </motion.div>
        )}

        <div className="flex flex-col gap-3 items-center">
          <Button
            onClick={onPlay}
            size="lg"
            className="w-64 h-14 text-lg font-bold bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/25"
          >
            {t('menu.play')}
          </Button>
          <Button
            onClick={onCollection}
            variant="secondary"
            size="lg"
            className="w-64 h-12"
          >
            {t('menu.collection')} ({player.collection.length})
          </Button>
          <Button
            onClick={onWarehouse}
            variant="secondary"
            size="lg"
            className="w-64 h-12"
          >
            {t('menu.warehouse')} ({player.warehouse.length}/15)
          </Button>
          {player.level > 1 && (
            <Button
              onClick={onReset}
              variant="ghost"
              size="sm"
              className="text-muted-foreground mt-2"
            >
              {t('menu.reset')}
            </Button>
          )}
        </div>
      </motion.div>
    </div>
  );
}
