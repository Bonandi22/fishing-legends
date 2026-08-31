import { useState, useEffect, useRef, useCallback } from 'react';

// ============= Music track presets =============
export type MusicTrackId = 'calm' | 'adventure' | 'mystery' | 'epic' | 'lofi';

interface TrackPreset {
  id: MusicTrackId;
  label: string;
  scale: number[];        // frequencies
  bassMul: number;        // bass octave multiplier
  oscA: OscillatorType;
  oscB: OscillatorType;
  intervalMs: number;     // base time between notes
  intervalJitter: number; // random ms added
  noteDur: number;        // seconds note holds
  chordChance: number;
  masterVol: number;
}

export const MUSIC_TRACKS: TrackPreset[] = [
  {
    id: 'calm',
    label: '🌊 Calma',
    scale: [261.63, 293.66, 329.63, 392.00, 440.00, 523.25, 587.33, 659.25],
    bassMul: 0.5,
    oscA: 'sine', oscB: 'triangle',
    intervalMs: 800, intervalJitter: 400, noteDur: 1.8,
    chordChance: 0.4, masterVol: 0.12,
  },
  {
    id: 'adventure',
    label: '⛵ Aventura',
    scale: [196.00, 246.94, 293.66, 329.63, 392.00, 493.88, 587.33, 659.25],
    bassMul: 0.5,
    oscA: 'triangle', oscB: 'sawtooth',
    intervalMs: 450, intervalJitter: 150, noteDur: 1.2,
    chordChance: 0.5, masterVol: 0.10,
  },
  {
    id: 'mystery',
    label: '🌙 Misteriosa',
    // minor / phrygian-ish
    scale: [220.00, 233.08, 277.18, 311.13, 349.23, 415.30, 466.16, 554.37],
    bassMul: 0.25,
    oscA: 'sine', oscB: 'sine',
    intervalMs: 1200, intervalJitter: 600, noteDur: 2.6,
    chordChance: 0.7, masterVol: 0.11,
  },
  {
    id: 'epic',
    label: '⚔️ Épica',
    scale: [130.81, 174.61, 196.00, 220.00, 261.63, 329.63, 392.00, 523.25],
    bassMul: 0.5,
    oscA: 'sawtooth', oscB: 'triangle',
    intervalMs: 380, intervalJitter: 120, noteDur: 1.4,
    chordChance: 0.8, masterVol: 0.09,
  },
  {
    id: 'lofi',
    label: '🎧 Lo-fi',
    scale: [261.63, 311.13, 349.23, 392.00, 466.16, 523.25, 622.25, 698.46],
    bassMul: 0.5,
    oscA: 'sine', oscB: 'square',
    intervalMs: 950, intervalJitter: 350, noteDur: 2.0,
    chordChance: 0.55, masterVol: 0.10,
  },
  {
    id: 'tropical',
    label: '🏝️ Tropical',
    scale: [293.66, 349.23, 392.00, 440.00, 523.25, 587.33, 698.46, 783.99],
    bassMul: 0.5,
    oscA: 'triangle', oscB: 'sine',
    intervalMs: 520, intervalJitter: 200, noteDur: 1.1,
    chordChance: 0.6, masterVol: 0.11,
  },
  {
    id: 'abyss',
    label: '🌑 Abismo',
    scale: [98.00, 116.54, 130.81, 155.56, 174.61, 207.65, 233.08, 261.63],
    bassMul: 0.25,
    oscA: 'sine', oscB: 'triangle',
    intervalMs: 1600, intervalJitter: 800, noteDur: 3.4,
    chordChance: 0.75, masterVol: 0.12,
  },
  {
    id: 'storm',
    label: '⛈️ Tempestade',
    scale: [146.83, 174.61, 196.00, 233.08, 261.63, 311.13, 349.23, 415.30],
    bassMul: 0.5,
    oscA: 'sawtooth', oscB: 'square',
    intervalMs: 300, intervalJitter: 180, noteDur: 0.9,
    chordChance: 0.65, masterVol: 0.08,
  },
  {
    id: 'cosmic',
    label: '🌌 Cósmica',
    scale: [174.61, 220.00, 261.63, 329.63, 392.00, 466.16, 523.25, 659.25],
    bassMul: 0.25,
    oscA: 'sine', oscB: 'sawtooth',
    intervalMs: 1100, intervalJitter: 700, noteDur: 3.0,
    chordChance: 0.85, masterVol: 0.10,
  },
  {
    id: 'zen',
    label: '🎐 Zen',
    scale: [261.63, 293.66, 349.23, 392.00, 440.00, 523.25, 587.33, 698.46],
    bassMul: 0.5,
    oscA: 'sine', oscB: 'sine',
    intervalMs: 1800, intervalJitter: 900, noteDur: 3.2,
    chordChance: 0.3, masterVol: 0.11,
  },
  {
    id: 'retro',
    label: '👾 Retrô',
    scale: [261.63, 329.63, 392.00, 440.00, 493.88, 523.25, 659.25, 783.99],
    bassMul: 0.5,
    oscA: 'square', oscB: 'square',
    intervalMs: 260, intervalJitter: 90, noteDur: 0.5,
    chordChance: 0.35, masterVol: 0.07,
  },
];

