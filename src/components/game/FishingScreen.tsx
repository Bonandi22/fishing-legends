import { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { FishingScene3D, RodOverlayCanvas } from './FishingScene';
import PullMinigame from './PullMinigame';
import { FishingLocation, Fish, PlayerState, BOAT_SKINS, BoatSkin } from '@/game/types';
import { FISH_IMAGES } from '@/game/fishImages';
import { rollFish, rollWeight, getWaitTime } from '@/game/fishingLogic';
import { useI18n, getRarityLabel } from '@/game/i18n';
import * as THREE from 'three';

type Phase = 'idle' | 'casting' | 'waiting' | 'hooked' | 'pulling' | 'caught' | 'lost';

/* Boat POV overlay — wooden bow with volumetric depth, perspective deck planks,
   rim lighting and atmospheric haze for a strong 3D presence. */
function BoatOverlay({ skinId }: { skinId: string }) {
  const skin: BoatSkin = BOAT_SKINS.find(s => s.id === skinId) || BOAT_SKINS[0];
  return (
    <>
      <motion.div
        className="absolute bottom-0 left-0 right-0 z-[5] pointer-events-none select-none"
        style={{ perspective: '900px' }}
        animate={{ y: [0, -6, 0, 4, 0], rotate: [0, 0.3, 0, -0.25, 0] }}
        transition={{ duration: 5.5, repeat: Infinity, ease: 'easeInOut' }}
      >
        <svg viewBox="0 0 1200 360" preserveAspectRatio="none" className="w-full h-[34vh] min-h-[260px] block">
          <defs>
            <linearGradient id="woodDeck" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={skin.deck[0]} />
              <stop offset="12%" stopColor={skin.deck[1]} />
              <stop offset="40%" stopColor={skin.deck[2]} />
              <stop offset="75%" stopColor={skin.deck[3]} />
              <stop offset="100%" stopColor={skin.deck[4]} />
            </linearGradient>
            <linearGradient id="hullSide" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={skin.hull[0]} />
              <stop offset="50%" stopColor={skin.hull[1]} />
              <stop offset="100%" stopColor={skin.hull[2]} />
            </linearGradient>
            <linearGradient id="rail" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={skin.rail[0]} />
              <stop offset="35%" stopColor={skin.rail[1]} />
              <stop offset="100%" stopColor={skin.rail[2]} />
            </linearGradient>
            <linearGradient id="railHi" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#fff1d4" stopOpacity="0.95" />
              <stop offset="100%" stopColor="#fff1d4" stopOpacity="0" />
            </linearGradient>
            {/* Rim light coming from the sky/water reflection */}
            <linearGradient id="rimLight" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#bfe2ff" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#bfe2ff" stopOpacity="0" />
            </linearGradient>
            {/* Water reflection bouncing onto the lower hull */}
            <linearGradient id="waterBounce" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#7ec0e6" stopOpacity="0" />
              <stop offset="55%" stopColor="#7ec0e6" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#bfe2ff" stopOpacity="0.55" />
            </linearGradient>
            {/* Side bulkhead — port/starboard interior walls receding */}
            <linearGradient id="sideWall" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#1a0d04" />
              <stop offset="60%" stopColor="#3a200c" />
              <stop offset="100%" stopColor="#5a3418" />
            </linearGradient>
            <linearGradient id="sideWallR" x1="1" y1="0" x2="0" y2="0">
              <stop offset="0%" stopColor="#1a0d04" />
              <stop offset="60%" stopColor="#3a200c" />
              <stop offset="100%" stopColor="#5a3418" />
            </linearGradient>
            <radialGradient id="deckLight" cx="50%" cy="0%" r="80%">
              <stop offset="0%" stopColor="#fff4d8" stopOpacity="0.65" />
              <stop offset="60%" stopColor="#fff4d8" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0.05" />
            </radialGradient>
            <radialGradient id="vignette" cx="50%" cy="100%" r="80%">
              <stop offset="0%" stopColor="#000000" stopOpacity="0" />
              <stop offset="65%" stopColor="#000000" stopOpacity="0.15" />
              <stop offset="100%" stopColor="#000000" stopOpacity="0.35" />
            </radialGradient>
            {/* Plank pattern with grain & knots */}
            <pattern id="planks" x="0" y="0" width="90" height="360" patternUnits="userSpaceOnUse">
              <rect width="90" height="360" fill="url(#woodDeck)" />
              <path d="M0,40 Q45,55 90,38" stroke="#3a200c" strokeWidth="0.8" fill="none" opacity="0.55" />
              <path d="M0,90 Q45,75 90,95" stroke="#3a200c" strokeWidth="0.6" fill="none" opacity="0.45" />
              <path d="M0,150 Q45,170 90,148" stroke="#5a3818" strokeWidth="0.5" fill="none" opacity="0.4" />
              <path d="M0,220 Q45,205 90,225" stroke="#3a200c" strokeWidth="0.7" fill="none" opacity="0.5" />
              <path d="M0,290 Q45,305 90,288" stroke="#2a1607" strokeWidth="0.8" fill="none" opacity="0.55" />
              <ellipse cx="22" cy="170" rx="6" ry="4" fill="#1f0e04" opacity="0.6" />
              <ellipse cx="22" cy="170" rx="3" ry="2" fill="#0c0502" opacity="0.75" />
              <ellipse cx="68" cy="270" rx="5" ry="3" fill="#1f0e04" opacity="0.55" />
              <line x1="0" y1="0" x2="0" y2="360" stroke="#0a0401" strokeWidth="2.5" opacity="0.9" />
              <circle cx="6" cy="120" r="1.5" fill="#2a2418" />
              <circle cx="6" cy="260" r="1.5" fill="#2a2418" />
              <circle cx="84" cy="120" r="1.5" fill="#2a2418" />
              <circle cx="84" cy="260" r="1.5" fill="#2a2418" />
            </pattern>
            <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3.5" />
            </filter>
            <filter id="innerGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="1.5" result="b" />
              <feComposite in="SourceGraphic" in2="b" operator="over" />
            </filter>
          </defs>

          {/* Splash spray peeking above bow */}
          <g opacity="0.55">
            <ellipse cx="200" cy="78" rx="90" ry="7" fill="#e8f4ff" opacity="0.45" />
            <ellipse cx="1000" cy="78" rx="90" ry="7" fill="#e8f4ff" opacity="0.45" />
            <ellipse cx="600" cy="68" rx="220" ry="5" fill="#e8f4ff" opacity="0.4" />
          </g>

          {/* Hull side (curved skirt below the rail — gives depth) */}
          <path
            d="M -20,360 L -20,210 Q 90,140 290,118 Q 600,98 910,118 Q 1110,140 1220,210 L 1220,360 Z"
            fill="url(#hullSide)"
          />
          {/* Wet rim light along the hull edge */}
          <path
            d="M 0,210 Q 90,140 290,118 Q 600,98 910,118 Q 1110,140 1200,210"
            fill="none" stroke="url(#rimLight)" strokeWidth="6" opacity="0.7"
          />

          {/* Deck planks — main surface */}
          <path
            d="M 0,360 L 0,200 Q 90,128 290,104 Q 600,84 910,104 Q 1110,128 1200,200 L 1200,360 Z"
            fill="url(#planks)"
          />

          {/* Curved caulking lines that follow perspective (planks bend toward horizon) */}
          <g stroke="#0a0401" strokeWidth="1.6" opacity="0.65" fill="none">
            <path d="M 0,235 Q 600,210 1200,235" />
            <path d="M 0,265 Q 600,244 1200,265" />
            <path d="M 0,295 Q 600,278 1200,295" />
            <path d="M 0,325 Q 600,312 1200,325" />
          </g>

          {/* Soft warm sky light pooling on the deck */}
          <path
            d="M 0,360 L 0,200 Q 90,128 290,104 Q 600,84 910,104 Q 1110,128 1200,200 L 1200,360 Z"
            fill="url(#deckLight)" opacity="0.9"
          />

          {/* Soft ambient occlusion under the rail (lightened) */}
          <path
            d="M 0,200 Q 90,128 290,104 Q 600,84 910,104 Q 1110,128 1200,200 L 1200,238 Q 1100,160 910,138 Q 600,118 290,138 Q 100,160 0,238 Z"
            fill="#000000" opacity="0.18"
          />

          {/* Top rail (gunwale) — thick varnished trim */}
          <path
            d="M 0,200 Q 90,128 290,104 Q 600,84 910,104 Q 1110,128 1200,200 L 1200,222 Q 1100,148 910,124 Q 600,104 290,124 Q 100,148 0,222 Z"
            fill="url(#rail)"
          />
          {/* Glossy varnish highlight on rail */}
          <path
            d="M 0,200 Q 90,128 290,104 Q 600,84 910,104 Q 1110,128 1200,200"
            fill="none" stroke="url(#railHi)" strokeWidth="3.5"
          />
          <path
            d="M 0,206 Q 90,134 290,110 Q 600,90 910,110 Q 1110,134 1200,206"
            fill="none" stroke="#ffffff" strokeWidth="1.2" opacity="0.5"
          />
          {/* Dark inner edge of the rail (volume shadow) */}
          <path
            d="M 0,222 Q 100,148 290,124 Q 600,104 910,124 Q 1100,148 1200,222"
            fill="none" stroke="#1a0d04" strokeWidth="1.4" opacity="0.85"
          />

          {/* Brass cleats along the rail */}
          <g>
            {[120, 250, 380, 510, 690, 820, 950, 1080].map((x, i) => {
              const y = 110 + Math.abs(x - 600) * 0.045;
              return (
                <g key={i} transform={`translate(${x},${y})`}>
                  <ellipse cx="0" cy="3" rx="9" ry="2.5" fill="#000" opacity="0.4" />
                  <rect x="-7" y="-3" width="14" height="6" rx="1.5" fill="#caa05a" />
                  <rect x="-7" y="-3" width="14" height="2" fill="#f1d39a" />
                  <circle cx="0" cy="0" r="1.2" fill="#5a3a14" />
                </g>
              );
            })}
          </g>

          {/* Rod holder on starboard */}
          <g transform="translate(870,112)">
            <ellipse cx="0" cy="6" rx="26" ry="4" fill="#000" opacity="0.45" />
            <ellipse cx="0" cy="0" rx="22" ry="9" fill="#1a1208" />
            <ellipse cx="0" cy="-2" rx="18" ry="6" fill="#0a0603" />
            <rect x="-22" y="-2" width="44" height="6" rx="2" fill="#3a2a18" />
            <rect x="-22" y="-2" width="44" height="1.5" fill="#7a5a32" />
            <circle cx="-16" cy="2" r="1.6" fill="#caa05a" />
            <circle cx="16" cy="2" r="1.6" fill="#caa05a" />
          </g>

          {/* Rope coil on deck — with strong volumetric shading */}
          <g transform="translate(220,250)">
            <ellipse cx="0" cy="14" rx="68" ry="11" fill="#000" opacity="0.45" filter="url(#softShadow)" />
            <ellipse cx="0" cy="2" rx="62" ry="20" fill="#c9a06a" />
            <ellipse cx="0" cy="-4" rx="54" ry="15" fill="#a8814f" />
            <ellipse cx="0" cy="-12" rx="44" ry="11" fill="#7a5a30" />
            <ellipse cx="0" cy="-19" rx="32" ry="7" fill="#5a3f1f" />
            <ellipse cx="-15" cy="-4" rx="22" ry="6" fill="#e2c08a" opacity="0.45" />
            <g stroke="#5a3f1f" strokeWidth="0.9" fill="none" opacity="0.75">
              {[-54, -42, -30, -18, -6, 6, 18, 30, 42, 50].map((dx, i) => (
                <path key={i} d={`M${dx},0 Q${dx + 6},4 ${dx + 12},0`} />
              ))}
            </g>
          </g>

          {/* Tackle box with depth and lid */}
          <g transform="translate(420,238)">
            <rect x="-54" y="60" width="108" height="6" rx="2" fill="#000" opacity="0.45" filter="url(#softShadow)" />
            <rect x="-50" y="0" width="100" height="58" rx="5" fill="#2c5784" stroke="#0e3257" strokeWidth="2" />
            <rect x="-50" y="0" width="100" height="16" fill="#3d6fa0" />
            <rect x="-50" y="14" width="100" height="2" fill="#0e3257" />
            <rect x="-50" y="0" width="100" height="3" fill="#7ab0e0" opacity="0.7" />
            <rect x="-8" y="18" width="16" height="6" rx="1" fill="#cfd6df" stroke="#5a6470" strokeWidth="0.5" />
            <rect x="-30" y="24" width="6" height="6" fill="#1a3554" />
            <rect x="24" y="24" width="6" height="6" fill="#1a3554" />
            <path d="M-30,0 Q0,-13 30,0" stroke="#1a3554" strokeWidth="2.5" fill="none" />
          </g>

          {/* Bait bucket with rim shading */}
          <g transform="translate(1000,250)">
            <ellipse cx="0" cy="50" rx="38" ry="6" fill="#000" opacity="0.5" />
            <path d="M-32,0 L-28,52 L28,52 L32,0 Z" fill="#5a6470" stroke="#2a3038" strokeWidth="1.5" />
            <path d="M-30,4 L-28,48 L-22,48 L-24,4 Z" fill="#7a8490" opacity="0.5" />
            <ellipse cx="0" cy="0" rx="32" ry="7" fill="#3a4048" stroke="#1a1f24" strokeWidth="1.5" />
            <ellipse cx="0" cy="0" rx="26" ry="5" fill="#1a1f24" />
            <ellipse cx="-8" cy="-1" rx="10" ry="2" fill="#5a6470" opacity="0.6" />
            <path d="M-28,5 Q0,-20 28,5" stroke="#2a3038" strokeWidth="2.4" fill="none" />
          </g>

          {/* Wet patches with reflection sparkle */}
          <g opacity="0.3">
            <ellipse cx="600" cy="282" rx="90" ry="9" fill="#7ec0e6" />
            <ellipse cx="350" cy="320" rx="55" ry="6" fill="#7ec0e6" />
            <ellipse cx="780" cy="305" rx="65" ry="7" fill="#7ec0e6" />
            <ellipse cx="600" cy="280" rx="40" ry="2" fill="#ffffff" opacity="0.6" />
          </g>

          {/* Port side wall — left bulkhead receding into perspective */}
          <path
            d="M 0,222 L 0,360 L 145,360 L 220,150 Q 110,170 0,222 Z"
            fill="url(#sideWall)" opacity="0.95"
          />
          {/* Plank lines on port wall */}
          <g stroke="#0a0401" strokeWidth="1.2" opacity="0.7" fill="none">
            <path d="M 0,250 Q 90,200 195,195" />
            <path d="M 0,290 Q 90,250 175,240" />
            <path d="M 0,325 Q 90,295 160,285" />
          </g>
          {/* Starboard side wall — right bulkhead */}
          <path
            d="M 1200,222 L 1200,360 L 1055,360 L 980,150 Q 1090,170 1200,222 Z"
            fill="url(#sideWallR)" opacity="0.95"
          />
          <g stroke="#0a0401" strokeWidth="1.2" opacity="0.7" fill="none">
            <path d="M 1200,250 Q 1110,200 1005,195" />
            <path d="M 1200,290 Q 1110,250 1025,240" />
            <path d="M 1200,325 Q 1110,295 1040,285" />
          </g>
          {/* Corner posts (vertical wooden ribs at the corners) */}
          <rect x="0" y="218" width="14" height="142" fill="#0c0602" />
          <rect x="2" y="218" width="3" height="142" fill="#5a3818" opacity="0.8" />
          <rect x="1186" y="218" width="14" height="142" fill="#0c0602" />
          <rect x="1195" y="218" width="3" height="142" fill="#5a3818" opacity="0.8" />

          {/* Water reflection bouncing onto the lower hull skirt (visible just under the rail) */}
          <path
            d="M -20,222 Q 90,160 290,138 Q 600,118 910,138 Q 1110,160 1220,222 L 1220,300 Q 1110,260 910,250 Q 600,240 290,250 Q 90,260 -20,300 Z"
            fill="url(#waterBounce)" opacity="0.55"
          />
          {/* Animated subtle water caustics on hull */}
          <g opacity="0.35" stroke="#cfeaff" strokeWidth="0.8" fill="none">
            <path d="M 80,260 Q 200,250 340,262" />
            <path d="M 400,255 Q 600,245 800,255" />
            <path d="M 860,262 Q 1000,250 1120,262" />
          </g>

          {/* Heavy vignette darkening the corners for depth */}
          <rect x="0" y="0" width="1200" height="360" fill="url(#vignette)" />
        </svg>
      </motion.div>
    </>
  );
}

interface Props {
  location: FishingLocation;
  player: PlayerState;
  onCatch: (fish: Fish, weight: number, locationId: string) => void;
  onBack: () => void;
  onCastNet?: () => void;
  onOpenNetShop?: () => void;
}

export default function FishingScreen({ location, player, onCatch, onBack, onCastNet, onOpenNetShop }: Props) {
  const { lang, t } = useI18n();
  const [phase, setPhase] = useState<Phase>('idle');
  const [bobberPos, setBobberPos] = useState<[number, number, number]>([0, 0, 0]);
  const [currentFish, setCurrentFish] = useState<Fish | null>(null);
  const [currentWeight, setCurrentWeight] = useState(0);
  const [message, setMessage] = useState(t('fish.castPrompt'));
  const [luckyMode, setLuckyMode] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const luckyTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const clearFishingTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = undefined;
    }
  }, []);

  useEffect(() => {
    return clearFishingTimer;
  }, [clearFishingTimer]);

  // Lucky mode: every 7min, 50% chance to trigger, lasts 1min
  useEffect(() => {
    const CYCLE = 7 * 60 * 1000;
    const DURATION = 1 * 60 * 1000;

    const startCycle = () => {
      luckyTimerRef.current = setTimeout(() => {
        if (Math.random() < 0.5) {
          setLuckyMode(true);
          luckyTimerRef.current = setTimeout(() => {
            setLuckyMode(false);
            startCycle();
          }, DURATION);
        } else {
          startCycle();
        }
      }, CYCLE);
    };

    startCycle();
    return () => { if (luckyTimerRef.current) clearTimeout(luckyTimerRef.current); };
  }, [clearFishingTimer]);

  const handleBack = useCallback(() => {
    clearFishingTimer();
    onBack();
  }, [clearFishingTimer, onBack]);

  const handleWaterClick = useCallback((point: THREE.Vector3) => {
    if (phase !== 'idle') return;
    setBobberPos([point.x, 0, point.z]);
    setPhase('casting');
    setMessage(t('fish.casting'));

    // Realistic fishing reel sound — metallic clicks + drag + line whizz
    try {
      const AudioContextConstructor = window.AudioContext ?? (window as Window & {
        webkitAudioContext?: typeof AudioContext;
      }).webkitAudioContext;
      if (!AudioContextConstructor) throw new Error('AudioContext unavailable');
      const audioCtx = new AudioContextConstructor();
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
    } catch {
      // Audio is optional and may be unavailable in restricted browsers.
    }

    timerRef.current = setTimeout(() => {
      setPhase('waiting');
      setMessage(t('fish.waiting'));

      const wait = getWaitTime();
      timerRef.current = setTimeout(() => {
        const luckMultActive = player.luckMultiplierEnd ? player.luckMultiplierEnd > Date.now() : false;
        const luckPower = luckMultActive ? (player.luckMultiplierPower ?? 2) : 2;
        const fish = rollFish(location, player.level, luckyMode || luckMultActive, luckPower);
        const weight = rollWeight(fish);
        setCurrentFish(fish);
        setCurrentWeight(weight);
        setPhase('hooked');
        setMessage(t('fish.hooked'));
      }, wait);
    }, 800);
  }, [
    phase,
    location,
    player.level,
    player.luckMultiplierEnd,
    player.luckMultiplierPower,
    luckyMode,
    t,
  ]);

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
    clearFishingTimer();
    setPhase('idle');
    setCurrentFish(null);
    setCurrentWeight(0);
    setMessage(t('fish.castPrompt'));
  }, [clearFishingTimer, t]);

  return (
    <div className="relative h-[100dvh] min-h-screen w-full overflow-hidden bg-abyss">
      {/* 3D Scene */}
      <FishingScene3D
        location={location}
        bobberVisible={phase === 'casting' || phase === 'waiting' || phase === 'hooked'}
        bobberPosition={bobberPos}
        onWaterClick={handleWaterClick}
        activeSkin={player.activeSkin}
      />

      {/* Boat POV overlay — only for ocean locations */}
      {location.type === 'ocean' && <BoatOverlay skinId={player.activeBoatSkin} />}

      {/* Rod overlay — rendered ABOVE the boat so the rod appears in front */}
      <div className="absolute inset-0 z-[6] pointer-events-none">
        <RodOverlayCanvas activeSkin={player.activeSkin} />
      </div>

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
              className="rounded-full border border-lure/40 bg-abyss/80 px-6 py-2 shadow-[0_0_24px_hsl(var(--lure)/0.35)] backdrop-blur"
              animate={{ scale: [1, 1.05, 1] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            >
              <span className="text-lg font-extrabold tracking-wide text-lure">
                {t('fish.lucky')}
              </span>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* HUD overlay */}
      <div className="absolute left-0 right-0 top-0 z-10 flex items-start justify-between gap-2 p-2 pointer-events-none sm:p-4">
        <div className="pointer-events-auto">
          <Button variant="outline" size="sm" onClick={handleBack} className="touch-target hud-panel">
            {t('fish.back')}
          </Button>
          {location.type === 'lake' && onCastNet && (
            <div className="mt-2 flex items-center gap-2">
              <Button
                size="sm"
                onClick={onCastNet}
                disabled={(player.nets ?? 0) <= 0}
                className="touch-target bg-lure font-semibold text-lure-foreground hover:bg-lure/90"
              >
                {t('fish.castNet')}
              </Button>
              <div className="hud-panel rounded-lg px-2 py-1 text-xs font-bold text-foreground">
                {t('fish.nets')}: {player.nets ?? 0}/10
              </div>
              {onOpenNetShop && (
                <Button variant="outline" size="sm" onClick={onOpenNetShop} className="touch-target hud-panel font-semibold">
                  {t('fish.netShop')}
                </Button>
              )}
            </div>
          )}
        </div>
        <div className="hud-panel max-w-[55%] rounded-lg px-2 py-1.5 text-right sm:max-w-none sm:px-4 sm:py-2">
          <div className="text-sm font-bold text-foreground">{location.emoji} {location.name}</div>
          <div className="text-xs text-muted-foreground">Nv. {player.level} • XP: {player.xp}/{player.xpToNextLevel}</div>
          <div className="mt-1 h-1.5 w-24 overflow-hidden rounded-full bg-menu-raised sm:w-32" aria-label={`XP ${player.xp}/${player.xpToNextLevel}`}>
            <div className="h-full rounded-full bg-lure transition-all" style={{ width: `${Math.min(100, (player.xp / Math.max(1, player.xpToNextLevel)) * 100)}%` }} />
          </div>
        </div>
      </div>

      {/* Bottom message */}
      <div className="absolute bottom-0 left-0 right-0 z-10 p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pointer-events-none sm:p-4">
        <AnimatePresence mode="wait">
          <motion.div
            key={phase}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="text-center"
          >
            <div className="hud-panel pointer-events-auto inline-block max-w-full rounded-xl px-4 py-3 sm:px-6">
              <p className="text-foreground font-medium mb-2">{message}</p>

              {phase === 'hooked' && (
                <Button
                  onClick={handlePull}
                  size="lg"
                  className="animate-pulse bg-lure text-lg font-bold text-lure-foreground hover:bg-lure/90"
                >
                  {t('fish.pull')}
                </Button>
              )}

              {phase === 'waiting' && (
                <div className="flex gap-1 justify-center">
                  {[0, 1, 2].map(i => (
                    <motion.div
                      key={i}
                      className="w-2 h-2 rounded-full bg-lure"
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
        <PullMinigame fish={currentFish} strengthPower={player.strengthMultiplierPower} strengthActive={!!(player.strengthMultiplierEnd && player.strengthMultiplierEnd > Date.now())} onWin={handleWin} onLose={handleLose} />
      )}

      {/* Caught result */}
      <AnimatePresence>
        {phase === 'caught' && currentFish && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-abyss/90 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              className="menu-panel mx-4 max-w-sm rounded-2xl border border-lure/40 p-8 text-center"
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
              <p className="mb-2 text-sm font-semibold text-biolume">+{currentFish.xp} XP</p>
              <div className="mx-auto mb-4 w-full max-w-xs text-left">
                <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                  <span>{t('col.level')} {player.level}</span>
                  <span>{player.xp}/{player.xpToNextLevel} XP</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-menu-raised">
                  <div className="h-full rounded-full bg-lure transition-all" style={{ width: `${Math.min(100, (player.xp / Math.max(1, player.xpToNextLevel)) * 100)}%` }} />
                </div>
              </div>
              <p className="text-muted-foreground text-xs mb-6">{currentFish.description}</p>
              <Button onClick={handleReset} size="lg" className="w-full bg-lure font-semibold text-lure-foreground hover:bg-lure/90">
                {t('fish.fishAgain')}
              </Button>
            </motion.div>
          </motion.div>
        )}

        {phase === 'lost' && currentFish && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-abyss/90 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              className="menu-panel mx-4 max-w-sm rounded-2xl border border-lure/40 p-8 text-center"
              initial={{ scale: 0.5 }}
              animate={{ scale: 1 }}
            >
              <div className="text-7xl mb-4">💨</div>
              <h2 className="text-3xl font-bold text-foreground mb-1">{t('fish.escaped')}</h2>
              <h3 className="text-lg text-muted-foreground mb-2">
                <span className={`font-bold text-rarity-${currentFish.rarity}`}>{currentFish.name}</span> {t('fish.escapedMsg')}
              </h3>
              <p className="text-muted-foreground text-sm mb-6">{t('fish.tryAgain')}</p>
              <Button onClick={handleReset} size="lg" className="w-full bg-lure font-semibold text-lure-foreground hover:bg-lure/90">
                {t('fish.tryAgainBtn')}
              </Button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
