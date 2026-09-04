import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PlayerState, Rarity } from '@/game/types';
import { FISH } from '@/game/data';
import { useI18n, getRarityLabel } from '@/game/i18n';

interface Props {
  player: PlayerState;
  onBack: () => void;
}

export default function Collection({ player, onBack }: Props) {
  const { lang, t } = useI18n();
  const caughtIds = new Set(player.collection.map(c => c.fish.id));
  const rarities: Rarity[] = ['common', 'uncommon', 'mythic', 'legendary', 'abyssal', 'volcanic', 'platinum', 'legends', 'cosmic'];

  return (
    <div className="screen-shell bg-background">
      <div className="max-w-4xl mx-auto">
        <div className="screen-header">
          <div>
            <h1 className="text-3xl font-bold text-foreground">{t('col.title')}</h1>
            <p className="text-muted-foreground">
              {caughtIds.size}/{FISH.length} {t('col.species')} • {player.totalFishCaught} {t('col.caught')}
            </p>
          </div>
          <Button variant="outline" onClick={onBack} className="touch-target shrink-0">{t('loc.back')}</Button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <Card><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-primary">{player.level}</p><p className="text-xs text-muted-foreground">{t('col.level')}</p></CardContent></Card>
          <Card><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-foreground">{player.totalFishCaught}</p><p className="text-xs text-muted-foreground">{t('col.totalCaught')}</p></CardContent></Card>
          <Card><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-foreground">{caughtIds.size}</p><p className="text-xs text-muted-foreground">{t('col.speciesCount')}</p></CardContent></Card>
          <Card><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-foreground">{player.heaviestFish ? `${player.heaviestFish.weight}kg` : '—'}</p><p className="text-xs text-muted-foreground">{t('col.heaviest')}</p></CardContent></Card>
        </div>

        <Tabs defaultValue="all">
          <TabsList className="mb-4 max-w-full overflow-x-auto justify-start">
            <TabsTrigger value="all">{t('col.all')}</TabsTrigger>
            {rarities.map(r => (
              <TabsTrigger key={r} value={r}>{getRarityLabel(r, lang)}</TabsTrigger>
            ))}
          </TabsList>

          {['all', ...rarities].map(tab => (
            <TabsContent key={tab} value={tab}>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {FISH.filter(f => tab === 'all' || f.rarity === tab).map((fish, i) => {
                  const caught = caughtIds.has(fish.id);
                  const bestCatch = player.collection.filter(c => c.fish.id === fish.id).sort((a, b) => b.weight - a.weight)[0];
                  return (
                    <motion.div key={fish.id} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.03 }}>
                      <Card className={`border-2 ${caught ? `border-rarity-${fish.rarity}` : 'border-border opacity-40'}`}>
                        <CardContent className="p-3 text-center">
                          <div className="text-3xl mb-1">{caught ? fish.emoji : '❓'}</div>
                          <p className="text-sm font-bold text-foreground truncate">{caught ? fish.name : '???'}</p>
                          <p className={`text-xs font-semibold text-rarity-${fish.rarity}`}>{getRarityLabel(fish.rarity, lang)}</p>
                          {bestCatch && <p className="text-xs text-muted-foreground mt-1">{t('col.record')}: {bestCatch.weight}kg</p>}
                        </CardContent>
                      </Card>
                    </motion.div>
                  );
                })}
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </div>
  );
}