const DEFAULT_TRACK: MusicTrackId = 'calm';

export function useBackgroundMusic() {
  const [isPlaying, setIsPlaying] = useState(() => {
    return localStorage.getItem('game-music') !== 'off';
  });
  const [trackId, setTrackId] = useState<MusicTrackId>(() => {
    const stored = localStorage.getItem('game-music-track') as MusicTrackId | null;
    return MUSIC_TRACKS.find(t => t.id === stored) ? (stored as MusicTrackId) : DEFAULT_TRACK;
  });

  const ctxRef = useRef<AudioContext | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();
  const activeRef = useRef(false);
  const trackRef = useRef<MusicTrackId>(trackId);
  useEffect(() => { trackRef.current = trackId; }, [trackId]);


  const startMusic = useCallback(() => {
    if (activeRef.current) return;
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      ctxRef.current = ctx;
      const masterGain = ctx.createGain();
      masterGain.connect(ctx.destination);

      let noteIndex = 0;

      const getPreset = () =>
        MUSIC_TRACKS.find(t => t.id === trackRef.current) ?? MUSIC_TRACKS[0];

      const playNote = () => {
        if (!ctxRef.current || ctxRef.current.state === 'closed') return;
        const preset = getPreset();
        masterGain.gain.value = preset.masterVol;
        const now = ctx.currentTime;

        noteIndex = (noteIndex + Math.floor(Math.random() * 3) + 1) % preset.scale.length;
        const freq = preset.scale[noteIndex];

        const osc1 = ctx.createOscillator();
        osc1.type = preset.oscA;
        osc1.frequency.value = freq;

        const osc2 = ctx.createOscillator();
        osc2.type = preset.oscB;
        osc2.frequency.value = freq * preset.bassMul;

        const noteGain = ctx.createGain();
        noteGain.gain.setValueAtTime(0, now);
        noteGain.gain.linearRampToValueAtTime(0.3, now + 0.1);
        noteGain.gain.exponentialRampToValueAtTime(0.01, now + preset.noteDur);

        osc1.connect(noteGain);
        osc2.connect(noteGain);
        noteGain.connect(masterGain);

        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + preset.noteDur + 0.2);
        osc2.stop(now + preset.noteDur + 0.2);

        if (Math.random() < preset.chordChance) {
          const chordFreq = preset.scale[(noteIndex + 2) % preset.scale.length];
          const osc3 = ctx.createOscillator();
          osc3.type = 'sine';
          osc3.frequency.value = chordFreq;
          const cg = ctx.createGain();
          cg.gain.setValueAtTime(0, now + 0.05);
          cg.gain.linearRampToValueAtTime(0.15, now + 0.15);
          cg.gain.exponentialRampToValueAtTime(0.01, now + preset.noteDur * 0.85);
          osc3.connect(cg);
          cg.connect(masterGain);
          osc3.start(now + 0.05);
          osc3.stop(now + preset.noteDur);
        }
      };

      const tick = () => {
        playNote();
        const preset = getPreset();
        const next = preset.intervalMs + Math.random() * preset.intervalJitter;
        intervalRef.current = setTimeout(tick, next) as unknown as ReturnType<typeof setInterval>;
      };
      tick();
      activeRef.current = true;
    } catch {
      console.warn('Music not available');
    }
  }, []);

  const stopMusic = useCallback(() => {
    if (intervalRef.current) clearTimeout(intervalRef.current as unknown as number);
    if (ctxRef.current && ctxRef.current.state !== 'closed') {
      ctxRef.current.close().catch(() => {});
    }
    ctxRef.current = null;
    activeRef.current = false;
  }, []);

  const toggle = useCallback(() => {
    setIsPlaying(prev => {
      const next = !prev;
      localStorage.setItem('game-music', next ? 'on' : 'off');
      if (next) startMusic(); else stopMusic();
      return next;
    });
  }, [startMusic, stopMusic]);

  const setTrack = useCallback((id: MusicTrackId) => {
    setTrackId(id);
    localStorage.setItem('game-music-track', id);
  }, []);

  useEffect(() => {
    if (!isPlaying) return;
    const handler = () => {
      startMusic();
      document.removeEventListener('click', handler);
      document.removeEventListener('touchstart', handler);
    };
    document.addEventListener('click', handler, { once: true });
    document.addEventListener('touchstart', handler, { once: true });
    return () => {
      document.removeEventListener('click', handler);
      document.removeEventListener('touchstart', handler);
      stopMusic();
    };
  }, [isPlaying, startMusic, stopMusic]);

  return { isPlaying, toggle, trackId, setTrack, tracks: MUSIC_TRACKS };
}
