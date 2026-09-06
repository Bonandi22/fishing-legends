import { useI18n } from '@/game/i18n';
import { RARITY_CONFIG } from '@/game/types';
import { fishRarityComposition, rarityColor } from './rarity';

interface Props {
  fishIds: string[];
}

/**
 * How deep a water runs, read as an echo trace: one band per rarity present,
 * common on the left. Band width follows how often that tier actually bites
 * here (damped so the rare end stays visible), so a water that reaches the
 * abyssal tiers shows a longer, darker tail. The trailing number is the roster
 * size.
 */
export default function SpeciesSpectrum({ fishIds }: Props) {
  const { t } = useI18n();
  const slices = fishRarityComposition(fishIds);
  const total = slices.reduce((sum, s) => sum + s.count, 0);
  if (total === 0) return null;

  const bands = slices.map(s => ({
    ...s,
    weight: s.count * Math.sqrt(RARITY_CONFIG[s.rarity].chance),
  }));
  const breakdown = slices.map(s => `${s.count} ${RARITY_CONFIG[s.rarity].label}`).join(' · ');

  return (
    <div className="flex items-center gap-2">
      <span
        className="flex h-2 flex-1 gap-[2px] overflow-hidden rounded-sm"
        role="img"
        aria-label={`${total} ${t('loc.fishCount')}: ${breakdown}`}
      >
        {bands.map(b => (
          <span
            key={b.rarity}
            className="block h-full"
            style={{ flexGrow: b.weight, backgroundColor: rarityColor(b.rarity) }}
          />
        ))}
      </span>
      <span className="shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">{total}</span>
    </div>
  );
}
