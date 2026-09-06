import { CaughtFish } from '@/game/types';
import { useI18n, getRarityLabel } from '@/game/i18n';
import { FISH_IMAGES } from '@/game/fishImages';
import { rarityColor } from '../locations/rarity';
import { haulXp, haulCoins } from './haul';

interface Props {
  caught: CaughtFish;
}

export default function HaulTile({ caught }: Props) {
  const { lang } = useI18n();
  const tint = rarityColor(caught.fish.rarity);
  const img = FISH_IMAGES[caught.fish.id];

  return (
    <div className="menu-panel flex flex-col items-center gap-1 rounded-xl p-3 text-center" style={{ borderColor: tint }}>
      <div className="flex h-14 items-center justify-center">
        {img ? (
          <img src={img} alt={caught.fish.name} className="h-14 w-14 object-contain" loading="lazy" />
        ) : (
          <span className="text-3xl">{caught.fish.emoji}</span>
        )}
      </div>
      <p className="w-full truncate text-sm font-semibold text-foreground">{caught.fish.name}</p>
      <span className="text-[0.7rem] font-medium" style={{ color: tint }}>
        {getRarityLabel(caught.fish.rarity, lang)}
      </span>
      <p className="text-xs tabular-nums text-muted-foreground">{caught.weight} kg</p>
      <p className="flex items-center gap-2 text-[0.7rem] tabular-nums">
        <span className="text-biolume">+{haulXp(caught)} XP</span>
        <span className="text-lure">💰 +{haulCoins(caught)}</span>
      </p>
    </div>
  );
}
