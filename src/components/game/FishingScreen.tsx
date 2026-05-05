import { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { FishingScene3D } from './FishingScene';
import PullMinigame from './PullMinigame';
import { FishingLocation, Fish, PlayerState } from '@/game/types';
import { FISH_IMAGES } from '@/game/fishImages';
import { rollFish, rollWeight, getWaitTime } from '@/game/fishingLogic';
import { useI18n, getRarityLabel } from '@/game/i18n';
import * as THREE from 'three';

type Phase = 'idle' | 'casting' | 'waiting' | 'hooked' | 'pulling' | 'caught' | 'lost';

/* Boat POV overlay — wooden bow visible at the bottom of the screen,
   subtle bobbing motion to simulate being on the boat. */
function BoatOverlay() {
  return (
    <motion.div
      className="absolute bottom-0 left-0 right-0 z-[5] pointer-events-none select-none"
      animate={{ y: [0, -5, 0, 3, 0], rotate: [0, 0.25, 0, -0.2, 0] }}
      transition={{ duration: 5.5, repeat: Infinity, ease: 'easeInOut' }}
    >
      <svg viewBox="0 0 1200 320" preserveAspectRatio="none" className="w-full h-[24vh] min-h-[180px] block drop-shadow-2xl">
        <defs>
          {/* Rich wood plank gradient with warm highlights */}
          <linearGradient id="woodDeck" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#8a5a2c" />
            <stop offset="20%" stopColor="#6e4220" />
            <stop offset="55%" stopColor="#4d2d12" />
            <stop offset="100%" stopColor="#2a1607" />
          </linearGradient>
          <linearGradient id="hullSide" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3d2210" />
            <stop offset="60%" stopColor="#1f0e04" />
            <stop offset="100%" stopColor="#0c0502" />
          </linearGradient>
          <linearGradient id="rail" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#b87a40" />
            <stop offset="50%" stopColor="#8a5a2c" />
            <stop offset="100%" stopColor="#5a3818" />
          </linearGradient>
          <linearGradient id="railHi" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#e2b780" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#e2b780" stopOpacity="0" />
          </linearGradient>
          <radialGradient id="vignette" cx="50%" cy="100%" r="80%">
            <stop offset="0%" stopColor="#000000" stopOpacity="0" />
            <stop offset="70%" stopColor="#000000" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0.7" />
          </radialGradient>
          {/* Wood grain pattern with knots */}
          <pattern id="planks" x="0" y="0" width="90" height="320" patternUnits="userSpaceOnUse">
            <rect width="90" height="320" fill="url(#woodDeck)" />
            {/* grain streaks */}
            <path d="M0,40 Q45,55 90,38" stroke="#3a200c" strokeWidth="0.8" fill="none" opacity="0.5" />
            <path d="M0,90 Q45,75 90,95" stroke="#3a200c" strokeWidth="0.6" fill="none" opacity="0.4" />
            <path d="M0,140 Q45,160 90,142" stroke="#5a3818" strokeWidth="0.5" fill="none" opacity="0.35" />
            <path d="M0,200 Q45,185 90,205" stroke="#3a200c" strokeWidth="0.7" fill="none" opacity="0.45" />
            <path d="M0,260 Q45,275 90,258" stroke="#2a1607" strokeWidth="0.8" fill="none" opacity="0.5" />
            {/* knot */}
            <ellipse cx="22" cy="160" rx="6" ry="4" fill="#1f0e04" opacity="0.55" />
            <ellipse cx="22" cy="160" rx="3" ry="2" fill="#0c0502" opacity="0.7" />
            {/* plank seam */}
            <line x1="0" y1="0" x2="0" y2="320" stroke="#150802" strokeWidth="2.2" opacity="0.85" />
            {/* nail heads */}
            <circle cx="6" cy="120" r="1.4" fill="#2a2418" />
            <circle cx="6" cy="240" r="1.4" fill="#2a2418" />
            <circle cx="84" cy="120" r="1.4" fill="#2a2418" />
            <circle cx="84" cy="240" r="1.4" fill="#2a2418" />
          </pattern>
          {/* Caulking between planks */}
          <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" />
          </filter>
        </defs>

        {/* Splash spray peeking above bow */}
        <g opacity="0.5">
          <ellipse cx="200" cy="68" rx="80" ry="6" fill="#e8f4ff" opacity="0.4" />
          <ellipse cx="1000" cy="68" rx="80" ry="6" fill="#e8f4ff" opacity="0.4" />
          <ellipse cx="600" cy="60" rx="180" ry="4" fill="#e8f4ff" opacity="0.35" />
        </g>

        {/* Boat bow shape — curved upward at sides */}
        <path
          d="M 0,320 L 0,170 Q 90,100 290,78 Q 600,60 910,78 Q 1110,100 1200,170 L 1200,320 Z"
          fill="url(#planks)"
        />
        {/* Caulking lines between planks across the deck (horizontal) */}
        <g stroke="#0e0602" strokeWidth="1.5" opacity="0.55" fill="none">
          <path d="M 0,200 Q 600,178 1200,200" />
          <path d="M 0,235 Q 600,218 1200,235" />
          <path d="M 0,270 Q 600,256 1200,270" />
          <path d="M 0,305 Q 600,294 1200,305" />
        </g>
        {/* Hull side shadow */}
        <path
          d="M 0,320 L 0,170 Q 90,100 290,78 Q 600,60 910,78 Q 1110,100 1200,170 L 1200,200 Q 1100,130 910,108 Q 600,90 290,108 Q 100,130 0,200 Z"
          fill="url(#hullSide)"
          opacity="0.6"
        />
        {/* Top rail (gunwale) */}
        <path
          d="M 0,170 Q 90,100 290,78 Q 600,60 910,78 Q 1110,100 1200,170 L 1200,188 Q 1100,118 910,96 Q 600,78 290,96 Q 100,118 0,188 Z"
          fill="url(#rail)"
        />
        {/* Glossy varnish highlight on rail */}
        <path
          d="M 0,170 Q 90,100 290,78 Q 600,60 910,78 Q 1110,100 1200,170"
          fill="none"
          stroke="url(#railHi)"
          strokeWidth="3"
        />
        <path
          d="M 0,176 Q 90,108 290,86 Q 600,68 910,86 Q 1110,108 1200,176"
          fill="none"
          stroke="#ffffff"
          strokeWidth="1"
          opacity="0.35"
        />
        {/* Rivets / cleats / hardware */}
        <g>
          {[120, 250, 380, 510, 690, 820, 950, 1080].map((x, i) => (
            <g key={i} transform={`translate(${x},${82 + Math.abs(x - 600) * 0.04})`}>
              <circle cx="0" cy="0" r="3.5" fill="#1a1208" />
              <circle cx="-0.8" cy="-1" r="1.4" fill="#7a6248" opacity="0.8" />
            </g>
          ))}
        </g>
        {/* Rod holder mount — port side (rod appears to come out here) */}
        <g transform="translate(870,86)">
          <ellipse cx="0" cy="0" rx="22" ry="9" fill="#1a1208" />
          <ellipse cx="0" cy="-2" rx="18" ry="6" fill="#0a0603" />
          <rect x="-22" y="-2" width="44" height="6" rx="2" fill="#3a2a18" />
          <circle cx="-16" cy="2" r="1.6" fill="#7a6248" />
          <circle cx="16" cy="2" r="1.6" fill="#7a6248" />
        </g>
        {/* Rope coil on deck */}
        <g transform="translate(220,210)">
          <ellipse cx="0" cy="6" rx="60" ry="10" fill="#000000" opacity="0.35" filter="url(#softShadow)" />
          <ellipse cx="0" cy="0" rx="58" ry="18" fill="#c9a06a" />
          <ellipse cx="0" cy="-6" rx="50" ry="14" fill="#a8814f" />
          <ellipse cx="0" cy="-12" rx="40" ry="10" fill="#8a6638" />
          <ellipse cx="0" cy="-17" rx="28" ry="6" fill="#6e4f29" />
          {/* rope twist detail */}
          <g stroke="#5a3f1f" strokeWidth="0.8" fill="none" opacity="0.7">
            {[-50, -38, -26, -14, -2, 10, 22, 34, 46].map((dx, i) => (
              <path key={i} d={`M${dx},-2 Q${dx + 6},2 ${dx + 12},-2`} />
            ))}
          </g>
        </g>
        {/* Tackle box with handle and clasps */}
        <g transform="translate(420,200)">
          <rect x="-52" y="6" width="104" height="6" rx="2" fill="#000000" opacity="0.4" filter="url(#softShadow)" />
          <rect x="-50" y="0" width="100" height="55" rx="5" fill="#2c5784" stroke="#0e3257" strokeWidth="2" />
          <rect x="-50" y="0" width="100" height="14" fill="#3d6fa0" />
          <rect x="-50" y="13" width="100" height="2" fill="#0e3257" />
          <rect x="-8" y="16" width="16" height="6" rx="1" fill="#9aa6b3" stroke="#5a6470" strokeWidth="0.5" />
          <rect x="-30" y="22" width="6" height="6" fill="#1a3554" />
          <rect x="24" y="22" width="6" height="6" fill="#1a3554" />
          <path d="M-30,0 Q0,-12 30,0" stroke="#1a3554" strokeWidth="2.5" fill="none" />
        </g>
        {/* Bait bucket */}
        <g transform="translate(1000,215)">
          <ellipse cx="0" cy="48" rx="36" ry="6" fill="#000000" opacity="0.4" />
          <path d="M-32,0 L-28,50 L28,50 L32,0 Z" fill="#5a6470" stroke="#2a3038" strokeWidth="1.5" />
          <ellipse cx="0" cy="0" rx="32" ry="7" fill="#3a4048" stroke="#1a1f24" strokeWidth="1.5" />
          <ellipse cx="0" cy="0" rx="26" ry="5" fill="#1a1f24" />
          <path d="M-28,5 Q0,-18 28,5" stroke="#2a3038" strokeWidth="2" fill="none" />
        </g>
        {/* Wet patches / water reflections on deck */}
        <g opacity="0.25">
          <ellipse cx="600" cy="240" rx="80" ry="8" fill="#6ab3d8" />
          <ellipse cx="350" cy="280" rx="50" ry="5" fill="#6ab3d8" />
          <ellipse cx="780" cy="270" rx="60" ry="6" fill="#6ab3d8" />
        </g>
        {/* Vignette darkening at bottom corners */}
        <rect x="0" y="0" width="1200" height="320" fill="url(#vignette)" />
      </svg>
    </motion.div>
  );
}

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
        const luckMultActive = player.luckMultiplierEnd ? player.luckMultiplierEnd > Date.now() : false;
        const fish = rollFish(location, player.level, luckyMode || luckMultActive);
        const weight = rollWeight(fish);
        setCurrentFish(fish);
        setCurrentWeight(weight);
        setPhase('hooked');
        setMessage(t('fish.hooked'));
      }, wait);
    }, 800);
  }, [phase, location, player.level, luckyMode, t]);

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
        activeSkin={player.activeSkin}
      />

      {/* Boat POV overlay — only for ocean locations */}
      {location.type === 'ocean' && <BoatOverlay />}

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
                {t('fish.lucky')}
              </span>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* HUD overlay */}
      <div className="absolute top-0 left-0 right-0 p-4 flex items-start justify-between z-10 pointer-events-none">
        <div className="pointer-events-auto">
          <Button variant="outline" size="sm" onClick={onBack} className="bg-background/80 backdrop-blur">
            {t('fish.back')}
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
                  {t('fish.pull')}
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
        <PullMinigame fish={currentFish} strengthActive={!!(player.strengthMultiplierEnd && player.strengthMultiplierEnd > Date.now())} onWin={handleWin} onLose={handleLose} />
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
              <h2 className="text-3xl font-bold text-foreground mb-1">{t('fish.caught')}</h2>
              <h3 className="text-xl font-bold text-foreground">{currentFish.name}</h3>
              <p className={`text-sm font-bold text-rarity-${currentFish.rarity} mb-2`}>
                {getRarityLabel(currentFish.rarity, lang)}
              </p>
              <p className="text-muted-foreground text-sm mb-1">{currentWeight} kg</p>
              <p className="text-primary text-sm font-semibold mb-4">+{currentFish.xp} XP</p>
              <p className="text-muted-foreground text-xs mb-6">{currentFish.description}</p>
              <Button onClick={handleReset} size="lg" className="w-full">
                {t('fish.fishAgain')}
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
              <h2 className="text-3xl font-bold text-foreground mb-1">{t('fish.escaped')}</h2>
              <h3 className="text-lg text-muted-foreground mb-2">
                <span className={`font-bold text-rarity-${currentFish.rarity}`}>{currentFish.name}</span> {t('fish.escapedMsg')}
              </h3>
              <p className="text-muted-foreground text-sm mb-6">{t('fish.tryAgain')}</p>
              <Button onClick={handleReset} size="lg" className="w-full">
                {t('fish.tryAgainBtn')}
              </Button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
