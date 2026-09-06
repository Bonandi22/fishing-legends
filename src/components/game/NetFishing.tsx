import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Fish, FishingLocation, PlayerState } from '@/game/types';
import { getFishForLocation } from '@/game/data';
import { rollWeight } from '@/game/fishingLogic';
import { FISH_IMAGES } from '@/game/fishImages';
import { getRarityLabel, useI18n } from '@/game/i18n';
import GameScreen from './shell/GameScreen';
import { screenItem } from './shell/motion';
import { rarityColor } from './locations/rarity';
import { NetType, randomNet } from './netfishing/netTypes';

interface Props {
  location: FishingLocation;
  player: PlayerState;
  onCatch: (fish: Fish, weight: number, locationId: string) => void;
  onCatchBatch?: (catches: { fish: Fish; weight: number }[], locationId: string) => void;
  onBack: () => void;
  onUseNet?: () => void;
  onOpenShop?: () => void;
}

type Phase = 'pull' | 'pulled' | 'opened' | 'lost' | 'empty';

export default function NetFishing({ location, player, onCatch, onCatchBatch, onBack, onUseNet, onOpenShop }: Props) {
  const { lang, t } = useI18n();
  const strengthActive = !!player.strengthMultiplierEnd && player.strengthMultiplierEnd > Date.now();
  const strengthFactor = strengthActive ? (player.strengthMultiplierPower === 4 ? 0.25 : 0.5) : 1;

  const pool = useMemo(() => getFishForLocation(location), [location]);
  const [phase, setPhase] = useState<Phase>('pull');
  const [net, setNet] = useState<NetType | null>(() => randomNet());
  const [haul, setHaul] = useState<{ fish: Fish; weight: number }[]>([]);

  const [linePos, setLinePos] = useState(0.5);
  const linePosRef = useRef(0.5);
  const dirRef = useRef(1);
  const frameRef = useRef<number>(0);
  const lastRef = useRef(0);

  const greenSize = net?.greenZoneSize ?? 0.5;
  const greenStart = (1 - greenSize) / 2;
  const speed = (net?.speed ?? 1) * strengthFactor;

  const netName = (n: NetType) => `${t('net.type')} — ${getRarityLabel(n.rarity, lang)}`;

  const startNet = (selected: NetType) => {
    setNet(selected);
    linePosRef.current = 0;
    dirRef.current = 1;
    setLinePos(0);
    setPhase('pull');
  };

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

  const handlePull = useCallback(() => {
    if (!net) return;
    const pos = linePosRef.current;
    const inGreen = pos >= greenStart && pos <= greenStart + greenSize;
    cancelAnimationFrame(frameRef.current);
    if (!inGreen) { setPhase('lost'); return; }

    const candidates = pool.filter(f => f.rarity === net.rarity);
    const fallback = candidates.length > 0 ? candidates : pool;
    const caught = Array.from({ length: net.fishCount }, () => {
      const f = fallback[Math.floor(Math.random() * fallback.length)];
      return { fish: f, weight: rollWeight(f) };
    });
    setHaul(caught);
    setPhase('pulled');
  }, [net, greenStart, greenSize, pool]);

  const handleOpenNet = () => {
    if (onCatchBatch) onCatchBatch(haul, location.id);
    else haul.forEach(({ fish, weight }) => onCatch(fish, weight, location.id));
    setPhase('opened');
  };

  const reset = () => {
    if ((player.nets ?? 0) <= 0) { setPhase('empty'); return; }
    onUseNet?.();
    setHaul([]);
    startNet(randomNet());
  };

  return (
    <GameScreen title={t('net.castTitle')} onBack={onBack} subtitle={location.name} width="narrow">
      <AnimatePresence mode="wait">
        {phase === 'pull' && net && (
          <motion.div key="pull" variants={screenItem} initial="hidden" animate="show">
            <div className="mb-6 text-center">
              <h2 className="font-display text-xl font-bold tracking-wide text-foreground">{netName(net)}</h2>
              <p className="text-xs font-semibold" style={{ color: rarityColor(net.rarity) }}>
                {net.fishCount} {t('net.pieces')}
              </p>
              <p className="text-xs text-muted-foreground">{t('net.random')}</p>
              <p className="mt-1 text-sm text-muted-foreground">{t('net.pullHint')}</p>
              {strengthActive && <p className="mt-1 text-xs font-bold text-biolume">{t('net.strengthActive')}</p>}
            </div>

            <div className="relative mb-6 h-14 overflow-hidden rounded-xl border border-lure/20 bg-menu-raised">
              <div className="absolute inset-0 bg-destructive/40" />
              <div
                className="absolute bottom-0 top-0 bg-biolume/70"
                style={{ left: `${greenStart * 100}%`, width: `${greenSize * 100}%` }}
              />
              <div
                className="absolute bottom-0 top-0 w-1 bg-foreground shadow-[0_0_8px_hsl(var(--lure))]"
                style={{ left: `${linePos * 100}%` }}
              />
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

        {phase === 'pulled' && net && (
          <motion.div key="pulled" variants={screenItem} initial="hidden" animate="show" className="mt-8 text-center">
            <h2 className="mb-2 font-display text-2xl font-black text-foreground">{t('net.pulled')}</h2>
            <p className="mb-6 text-muted-foreground">{netName(net)} — {t('net.pulledMsg')}</p>
            <Button
              onClick={handleOpenNet}
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
              <Button onClick={reset} className="flex-1 bg-lure font-semibold text-lure-foreground hover:bg-lure/90">
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
              <Button onClick={reset} className="bg-lure font-semibold text-lure-foreground hover:bg-lure/90">
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
