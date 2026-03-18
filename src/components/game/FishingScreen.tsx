import { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { FishingScene3D } from './FishingScene';
import PullMinigame from './PullMinigame';
import { FishingLocation, Fish, PlayerState, RARITY_CONFIG } from '@/game/types';
import { FISH_IMAGES } from '@/game/fishImages';
import { rollFish, rollWeight, getWaitTime } from '@/game/fishingLogic';
import * as THREE from 'three';

type Phase = 'idle' | 'casting' | 'waiting' | 'hooked' | 'pulling' | 'caught' | 'lost';

interface Props {
  location: FishingLocation;
  player: PlayerState;
  onCatch: (fish: Fish, weight: number, locationId: string) => void;
  onBack: () => void;
}

export default function FishingScreen({ location, player, onCatch, onBack }: Props) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [bobberPos, setBobberPos] = useState<[number, number, number]>([0, 0, 0]);
  const [currentFish, setCurrentFish] = useState<Fish | null>(null);
  const [currentWeight, setCurrentWeight] = useState(0);
  const [message, setMessage] = useState('Clique na água para lançar a linha! 🎣');
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  const handleWaterClick = useCallback((point: THREE.Vector3) => {
    if (phase !== 'idle') return;
    setBobberPos([point.x, 0, point.z]);
    setPhase('casting');
    setMessage('Lançando...');

    // Play reel sound for 0.75 seconds
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const duration = 0.75;
      const sampleRate = audioCtx.sampleRate;
      const bufferSize = Math.floor(sampleRate * duration);
      const buffer = audioCtx.createBuffer(1, bufferSize, sampleRate);
      const data = buffer.getChannelData(0);
      // Simulate reel clicking/whirring sound
      for (let i = 0; i < bufferSize; i++) {
        const t = i / sampleRate;
        const clickFreq = 40 + t * 20; // accelerating clicks
        const click = Math.sin(t * clickFreq * Math.PI * 2) > 0.7 ? 0.3 : 0;
        const whir = Math.sin(t * 800 * Math.PI * 2) * 0.05 * (1 - t / duration);
        const noise = (Math.random() - 0.5) * 0.08 * (1 - t / duration);
        data[i] = (click + whir + noise) * (1 - t / duration) * 0.6;
      }
      const source = audioCtx.createBufferSource();
      source.buffer = buffer;
      source.connect(audioCtx.destination);
      source.start();
      source.onended = () => audioCtx.close();
    } catch (e) { /* audio not available */ }

    setTimeout(() => {
      setPhase('waiting');
      setMessage('Esperando o peixe morder... 🐟');

      const wait = getWaitTime();
      timerRef.current = setTimeout(() => {
        const fish = rollFish(location, player.level);
        const weight = rollWeight(fish);
        setCurrentFish(fish);
        setCurrentWeight(weight);
        setPhase('hooked');
        setMessage('Um peixe mordeu! 🐟💥');
      }, wait);
    }, 800);
  }, [phase, location, player.level]);

  const handlePull = useCallback(() => {
    setPhase('pulling');
  }, []);

  const handleWin = useCallback(() => {
    if (!currentFish) return;
    setPhase('caught');
    onCatch(currentFish, currentWeight, location.id);
  }, [currentFish, currentWeight, location.id, onCatch]);

  const handleLose = useCallback(() => {
    setPhase('lost');
  }, []);

  const handleReset = useCallback(() => {
    setPhase('idle');
    setCurrentFish(null);
    setCurrentWeight(0);
    setMessage('Clique na água para lançar a linha! 🎣');
  }, []);

  return (
    <div className="relative w-full h-screen bg-background overflow-hidden">
      {/* 3D Scene */}
      <FishingScene3D
        location={location}
        bobberVisible={phase === 'casting' || phase === 'waiting' || phase === 'hooked'}
        bobberPosition={bobberPos}
        onWaterClick={handleWaterClick}
      />

      {/* HUD overlay */}
      <div className="absolute top-0 left-0 right-0 p-4 flex items-start justify-between z-10 pointer-events-none">
        <div className="pointer-events-auto">
          <Button variant="outline" size="sm" onClick={onBack} className="bg-background/80 backdrop-blur">
            ← Voltar
          </Button>
        </div>
        <div className="bg-background/80 backdrop-blur rounded-lg px-4 py-2 text-right">
          <div className="text-sm font-bold text-foreground">{location.emoji} {location.name}</div>
          <div className="text-xs text-muted-foreground">Nv. {player.level} • XP: {player.xp}/{player.xpToNextLevel}</div>
        </div>
      </div>

      {/* Bottom message */}
      <div className="absolute bottom-0 left-0 right-0 p-4 z-10 pointer-events-none">
        <AnimatePresence mode="wait">
          <motion.div
            key={phase}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="text-center"
          >
            <div className="inline-block bg-background/90 backdrop-blur rounded-xl px-6 py-3 pointer-events-auto">
              <p className="text-foreground font-medium mb-2">{message}</p>

              {phase === 'hooked' && (
                <Button
                  onClick={handlePull}
                  size="lg"
                  className="bg-accent text-accent-foreground hover:bg-accent/90 font-bold text-lg animate-pulse"
                >
                  🎣 PUXAR!
                </Button>
              )}

              {phase === 'waiting' && (
                <div className="flex gap-1 justify-center">
                  {[0, 1, 2].map(i => (
                    <motion.div
                      key={i}
                      className="w-2 h-2 rounded-full bg-primary"
                      animate={{ y: [0, -8, 0] }}
                      transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.2 }}
                    />
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Pull minigame */}
      {phase === 'pulling' && currentFish && (
        <PullMinigame fish={currentFish} onWin={handleWin} onLose={handleLose} />
      )}

      {/* Caught result */}
      <AnimatePresence>
        {phase === 'caught' && currentFish && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="text-center bg-card border-2 border-border rounded-2xl p-8 max-w-sm mx-4"
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', damping: 15 }}
            >
              <motion.div
                className="mb-4"
                animate={{ rotate: [0, -15, 15, 0] }}
                transition={{ duration: 0.5 }}
              >
                {FISH_IMAGES[currentFish.id] ? (
                  <img
                    src={FISH_IMAGES[currentFish.id]}
                    alt={currentFish.name}
                    className="w-40 h-40 object-contain mx-auto drop-shadow-lg"
                  />
                ) : (
                  <span className="text-7xl">{currentFish.emoji}</span>
                )}
              </motion.div>
              <h2 className="text-3xl font-bold text-foreground mb-1">Capturado!</h2>
              <h3 className="text-xl font-bold text-foreground">{currentFish.name}</h3>
              <p className={`text-sm font-bold text-rarity-${currentFish.rarity} mb-2`}>
                {RARITY_CONFIG[currentFish.rarity].label}
              </p>
              <p className="text-muted-foreground text-sm mb-1">{currentWeight} kg</p>
              <p className="text-primary text-sm font-semibold mb-4">+{currentFish.xp} XP</p>
              <p className="text-muted-foreground text-xs mb-6">{currentFish.description}</p>
              <Button onClick={handleReset} size="lg" className="w-full">
                Pescar Novamente 🎣
              </Button>
            </motion.div>
          </motion.div>
        )}

        {phase === 'lost' && currentFish && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="text-center bg-card border-2 border-border rounded-2xl p-8 max-w-sm mx-4"
              initial={{ scale: 0.5 }}
              animate={{ scale: 1 }}
            >
              <div className="text-7xl mb-4">💨</div>
              <h2 className="text-3xl font-bold text-foreground mb-1">Escapou!</h2>
              <h3 className="text-lg text-muted-foreground mb-2">
                O <span className={`font-bold text-rarity-${currentFish.rarity}`}>{currentFish.name}</span> fugiu...
              </h3>
              <p className="text-muted-foreground text-sm mb-6">Tente novamente!</p>
              <Button onClick={handleReset} size="lg" className="w-full">
                Tentar Novamente 🎣
              </Button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
