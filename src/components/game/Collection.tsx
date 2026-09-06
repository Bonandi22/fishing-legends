import { useState } from 'react';
import { motion } from 'framer-motion';
import { PlayerState, Rarity } from '@/game/types';
import { FISH } from '@/game/data';
import { useI18n, getRarityLabel } from '@/game/i18n';
import GameScreen from './shell/GameScreen';
import FilterChip from './shell/FilterChip';
import { screenItem } from './shell/motion';
import SpecimenTile from './collection/SpecimenTile';

interface Props {
  player: PlayerState;
  onBack: () => void;
}

const RARITIES: Rarity[] = ['common', 'uncommon', 'mythic', 'legendary', 'abyssal', 'volcanic', 'platinum', 'legends', 'cosmic'];

export default function Collection({ player, onBack }: Props) {
  const { lang, t } = useI18n();
  const [filter, setFilter] = useState<Rarity | 'all'>('all');

  const caughtIds = new Set(player.collection.map(c => c.fish.id));
  const recordByFish = new Map<string, number>();
  for (const c of player.collection) {
    recordByFish.set(c.fish.id, Math.max(recordByFish.get(c.fish.id) ?? 0, c.weight));
  }

  // Recorded specimens sit at the top so the screen reads as a collection
  // you're building, not a checklist of gaps.
  const shown = FISH
    .filter(f => filter === 'all' || f.rarity === filter)
    .sort((a, b) => Number(caughtIds.has(b.id)) - Number(caughtIds.has(a.id)));

  const readouts = [
    { label: t('col.level'), value: player.level },
    { label: t('col.totalCaught'), value: player.totalFishCaught },
    { label: t('col.heaviest'), value: player.heaviestFish ? `${player.heaviestFish.weight} kg` : '—' },
  ];

  return (
    <GameScreen
      title={t('col.title')}
      onBack={onBack}
      subtitle={`${caughtIds.size}/${FISH.length} ${t('col.species')} · ${player.totalFishCaught} ${t('col.caught')}`}
    >
      <motion.dl
        variants={screenItem}
        className="menu-panel mb-5 flex flex-wrap gap-x-10 gap-y-3 rounded-2xl p-4 sm:w-fit"
      >
        {readouts.map(r => (
          <div key={r.label}>
            <dt className="text-[0.7rem] uppercase leading-tight tracking-wide text-muted-foreground">{r.label}</dt>
            <dd className="text-lg font-bold tabular-nums text-foreground">{r.value}</dd>
          </div>
        ))}
      </motion.dl>

      <motion.div variants={screenItem} className="mb-4 flex flex-wrap gap-1.5">
        <FilterChip active={filter === 'all'} onClick={() => setFilter('all')}>
          {t('col.all')}
        </FilterChip>
        {RARITIES.map(r => (
          <FilterChip key={r} active={filter === r} onClick={() => setFilter(r)}>
            {getRarityLabel(r, lang)}
          </FilterChip>
        ))}
      </motion.div>

      <motion.div
        variants={screenItem}
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4"
      >
        {shown.map(fish => (
          <SpecimenTile
            key={fish.id}
            fish={fish}
            caught={caughtIds.has(fish.id)}
            record={recordByFish.get(fish.id)}
          />
        ))}
      </motion.div>
    </GameScreen>
  );
}
