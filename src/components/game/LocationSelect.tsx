import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { LOCATIONS } from '@/game/data';
import { FishingLocation } from '@/game/types';
import { Lock } from 'lucide-react';
import { useI18n } from '@/game/i18n';

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

const locationImages: Record<string, string> = {
  atlantic: atlanticImg, caribbean: caribbeanImg, mediterranean: mediterraneanImg,
  pacific: pacificImg, amazon: amazonImg, nile: nileImg, mississippi: mississippiImg,
  danube: danubeImg, titicaca: titicacaImg, baikal: baikalImg, victoria: victoriaImg, como: comoImg,
};

interface Props {
  playerLevel: number;
  unlockedLocations: string[];
  world?: 1 | 2 | 3;
  onSelect: (location: FishingLocation) => void;
  onCastNet?: (location: FishingLocation) => void;
  onBack: () => void;
}

export default function LocationSelect({ playerLevel, unlockedLocations, world = 1, onSelect, onCastNet, onBack }: Props) {

  const { t } = useI18n();
  const typeLabels: Record<string, string> = { ocean: t('loc.ocean'), river: t('loc.river'), lake: t('loc.lake') };
  const visibleLocations = LOCATIONS.filter(l => (l.world ?? 1) === world);

  return (
    <div className="min-h-screen overflow-y-auto bg-background p-4 pb-8 md:p-8">
      <div className="max-w-5xl mx-auto">
        <div className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">{t('loc.title')} {world > 1 && <span className="text-primary">— Mundo {world}</span>}</h1>
            <p className="text-muted-foreground">{t('loc.level')} {playerLevel} — {visibleLocations.filter(l => unlockedLocations.includes(l.id)).length}/{visibleLocations.length} {t('loc.unlocked')}</p>
          </div>
          <Button variant="outline" onClick={onBack} className="w-full sm:w-auto">{t('loc.back')}</Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {visibleLocations.map((loc, i) => {
            const unlocked = unlockedLocations.includes(loc.id);
            const img = locationImages[loc.id];
            return (
              <motion.div key={loc.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                <Card
                  className={`touch-manipulation select-none cursor-pointer border-2 overflow-hidden transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${unlocked ? 'border-border hover:border-primary hover:shadow-lg hover:shadow-primary/10' : 'cursor-not-allowed border-border opacity-50'}`}
                  role={unlocked ? 'button' : undefined}
                  tabIndex={unlocked ? 0 : -1}
                  aria-label={unlocked ? `${t('loc.title')}: ${loc.name}` : `${loc.name}, ${t('loc.level')} ${loc.requiredLevel}`}
                  aria-disabled={!unlocked}
                  onClick={() => unlocked && onSelect(loc)}
                  onKeyDown={(event) => {
                    if (unlocked && (event.key === 'Enter' || event.key === ' ')) {
                      event.preventDefault();
                      onSelect(loc);
                    }
                  }}
                >
                  <div className="relative h-36 overflow-hidden" style={!img ? { background: `linear-gradient(135deg, ${loc.waterColor}, ${loc.skyColor})` } : undefined}>
                    {img ? (
                      <img src={img} alt={loc.name} className="w-full h-full object-cover" loading="lazy" width={768} height={512} />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center text-6xl">{loc.emoji}</div>
                    )}
                    {!unlocked && (
                      <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                        <Lock className="w-8 h-8 text-white/70" />
                      </div>
                    )}
                    <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent p-3">
                      <h3 className="font-bold text-white text-lg drop-shadow">{loc.name}</h3>
                    </div>
                  </div>
                  <CardContent className="p-3">
                    <p className="text-sm text-muted-foreground mb-2">{loc.description}</p>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="bg-secondary px-2 py-0.5 rounded-full text-secondary-foreground">{typeLabels[loc.type]}</span>
                      <span className="bg-secondary px-2 py-0.5 rounded-full text-secondary-foreground">Nv. {loc.requiredLevel}</span>
                      <span className="bg-secondary px-2 py-0.5 rounded-full text-secondary-foreground">{loc.fishIds.length} {t('loc.fishCount')}</span>
                    </div>
                  </CardContent>

                </Card>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
