import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { LOCATIONS } from '@/game/data';
import { FishingLocation, Rarity } from '@/game/types';
import { Lock } from 'lucide-react';

interface Props {
  playerLevel: number;
  unlockedLocations: string[];
  onSelect: (location: FishingLocation) => void;
  onBack: () => void;
}

const typeLabels: Record<string, string> = { ocean: '🌊 Mar', river: '🏞️ Rio', lake: '🏔️ Lago' };

export default function LocationSelect({ playerLevel, unlockedLocations, onSelect, onBack }: Props) {
  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Escolha o Local</h1>
            <p className="text-muted-foreground">Nível {playerLevel} — {unlockedLocations.length}/{LOCATIONS.length} desbloqueados</p>
          </div>
          <Button variant="outline" onClick={onBack}>← Voltar</Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {LOCATIONS.map((loc, i) => {
            const unlocked = unlockedLocations.includes(loc.id);
            return (
              <motion.div
                key={loc.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <Card
                  className={`cursor-pointer transition-all border-2 ${
                    unlocked
                      ? 'hover:border-primary hover:shadow-lg hover:shadow-primary/10 border-border'
                      : 'opacity-50 border-border cursor-not-allowed'
                  }`}
                  onClick={() => unlocked && onSelect(loc)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <span className="text-3xl">{loc.emoji}</span>
                      {!unlocked && <Lock className="w-5 h-5 text-muted-foreground" />}
                    </div>
                    <h3 className="font-bold text-foreground text-lg">{loc.name}</h3>
                    <p className="text-sm text-muted-foreground mb-2">{loc.description}</p>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="bg-secondary px-2 py-0.5 rounded-full text-secondary-foreground">
                        {typeLabels[loc.type]}
                      </span>
                      <span className="bg-secondary px-2 py-0.5 rounded-full text-secondary-foreground">
                        Nv. {loc.requiredLevel}
                      </span>
                      <span className="bg-secondary px-2 py-0.5 rounded-full text-secondary-foreground">
                        {loc.fishIds.length} peixes
                      </span>
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
