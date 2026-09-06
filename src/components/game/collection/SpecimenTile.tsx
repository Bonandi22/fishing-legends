import { Fish } from '@/game/types';
import { useI18n, getRarityLabel } from '@/game/i18n';
import { FISH_IMAGES } from '@/game/fishImages';
import { rarityColor } from '../locations/rarity';

interface Props {
  fish: Fish;
  caught: boolean;
  record?: number;
}

/**
 * One entry in the specimen catalogue. Recorded species show as a mounted
 * plate with the personal-best weight; the rest are an empty mount that still
 * signals which rarity tier would fill it.
 */
export default function SpecimenTile({ fish, caught, record }: Props) {
  const { lang, t } = useI18n();
  const tint = rarityColor(fish.rarity);
  const img = FISH_IMAGES[fish.id];

  return (
    <div
      className="menu-panel flex flex-col items-center gap-1 rounded-xl p-3 text-center"
      style={{ borderColor: caught ? `${tint}` : undefined }}
    >
      <div className="flex h-14 items-center justify-center">
        {caught && img ? (
          <img src={img} alt={fish.name} className="h-14 w-14 object-contain" loading="lazy" />
        ) : (
          <span className={`text-3xl ${caught ? '' : 'opacity-30 grayscale'}`}>
            {caught ? fish.emoji : '🐟'}
          </span>
        )}
      </div>

      <p className="w-full truncate text-sm font-semibold text-foreground">
        {caught ? fish.name : '—'}
      </p>

      <span
        className="inline-flex items-center gap-1 text-[0.7rem] font-medium"
        style={{ color: tint }}
      >
        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: tint }} />
        {getRarityLabel(fish.rarity, lang)}
      </span>

      {caught && record !== undefined && (
        <p className="text-[0.7rem] tabular-nums text-muted-foreground">
          {t('col.record')} {record} kg
        </p>
      )}
    </div>
  );
}
