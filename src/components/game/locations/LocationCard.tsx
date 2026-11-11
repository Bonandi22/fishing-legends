import { Lock } from 'lucide-react';
import { FishingLocation } from '@/game/types';
import { useI18n } from '@/game/i18n';
import LocationArt from './LocationArt';
import SpeciesSpectrum from './SpeciesSpectrum';

import atlanticImg from '@/assets/locations/atlantic.jpg';
import caribbeanImg from '@/assets/locations/caribbean.jpg';
import mediterraneanImg from '@/assets/locations/mediterranean.jpg';
import pacificImg from '@/assets/locations/pacific.jpg';
import amazonImg from '@/assets/locations/amazon.jpg';
import nileImg from '@/assets/locations/nile.jpg';
import mississippiImg from '@/assets/locations/mississippi.jpg';
import danubeImg from '@/assets/locations/danube.jpg';
import titicacaImg from '@/assets/locations/titicaca.jpg';
import baikalImg from '@/assets/locations/baikal.jpg';
import victoriaImg from '@/assets/locations/victoria.jpg';
import comoImg from '@/assets/locations/como.jpg';

const LOCATION_IMAGES: Record<string, string> = {
  atlantic: atlanticImg, caribbean: caribbeanImg, mediterranean: mediterraneanImg,
  pacific: pacificImg, amazon: amazonImg, nile: nileImg, mississippi: mississippiImg,
  danube: danubeImg, titicaca: titicacaImg, baikal: baikalImg, victoria: victoriaImg, como: comoImg,
};

interface Props {
  location: FishingLocation;
  unlocked: boolean;
  playerLevel: number;
  onSelect: (location: FishingLocation) => void;
}

export default function LocationCard({ location, unlocked, playerLevel, onSelect }: Props) {
  const { t } = useI18n();
  const img = LOCATION_IMAGES[location.id];
  const shortfall = location.requiredLevel - playerLevel;

  const body = (
    <>
      <LocationArt
        name={location.name}
        img={img}
        emoji={location.emoji}
        waterColor={location.waterColor}
        uncharted={!unlocked}
      />
      <div className="flex flex-1 flex-col gap-2.5 p-4">
        <h3 className="font-display text-lg font-bold leading-none tracking-wide text-foreground">
          {location.name}
        </h3>
        <p className="line-clamp-2 text-sm leading-snug text-muted-foreground">{location.description}</p>
        <div className="mt-auto pt-1">
          {unlocked ? (
            <SpeciesSpectrum fishIds={location.fishIds} />
          ) : (
            <p className="flex items-center gap-1.5 text-sm font-semibold text-lure/90">
              <Lock className="h-3.5 w-3.5" aria-hidden="true" />
              {t('loc.reachLevel')} {location.requiredLevel}
              {shortfall > 1 && (
                <span className="font-normal text-muted-foreground">(+{shortfall})</span>
              )}
            </p>
          )}
        </div>
      </div>
    </>
  );

  const shell =
    'group menu-panel flex h-full w-full flex-col overflow-hidden rounded-2xl text-left transition-colors';

  if (!unlocked) {
    return (
      <div
        data-location={location.id}
        className={`${shell} opacity-95`}
        aria-label={`${location.name}, ${t('loc.reachLevel')} ${location.requiredLevel}`}
      >
        {body}
      </div>
    );
  }

  return (
    <button
      type="button"
      data-location={location.id}
      onClick={() => onSelect(location)}
      className={`${shell} focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-lure hover:border-lure/40`}
    >
      {body}
    </button>
  );
}
