import { useState } from 'react';
import { motion, useReducedMotion, type Variants } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { PlayerState } from '@/game/types';
import { useI18n } from '@/game/i18n';
import type { MusicTrackId } from '@/game/useBackgroundMusic';
import SurfaceBar from './menu/SurfaceBar';
import DepthGauge from './menu/DepthGauge';
import WorldDial from './menu/WorldDial';
import HubList, { HubItem } from './menu/HubList';
import AccountModal from './menu/AccountModal';
import { useAuth } from '@/game/auth/AuthProvider';
import { iso2ToFlag } from '@/game/auth/countries';

interface Props {
  player: PlayerState;
  onPlay: () => void;
  onCollection: () => void;
  onWarehouse: () => void;
  onSubmarine: () => void;
  onMultiplier: () => void;
  onSkins: () => void;
  onRoulette: () => void;
  onSkinRoulette: () => void;
  onRanking: () => void;
  onAquarium: () => void;
  onDailyGifts: () => void;
  onReset: () => void;
  musicPlaying: boolean;
  onToggleMusic: () => void;
  musicTrack: MusicTrackId;
  onSetMusicTrack: (id: MusicTrackId) => void;
  world: 1 | 2 | 3;
  onSetWorld: (w: 1 | 2 | 3) => void;
}

const WORDMARK = ['DEEP', 'BLUE', 'LURE'];

export default function MainMenu({
  player,
  onPlay,
  onCollection,
  onWarehouse,
  onSubmarine,
  onMultiplier,
  onSkins,
  onRoulette,
  onSkinRoulette,
  onRanking,
  onAquarium,
  onDailyGifts,
  onReset,
  musicPlaying,
  onToggleMusic,
  musicTrack,
  onSetMusicTrack,
  world,
  onSetWorld,
}: Props) {
  const { t } = useI18n();
  const reduce = useReducedMotion();
  const { status, user } = useAuth();

  const [accountOpen, setAccountOpen] = useState(false);

  const today = new Date().toISOString().slice(0, 10);
  const giftAvailable = player.dailyGiftsLastClaim !== today;
  const warehouseUsed = player.warehouse?.length ?? 0;
  const aquariumCount =
    (player.aquariumWarehouse?.length ?? 0) +
    Object.values(player.aquariumSectors ?? {}).reduce((sum, sector) => sum + (sector?.length ?? 0), 0);

  const boatItems: HubItem[] = [
    { label: t('menu.collection'), meta: String(player.collection.length), onClick: onCollection },
    { label: t('menu.warehouse'), meta: `${warehouseUsed}/15`, onClick: onWarehouse },
    { label: t('menu.skins'), onClick: onSkins },
  ];

  const luckItems: HubItem[] = [
    { label: t('menu.multiplier'), onClick: onMultiplier },
    { label: t('menu.roulette'), onClick: onRoulette },
    { label: t('menu.skinRoulette'), onClick: onSkinRoulette },
    { label: t('menu.ranking'), onClick: onRanking },
  ];

  const bg = world === 2 ? 'world-bg-2' : world === 3 ? 'world-bg-3' : 'menu-surface';

  const container: Variants = {
    hidden: {},
    show: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } },
  };
  const item: Variants = {
    hidden: { opacity: 0, y: -22 },
    show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: 'easeOut' } },
  };
  const initial = reduce ? 'show' : 'hidden';

  return (
    <div className={`relative min-h-screen overflow-x-hidden overflow-y-auto px-3 pb-10 sm:px-6 ${bg}`}>
      {world === 1 && (
        <div className="menu-caustic pointer-events-none absolute inset-x-0 top-0 h-[45vh]" aria-hidden="true" />
      )}

      <SurfaceBar
        coins={player.coins}
        giftAvailable={giftAvailable}
        onDailyGifts={onDailyGifts}
        musicPlaying={musicPlaying}
        onToggleMusic={onToggleMusic}
        musicTrack={musicTrack}
        onSetMusicTrack={onSetMusicTrack}
      />

      <div className="relative z-10 mx-auto flex w-full max-w-5xl flex-col gap-6 pt-8 lg:flex-row lg:items-start lg:gap-10 lg:pt-12">
        {/* Descent — surface */}
        <motion.div
          className="flex flex-col gap-6 lg:w-[24rem] lg:shrink-0"
          variants={container}
          initial={initial}
          animate="show"
        >
          <motion.header variants={item} className="text-center">
            <h1
              className="font-display bg-linear-to-b from-foreground via-lure to-[hsl(200_80%_28%)] bg-clip-text text-5xl font-black uppercase leading-[0.82] tracking-wider text-transparent sm:text-6xl"
            >
              {WORDMARK.map(line => (
                <span key={line} className="block">{line}</span>
              ))}
            </h1>
            <p className="mx-auto mt-3 max-w-xs text-sm text-foreground/80">{t('menu.tagline')}</p>
            <p className="mx-auto mt-1 max-w-xs text-xs text-muted-foreground">{t('menu.subtitle')}</p>
          </motion.header>

          <motion.div variants={item}>
            <DepthGauge player={player} />
          </motion.div>

          <motion.div variants={item}>
            <WorldDial world={world} level={player.level} onSetWorld={onSetWorld} />
          </motion.div>

          <motion.div variants={item} className="flex flex-col gap-2.5">
            <Button
              onClick={onPlay}
              size="lg"
              className="h-14 w-full bg-lure text-base font-black uppercase tracking-wide text-lure-foreground shadow-[0_0_30px_hsl(var(--lure)/0.4)] hover:bg-lure/90"
            >
              {t('menu.play')}
            </Button>
            <div className="grid grid-cols-2 gap-2.5">
              <Button
                onClick={onSubmarine}
                variant="outline"
                size="lg"
                className="h-auto min-h-12 w-full whitespace-normal border-lure/30 bg-menu-panel/60 px-2 text-center text-xs font-semibold leading-tight"
              >
                {t('menu.submarine')}
              </Button>
              <Button
                onClick={onAquarium}
                variant="outline"
                size="lg"
                className="h-auto min-h-12 w-full whitespace-normal border-biolume/30 bg-menu-panel/60 px-2 text-center text-xs font-semibold leading-tight"
              >
                {t('menu.aquarium')} ({aquariumCount})
              </Button>
            </div>
          </motion.div>
        </motion.div>

        {/* Descent — the hold */}
        <div className="flex flex-1 flex-col gap-5">
          <HubList title={t('menu.sectionBoat')} items={boatItems} />
          <HubList title={t('menu.sectionLuck')} items={luckItems} />

          <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
            <Button
              onClick={() => setAccountOpen(true)}
              variant="outline"
              size="sm"
              className="gap-1.5 border-lure/25 bg-menu-panel/60"
            >
              {status === 'authenticated' && user ? `${iso2ToFlag(user.country)} ${user.username}` : t('menu.register')}
            </Button>
            {player.level > 1 && status !== 'authenticated' && (
              <Button onClick={onReset} variant="ghost" size="sm" className="text-muted-foreground">
                {t('menu.reset')}
              </Button>
            )}
          </div>
        </div>
      </div>

      <AccountModal open={accountOpen} onClose={() => setAccountOpen(false)} />
    </div>
  );
}
