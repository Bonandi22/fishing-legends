import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { FishingLocation, PlayerState, Rarity } from '@/game/types';
import type { Hooked, NetHooked } from '@/game/fishing';
import { FISH_IMAGES } from '@/game/fishImages';
import { getRarityLabel, useI18n } from '@/game/i18n';
import GameScreen from './shell/GameScreen';
import { screenItem } from './shell/motion';
import { rarityColor } from './locations/rarity';

interface Props {
  location: FishingLocation;
  player: PlayerState;
  onCast: (locationId: string, mode?: 'rod' | 'net' | 'submarine') => Promise<Hooked | null>;
  onLand: (hooked: Hooked, locationId: string, catchId?: string) => Promise<{ outcome: 'landed' | 'failed'; caught?: { fishId: string; weight: number; location: string } }>;
  onBack: () => void;
  onOpenShop?: () => void;
}

type Phase = 'casting' | 'pull' | 'pulled' | 'opened' | 'lost' | 'empty';

export default function NetFishing({ location, player, onCast, onLand, onBack, onOpenShop }: Props) {
  const { lang, t } = useI18n();
  const strengthActive = !!player.strengthMultiplierEnd && player.strengthMultiplierEnd > Date.now();
  const strengthFactor = strengthActive ? (player.strengthMultiplierPower === 4 ? 0.25 : 0.5) : 1;

  const [phase, setPhase] = useState<Phase>('casting');
  const [hooked, setHooked] = useState<NetHooked | null>(null);

  const [linePos, setLinePos] = useState(0);
  const linePosRef = useRef(0);
  const dirRef = useRef(1);
  const frameRef = useRef<number>(0);
  const lastRef = useRef(0);

  const greenSize = hooked?.net.greenZoneSize ?? 0.5;
  const greenStart = (1 - greenSize) / 2;
  const speed = (hooked?.net.speed ?? 1) * strengthFactor;

  const netName = (rarity: Rarity) => `${t('net.type')} — ${getRarityLabel(rarity, lang)}`;

  const cast = useCallback(async () => {
    setPhase('casting');
    const h = await onCast(location.id, 'net');
    if (!h || h.kind !== 'net') {
      setPhase('empty');
      return;
    }
    setHooked(h);
    linePosRef.current = 0;
    dirRef.current = 1;
    setLinePos(0);
    setPhase('pull');
  }, [location.id, onCast]);

  useEffect(() => {
    void cast();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (phase !== 'pull') return;
    lastRef.current = performance.now();
    const tick = (now: number) => {
      const dt = (now - lastRef.current) / 1000;
      lastRef.current = now;
      let p = linePosRef.current + dirRef.current * speed * dt * 0.8;
      if (p >= 1) { p = 1; dirRef.current = -1; }
      if (p <= 0) { p = 0; dirRef.current = 1; }
      linePosRef.current = p;
      setLinePos(p);
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [phase, speed]);

  const handlePull = useCallback(async () => {
    if (!hooked) return;
    const pos = linePosRef.current;
    const inGreen = pos >= greenStart && pos <= greenStart + greenSize;
    cancelAnimationFrame(frameRef.current);
    if (!inGreen) { setPhase('lost'); return; }

    const res = await onLand(hooked, location.id);
    setPhase(res.outcome === 'landed' ? 'pulled' : 'lost');
  }, [hooked, greenStart, greenSize, onLand, location.id]);

  const haul = hooked?.catches ?? [];

  return (
    <GameScreen title={t('net.castTitle')} onBack={onBack} subtitle={location.name} width="narrow">
      <AnimatePresence mode="wait">
        {phase === 'casting' && (
          <motion.p key="casting" variants={screenItem} initial="hidden" animate="show" className="mt-10 text-center text-muted-foreground">
            {t('net.pullHint')}
          </motion.p>
        )}

        {phase === 'pull' && hooked && (
          <motion.div key="pull" variants={screenItem} initial="hidden" animate="show">
            <div className="mb-6 text-center">
              <h2 className="font-display text-xl font-bold tracking-wide text-foreground">{netName(hooked.net.rarity)}</h2>
              <p className="text-xs font-semibold" style={{ color: rarityColor(hooked.net.rarity) }}>
                {hooked.net.fishCount} {t('net.pieces')}
              </p>
              <p className="text-xs text-muted-foreground">{t('net.random')}</p>
              <p className="mt-1 text-sm text-muted-foreground">{t('net.pullHint')}</p>
              {strengthActive && <p className="mt-1 text-xs font-bold text-biolume">{t('net.strengthActive')}</p>}
            </div>

            <div className="relative mb-6 h-14 overflow-hidden rounded-xl border border-lure/20 bg-menu-raised">
              <div className="absolute inset-0 bg-destructive/40" />
              <div className="absolute bottom-0 top-0 bg-biolume/70" style={{ left: `${greenStart * 100}%`, width: `${greenSize * 100}%` }} />
              <div className="absolute bottom-0 top-0 w-1 bg-foreground shadow-[0_0_8px_hsl(var(--lure))]" style={{ left: `${linePos * 100}%` }} />
            </div>

            <div className="text-center">
              <Button
                onClick={handlePull}
                size="lg"
                className="animate-pulse bg-lure px-10 py-6 text-xl font-black uppercase tracking-wide text-lure-foreground hover:bg-lure/90"
              >
                {t('net.pull')}
              </Button>
            </div>
          </motion.div>
        )}

        {phase === 'pulled' && hooked && (
          <motion.div key="pulled" variants={screenItem} initial="hidden" animate="show" className="mt-8 text-center">
            <h2 className="mb-2 font-display text-2xl font-black text-foreground">{t('net.pulled')}</h2>
            <p className="mb-6 text-muted-foreground">{netName(hooked.net.rarity)} — {t('net.pulledMsg')}</p>
            <Button
              onClick={() => setPhase('opened')}
              size="lg"
              className="bg-lure px-10 py-6 text-xl font-black uppercase tracking-wide text-lure-foreground hover:bg-lure/90"
            >
              {t('net.open')}
            </Button>
          </motion.div>
        )}

        {phase === 'opened' && (
          <motion.div key="opened" variants={screenItem} initial="hidden" animate="show" className="mt-2">
            <h2 className="mb-1 font-display text-xl font-bold text-foreground">
              {t('net.received').replace('{n}', String(haul.length))}
            </h2>
            <p className="mb-4 text-sm text-muted-foreground">{t('net.receivedMsg')}</p>
            <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {haul.map((h, i) => (
                <div
                  key={i}
                  className="menu-panel flex flex-col items-center gap-1 rounded-xl p-3 text-center"
                  style={{ borderColor: rarityColor(h.fish.rarity) }}
                >
                  {FISH_IMAGES[h.fish.id] ? (
                    <img src={FISH_IMAGES[h.fish.id]} alt={h.fish.name} className="h-14 w-full object-contain" loading="lazy" />
                  ) : (
                    <div className="flex h-14 items-center justify-center text-3xl">{h.fish.emoji}</div>
                  )}
                  <p className="w-full truncate text-sm font-semibold text-foreground">{h.fish.name}</p>
                  <p className="text-xs tabular-nums text-muted-foreground">{h.weight} kg</p>
                </div>
              ))}
            </div>
            <div className="flex gap-3">
              <Button onClick={cast} className="flex-1 bg-lure font-semibold text-lure-foreground hover:bg-lure/90">
                {t('net.castAnother')} ({player.nets ?? 0})
              </Button>
              <Button variant="outline" onClick={onBack} className="flex-1 border-lure/25 bg-menu-panel/60">
                {t('loc.back')}
              </Button>
            </div>
          </motion.div>
        )}

        {phase === 'empty' && (
          <motion.div key="empty" variants={screenItem} initial="hidden" animate="show" className="mt-8 text-center">
            <h2 className="mb-2 font-display text-2xl font-black text-foreground">{t('net.noNets')}</h2>
            <p className="mb-6 text-muted-foreground">{t('net.noNetsMsg')}</p>
            <div className="flex justify-center gap-3">
              {onOpenShop && (
                <Button onClick={onOpenShop} className="bg-lure font-semibold text-lure-foreground hover:bg-lure/90">
                  {t('net.name')}
                </Button>
              )}
              <Button variant="outline" onClick={onBack} className="border-lure/25 bg-menu-panel/60">
                {t('loc.back')}
              </Button>
            </div>
          </motion.div>
        )}

        {phase === 'lost' && (
          <motion.div key="lost" variants={screenItem} initial="hidden" animate="show" className="mt-8 text-center">
            <h2 className="mb-2 font-display text-2xl font-black text-destructive">{t('net.escaped')}</h2>
            <p className="mb-6 text-muted-foreground">{t('net.escapedMsg')}</p>
            <div className="flex justify-center gap-3">
              <Button onClick={cast} className="bg-lure font-semibold text-lure-foreground hover:bg-lure/90">
                {t('net.retry')}
              </Button>
              <Button variant="outline" onClick={onBack} className="border-lure/25 bg-menu-panel/60">
                {t('loc.back')}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </GameScreen>
  );
}
