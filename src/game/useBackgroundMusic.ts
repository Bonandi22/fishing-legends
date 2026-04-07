import { useState, useEffect, useRef, useCallback } from 'react';

// Casual lo-fi fishing game background music using Web Audio API
export function useBackgroundMusic() {
  const [isPlaying, setIsPlaying] = useState(() => {
    return localStorage.getItem('game-music') !== 'off';
  });
  const ctxRef = useRef<AudioContext | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();
  const activeRef = useRef(false);

  const startMusic = useCallback(() => {
    if (activeRef.current) return;
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      ctxRef.current = ctx;
      const masterGain = ctx.createGain();
      masterGain.gain.value = 0.12;
      masterGain.connect(ctx.destination);
      gainRef.current = masterGain;

      // Pentatonic scale notes (peaceful)
      const scale = [261.63, 293.66, 329.63, 392.00, 440.00, 523.25, 587.33, 659.25];
      let noteIndex = 0;

      const playNote = () => {
        if (!ctxRef.current || ctxRef.current.state === 'closed') return;
        const now = ctx.currentTime;

        // Pick a note from pentatonic scale with some randomness
        noteIndex = (noteIndex + Math.floor(Math.random() * 3) + 1) % scale.length;
        const freq = scale[noteIndex];

        // Soft sine + triangle pad
        const osc1 = ctx.createOscillator();
        osc1.type = 'sine';
        osc1.frequency.value = freq;

        const osc2 = ctx.createOscillator();
        osc2.type = 'triangle';
        osc2.frequency.value = freq * 0.5; // octave below

        const noteGain = ctx.createGain();
        noteGain.gain.setValueAtTime(0, now);
        noteGain.gain.linearRampToValueAtTime(0.3, now + 0.1);
        noteGain.gain.exponentialRampToValueAtTime(0.01, now + 1.8);

        osc1.connect(noteGain);
        osc2.connect(noteGain);
        noteGain.connect(masterGain);

        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + 2);
        osc2.stop(now + 2);

        // Occasional chord
        if (Math.random() > 0.6) {
          const chordFreq = scale[(noteIndex + 2) % scale.length];
          const osc3 = ctx.createOscillator();
          osc3.type = 'sine';
          osc3.frequency.value = chordFreq;
          const cg = ctx.createGain();
          cg.gain.setValueAtTime(0, now + 0.05);
          cg.gain.linearRampToValueAtTime(0.15, now + 0.15);
          cg.gain.exponentialRampToValueAtTime(0.01, now + 1.5);
          osc3.connect(cg);
          cg.connect(masterGain);
          osc3.start(now + 0.05);
          osc3.stop(now + 1.8);
        }
      };

      // Play a note every ~800ms with slight variation
      const scheduleNotes = () => {
        playNote();
        intervalRef.current = setInterval(() => {
          playNote();
        }, 800 + Math.random() * 400);
      };

      scheduleNotes();
      activeRef.current = true;
    } catch (e) {
      console.warn('Music not available');
    }
  }, []);

  const stopMusic = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (ctxRef.current && ctxRef.current.state !== 'closed') {
      ctxRef.current.close().catch(() => {});
    }
    ctxRef.current = null;
    gainRef.current = null;
    activeRef.current = false;
  }, []);

  const toggle = useCallback(() => {
    setIsPlaying(prev => {
      const next = !prev;
      localStorage.setItem('game-music', next ? 'on' : 'off');
      if (next) {
        startMusic();
      } else {
        stopMusic();
      }
      return next;
    });
  }, [startMusic, stopMusic]);

  // Auto-start on first user interaction if enabled
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

  return { isPlaying, toggle };
}
