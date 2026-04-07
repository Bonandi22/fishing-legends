import { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { FishingScene3D } from './FishingScene';
import PullMinigame from './PullMinigame';
import { FishingLocation, Fish, PlayerState, RARITY_CONFIG } from '@/game/types';
import { FISH_IMAGES } from '@/game/fishImages';
import { rollFish, rollWeight, getWaitTime } from '@/game/fishingLogic';
import { useI18n, getRarityLabel } from '@/game/i18n';
import * as THREE from 'three';

type Phase = 'idle' | 'casting' | 'waiting' | 'hooked' | 'pulling' | 'caught' | 'lost';

interface Props {
  location: FishingLocation;
  player: PlayerState;
  onCatch: (fish: Fish, weight: number, locationId: string) => void;
  onBack: () => void;
}

export default function FishingScreen({ location, player, onCatch, onBack }: Props) {
  const { lang, t } = useI18n();
  const [phase, setPhase] = useState<Phase>('idle');
  const [bobberPos, setBobberPos] = useState<[number, number, number]>([0, 0, 0]);
  const [currentFish, setCurrentFish] = useState<Fish | null>(null);
  const [currentWeight, setCurrentWeight] = useState(0);
  const [message, setMessage] = useState(t('fish.castPrompt'));
  const [luckyMode, setLuckyMode] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const luckyTimerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  // Lucky mode: 2min active every 7min cycle
  useEffect(() => {
    const CYCLE = 7 * 60 * 1000;
    const DURATION = 2 * 60 * 1000;

    const startCycle = () => {
      luckyTimerRef.current = setTimeout(() => {
        setLuckyMode(true);
        luckyTimerRef.current = setTimeout(() => {
          setLuckyMode(false);
          startCycle();
        }, DURATION);
      }, CYCLE);
    };

    startCycle();
    return () => { if (luckyTimerRef.current) clearTimeout(luckyTimerRef.current); };
  }, []);

  const handleWaterClick = useCallback((point: THREE.Vector3) => {
    if (phase !== 'idle') return;
    setBobberPos([point.x, 0, point.z]);
    setPhase('casting');
    setMessage(t('fish.casting'));

    // Realistic fishing reel sound — metallic clicks + drag + line whizz
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const duration = 3.0;
      const sampleRate = audioCtx.sampleRate;
      const bufferSize = Math.floor(sampleRate * duration);
      const buffer = audioCtx.createBuffer(1, bufferSize, sampleRate);
      const data = buffer.getChannelData(0);

      let noiseState1 = 0;
      let noiseState2 = 0;
      for (let i = 0; i < bufferSize; i++) {
        const t = i / sampleRate;
        const progress = t / duration;
        // Reel slows down as line extends
        const reelSpeed = 1 - progress * 0.5;

        // === Metallic click pattern (real reel anti-reverse clicks) ===
        const clickRate = 35 * reelSpeed; // clicks per second
        const clickPhase = (t * clickRate) % 1;
        const click = clickPhase < 0.08 ? Math.sin(clickPhase / 0.08 * Math.PI) * 0.6 : 0;
        // Higher metallic ping on each click
        const ping = clickPhase < 0.05 ? Math.sin(t * 3200 * Math.PI * 2) * 0.15 * (1 - clickPhase / 0.05) : 0;

        // === Drag mechanism — buzzy metallic whine ===
        const dragFreq = 220 * reelSpeed;
        const drag = (Math.sin(t * dragFreq * Math.PI * 2) * 0.5 +
                      Math.sin(t * dragFreq * 1.5 * Math.PI * 2) * 0.25 +
                      Math.sin(t * dragFreq * 2.5 * Math.PI * 2) * 0.12) * 0.18 * reelSpeed;

        // === Spool rotation hum ===
        const spoolFreq = 60 * reelSpeed;
        const spool = Math.sin(t * spoolFreq * Math.PI * 2) * 0.1;

        // === Line friction — filtered noise (zzzzz sound) ===
        noiseState1 = noiseState1 * 0.92 + (Math.random() - 0.5) * 0.08;
        noiseState2 = noiseState2 * 0.85 + noiseState1 * 0.15;
        const lineFriction = noiseState2 * 0.5 * reelSpeed;

        // === High-frequency line whizz ===
        const whizz = Math.sin(t * 1800 * reelSpeed * Math.PI * 2) * 0.04 * reelSpeed *
                       (0.5 + 0.5 * Math.sin(t * 12 * Math.PI * 2));

        // === Handle wobble (low thump) ===
        const handleRate = 6 * reelSpeed;
        const handlePhase = (t * handleRate) % 1;
        const handle = handlePhase < 0.15 ? Math.sin(handlePhase / 0.15 * Math.PI) * 0.08 : 0;

        // Envelope
        const fadeIn = Math.min(1, t * 15);
        const fadeOut = Math.min(1, (duration - t) * 6);
        const envelope = fadeIn * fadeOut;

        data[i] = (click + ping + drag + spool + lineFriction + whizz + handle) * envelope * 0.9;
      }

      const source = audioCtx.createBufferSource();
      source.buffer = buffer;
      // Bandpass to focus on metallic frequencies
      const lpf = audioCtx.createBiquadFilter();
      lpf.type = 'lowpass';
      lpf.frequency.value = 4500;
      lpf.Q.value = 0.5;
      const hpf = audioCtx.createBiquadFilter();
      hpf.type = 'highpass';
      hpf.frequency.value = 60;
      hpf.Q.value = 0.5;
      const gain = audioCtx.createGain();
      gain.gain.value = 1.2;
      source.connect(hpf);
      hpf.connect(lpf);
      lpf.connect(gain);
      gain.connect(audioCtx.destination);
      source.start();
      source.onended = () => audioCtx.close();
    } catch (e) { /* audio not available */ }

    setTimeout(() => {
      setPhase('waiting');
      setMessage(t('fish.waiting'));

      const wait = getWaitTime();
      timerRef.current = setTimeout(() => {
        const fish = rollFish(location, player.level, luckyMode);
        const weight = rollWeight(fish);
        setCurrentFish(fish);
        setCurrentWeight(weight);
        setPhase('hooked');
        setMessage(t('fish.hooked'));
      }, wait);
    }, 800);
  }, [phase, location, player.level, luckyMode]);

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
    setMessage(t('fish.castPrompt'));
  }, [t]);

  return (
    <div className="relative w-full h-screen bg-background overflow-hidden">
      {/* 3D Scene */}
      <FishingScene3D
        location={location}
        bobberVisible={phase === 'casting' || phase === 'waiting' || phase === 'hooked'}
        bobberPosition={bobberPos}
        onWaterClick={handleWaterClick}
      />

      {/* Lucky mode banner */}
      <AnimatePresence>
        {luckyMode && (
          <motion.div
            className="absolute top-14 left-0 right-0 z-20 flex justify-center pointer-events-none"
            initial={{ opacity: 0, y: -30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -30 }}
          >
            <motion.div
              className="bg-gradient-to-r from-yellow-500/90 via-amber-400/90 to-yellow-500/90 backdrop-blur px-6 py-2 rounded-full border-2 border-yellow-300 shadow-lg shadow-yellow-500/30"
              animate={{ scale: [1, 1.05, 1] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            >
              <span className="text-lg font-extrabold text-yellow-950 tracking-wide">
                ✨ 2x SORTE ✨
              </span>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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
