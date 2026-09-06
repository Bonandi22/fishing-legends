import { motion, useReducedMotion, type Variants } from 'framer-motion';
import { LOCATIONS } from '@/game/data';
import { FishingLocation } from '@/game/types';
import ChartField from './locations/ChartField';
import SurveyHeader from './locations/SurveyHeader';
import LocationCard from './locations/LocationCard';

interface Props {
  playerLevel: number;
  unlockedLocations: string[];
  world?: 1 | 2 | 3;
  onSelect: (location: FishingLocation) => void;
  onBack: () => void;
}

export default function LocationSelect({ playerLevel, unlockedLocations, world = 1, onSelect, onBack }: Props) {
  const reduce = useReducedMotion();

  const visible = LOCATIONS.filter(l => (l.world ?? 1) === world);
  const charted = visible.filter(l => unlockedLocations.includes(l.id)).length;

  const grid: Variants = {
    hidden: {},
    show: { transition: { staggerChildren: 0.05, delayChildren: 0.04 } },
  };
  const cell: Variants = {
    hidden: { opacity: 0, y: -16 },
    show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: 'easeOut' } },
  };

  return (
    <div className="screen-shell chart-surface relative overflow-y-auto">
      <ChartField />
      <div className="relative z-10 mx-auto max-w-5xl">
        <SurveyHeader
          world={world}
          charted={charted}
          total={visible.length}
          playerLevel={playerLevel}
          onBack={onBack}
        />

        <motion.div
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
          variants={grid}
          initial={reduce ? 'show' : 'hidden'}
          animate="show"
        >
          {visible.map(loc => (
            <motion.div key={loc.id} variants={cell}>
              <LocationCard
                location={loc}
                unlocked={unlockedLocations.includes(loc.id)}
                playerLevel={playerLevel}
                onSelect={onSelect}
              />
            </motion.div>
          ))}
        </motion.div>
      </div>
    </div>
  );
}
