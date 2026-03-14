import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Fish, RARITY_CONFIG } from '@/game/types';

interface Props {
  fish: Fish;
  onWin: () => void;
  onLose: () => void;
}

export default function PullMinigame({ fish, onWin, onLose }: Props) {
  const config = RARITY_CONFIG[fish.rarity];
  const greenSize = config.greenZoneSize;
  const speed = config.speed;

  // Green zone position (centered)
  const greenStart = (1 - greenSize) / 2;

  const [linePos, setLinePos] = useState(0.5);
  const [greenTime, setGreenTime] = useState(0);
  const [redTime, setRedTime] = useState(0);
  const [direction, setDirection] = useState(1);
  const frameRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const greenTimeRef = useRef(0);
  const redTimeRef = useRef(0);
  const linePosRef = useRef(0.5);
  const dirRef = useRef(1);

  const isInGreen = useCallback((pos: number) => {
    return pos >= greenStart && pos <= greenStart + greenSize;
  }, [greenStart, greenSize]);

  useEffect(() => {
    lastTimeRef.current = performance.now();

    const tick = (now: number) => {
      const dt = (now - lastTimeRef.current) / 1000;
      lastTimeRef.current = now;

      // Move the line
      let newPos = linePosRef.current + dirRef.current * speed * dt * 0.8;
      if (newPos >= 1) { newPos = 1; dirRef.current = -1; }
      if (newPos <= 0) { newPos = 0; dirRef.current = 1; }
      linePosRef.current = newPos;

      // Count time in zones
      if (isInGreen(newPos)) {
        greenTimeRef.current += dt;
        redTimeRef.current = Math.max(0, redTimeRef.current - dt * 0.3);
      } else {
        redTimeRef.current += dt;
        greenTimeRef.current = Math.max(0, greenTimeRef.current - dt * 0.3);
      }

      setLinePos(newPos);
      setGreenTime(greenTimeRef.current);
      setRedTime(redTimeRef.current);

      if (greenTimeRef.current >= 10) {
        onWin();
        return;
      }
      if (redTimeRef.current >= 15) {
        onLose();
        return;
      }

      frameRef.current = requestAnimationFrame(tick);
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [speed, isInGreen, onWin, onLose]);

  const greenProgress = Math.min(greenTime / 10, 1);
  const redProgress = Math.min(redTime / 15, 1);

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <div className="w-full max-w-md px-6">
        <motion.div
          className="text-center mb-6"
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
        >
          <span className="text-5xl">{fish.emoji}</span>
          <h2 className="text-2xl font-bold text-foreground mt-2">{fish.name}</h2>
          <p className={`text-sm font-semibold text-rarity-${fish.rarity}`}>
            {RARITY_CONFIG[fish.rarity].label}
          </p>
          <p className="text-muted-foreground text-sm mt-1">Mantenha na zona verde!</p>
        </motion.div>

        {/* The bar */}
        <div className="relative h-14 rounded-xl overflow-hidden border-2 border-border bg-secondary mb-6">
          {/* Red zone (full bar background) */}
          <div className="absolute inset-0 bg-destructive/80" />
          {/* Green zone */}
          <div
            className="absolute top-0 bottom-0 bg-accent"
            style={{ left: `${greenStart * 100}%`, width: `${greenSize * 100}%` }}
          />
          {/* White line (cursor) */}
          <motion.div
            className="absolute top-0 bottom-0 w-1 bg-foreground shadow-lg shadow-foreground/50"
            style={{ left: `${linePos * 100}%` }}
          />
        </div>

        {/* Progress indicators */}
        <div className="space-y-3">
          <div>
            <div className="flex justify-between text-xs text-muted-foreground mb-1">
              <span>✅ Captura</span>
              <span>{Math.round(greenProgress * 100)}%</span>
            </div>
            <div className="h-3 rounded-full bg-secondary overflow-hidden">
              <motion.div
                className="h-full bg-accent rounded-full"
                style={{ width: `${greenProgress * 100}%` }}
              />
            </div>
          </div>
          <div>
            <div className="flex justify-between text-xs text-muted-foreground mb-1">
              <span>❌ Escape</span>
              <span>{Math.round(redProgress * 100)}%</span>
            </div>
            <div className="h-3 rounded-full bg-secondary overflow-hidden">
              <motion.div
                className="h-full bg-destructive rounded-full"
                style={{ width: `${redProgress * 100}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
