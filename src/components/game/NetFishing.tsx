import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Fish, FishingLocation, PlayerState, Rarity } from '@/game/types';
import { getFishForLocation } from '@/game/data';
import { rollWeight } from '@/game/fishingLogic';
import { FISH_IMAGES } from '@/game/fishImages';
import { getRarityLabel, useI18n } from '@/game/i18n';

export interface NetType {
  id: string;
  name: string;
  rarity: Rarity;
  fishCount: number;
  greenZoneSize: number;
  speed: number;
}

export const NET_TYPES: NetType[] = [
  { id: 'net_common', name: 'Rede Comum', rarity: 'common', fishCount: 20, greenZoneSize: 0.55, speed: 1.0 },
  { id: 'net_uncommon', name: 'Rede Incomum', rarity: 'uncommon', fishCount: 15, greenZoneSize: 0.45, speed: 1.3 },
  { id: 'net_mythic', name: 'Rede Mítica', rarity: 'mythic', fishCount: 10, greenZoneSize: 0.36, speed: 1.6 },
  { id: 'net_legendary', name: 'Rede Lendária', rarity: 'legendary', fishCount: 8, greenZoneSize: 0.28, speed: 1.9 },
  { id: 'net_abyssal', name: 'Rede Abissal', rarity: 'abyssal', fishCount: 5, greenZoneSize: 0.22, speed: 2.2 },
  { id: 'net_volcanic', name: 'Rede Vulcânica', rarity: 'volcanic', fishCount: 4, greenZoneSize: 0.18, speed: 2.5 },
  { id: 'net_platinum', name: 'Rede Platina', rarity: 'platinum', fishCount: 2, greenZoneSize: 0.14, speed: 2.8 },
  { id: 'net_legends', name: 'Rede das Lendas', rarity: 'legends', fishCount: 1, greenZoneSize: 0.10, speed: 3.2 },
];

interface Props {
  location: FishingLocation;
  player: PlayerState;
  onCatch: (fish: Fish, weight: number, locationId: string) => void;
  onBack: () => void;
}

type Phase = 'select' | 'pull' | 'pulled' | 'opened' | 'lost';

export default function NetFishing({ location, player, onCatch, onBack }: Props) {
  const { lang } = useI18n();
  const strengthActive = !!player.strengthMultiplierEnd && player.strengthMultiplierEnd > Date.now();

  const pool = useMemo(() => getFishForLocation(location), [location]);
  const [phase, setPhase] = useState<Phase>('select');
  const [net, setNet] = useState<NetType | null>(null);
  const [haul, setHaul] = useState<{ fish: Fish; weight: number }[]>([]);

  const [linePos, setLinePos] = useState(0.5);
  const linePosRef = useRef(0.5);
  const dirRef = useRef(1);
  const frameRef = useRef<number>(0);
  const lastRef = useRef(0);

  const greenSize = net?.greenZoneSize ?? 0.5;
  const greenStart = (1 - greenSize) / 2;
  const speed = (net?.speed ?? 1) * (strengthActive ? 0.5 : 1);

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
    haul.forEach(({ fish, weight }) => onCatch(fish, weight, location.id));
    setPhase('opened');
  };

  const reset = () => { setNet(null); setHaul([]); setPhase('select'); };

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">Lançar a Rede</h1>
            <p className="text-muted-foreground text-sm">{location.name}</p>
          </div>
          <Button variant="outline" onClick={onBack}>Voltar</Button>
        </div>

        <AnimatePresence mode="wait">
          {phase === 'select' && (
            <motion.div key="select" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {NET_TYPES.map((n, i) => (
                <motion.div key={n.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                  <Card className="border-2 border-border hover:border-primary cursor-pointer transition-all" onClick={() => startNet(n)}>
                    <CardContent className="p-4">
                      <h3 className="font-bold text-foreground">{n.name}</h3>
                      <p className={`text-xs font-semibold text-rarity-${n.rarity}`}>{getRarityLabel(n.rarity, lang)}</p>
                      <p className="text-sm text-muted-foreground mt-2">Vem com {n.fishCount} {n.fishCount === 1 ? 'peixe' : 'peixes'} desta raridade</p>
                      <p className="text-xs text-muted-foreground mt-1">Dificuldade: {i + 1}/8</p>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </motion.div>
          )}

          {phase === 'pull' && net && (
            <motion.div key="pull" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4">
              <div className="text-center mb-6">
                <h2 className="text-xl font-bold text-foreground">{net.name}</h2>
                <p className="text-muted-foreground text-sm">Aperte PUXAR quando a barra branca estiver na zona verde</p>
                {strengthActive && <p className="text-xs text-primary font-bold mt-1">Força ativa</p>}
              </div>

              <div className="relative h-14 rounded-xl overflow-hidden border-2 border-border bg-secondary mb-6">
                <div className="absolute inset-0 bg-destructive/80" />
                <div className="absolute top-0 bottom-0 bg-accent" style={{ left: `${greenStart * 100}%`, width: `${greenSize * 100}%` }} />
                <div className="absolute top-0 bottom-0 w-1 bg-foreground shadow-lg shadow-foreground/50" style={{ left: `${linePos * 100}%` }} />
              </div>

              <div className="text-center">
                <Button onClick={handlePull} size="lg" className="bg-accent text-accent-foreground hover:bg-accent/90 font-bold text-xl px-10 py-6 animate-pulse">
                  Puxar
                </Button>
              </div>
            </motion.div>
          )}

          {phase === 'pulled' && net && (
            <motion.div key="pulled" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center mt-8">
              <h2 className="text-2xl font-bold text-foreground mb-2">Rede puxada!</h2>
              <p className="text-muted-foreground mb-6">{net.name} — algo se move lá dentro...</p>
              <Button onClick={handleOpenNet} size="lg" className="font-bold text-xl px-10 py-6">Abrir Rede</Button>
            </motion.div>
          )}

          {phase === 'opened' && (
            <motion.div key="opened" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4">
              <h2 className="text-xl font-bold text-foreground mb-1">Você recebeu {haul.length} {haul.length === 1 ? 'peixe' : 'peixes'}</h2>
              <p className="text-muted-foreground text-sm mb-4">Os peixes foram enviados para o armazém.</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
                {haul.map((h, i) => (
                  <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
                    <Card className="border-2 border-border">
                      <CardContent className="p-3 text-center">
                        {FISH_IMAGES[h.fish.id] ? (
                          <img src={FISH_IMAGES[h.fish.id]} alt={h.fish.name} className="w-full h-16 object-contain" loading="lazy" />
                        ) : (
                          <div className="h-16 flex items-center justify-center text-3xl">{h.fish.emoji}</div>
                        )}
                        <p className="text-sm font-semibold text-foreground truncate">{h.fish.name}</p>
                        <p className="text-xs text-muted-foreground">{h.weight} kg</p>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>
              <div className="flex gap-3">
                <Button onClick={reset} className="flex-1">Lançar outra rede</Button>
                <Button variant="outline" onClick={onBack} className="flex-1">Voltar</Button>
              </div>
            </motion.div>
          )}

          {phase === 'lost' && (
            <motion.div key="lost" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center mt-8">
              <h2 className="text-2xl font-bold text-destructive mb-2">A rede escapou!</h2>
              <p className="text-muted-foreground mb-6">Você puxou fora da zona verde.</p>
              <div className="flex gap-3 justify-center">
                <Button onClick={reset}>Tentar novamente</Button>
                <Button variant="outline" onClick={onBack}>Voltar</Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
