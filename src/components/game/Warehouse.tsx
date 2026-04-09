import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { PlayerState, WAREHOUSE_LIMIT, FISH_COIN_VALUE } from '@/game/types';
import { FISH_IMAGES } from '@/game/fishImages';
import { useI18n, getRarityLabel } from '@/game/i18n';

interface Props {
  player: PlayerState;
  onSell: () => void;
  onBack: () => void;
}

export default function Warehouse({ player, onSell, onBack }: Props) {
  const { lang, t } = useI18n();
  const warehouse = player.warehouse;
  const totalXp = warehouse.reduce((sum, c) => sum + Math.floor(c.fish.xp * 0.5), 0);
  const totalCoins = warehouse.reduce((sum, c) => sum + FISH_COIN_VALUE[c.fish.rarity], 0);

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-foreground">{t('wh.title')}</h1>
            <p className="text-muted-foreground">{warehouse.length}/{WAREHOUSE_LIMIT} {t('wh.stored')}</p>
          </div>
          <Button variant="outline" onClick={onBack}>{t('loc.back')}</Button>
        </div>

        {warehouse.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-6xl mb-4">📦</div>
            <p className="text-xl text-muted-foreground">{t('wh.empty')}</p>
            <p className="text-sm text-muted-foreground mt-2">{t('wh.emptyMsg')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 mb-24">
            {warehouse.map((caught, i) => (
              <motion.div key={caught.timestamp + '-' + i} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.04 }}>
                <Card className={`border-2 border-rarity-${caught.fish.rarity}`}>
                  <CardContent className="p-3 text-center">
                    {FISH_IMAGES[caught.fish.id] ? (
                      <img src={FISH_IMAGES[caught.fish.id]} alt={caught.fish.name} className="w-16 h-16 object-contain mx-auto mb-1" />
                    ) : (
                      <div className="text-3xl mb-1">{caught.fish.emoji}</div>
                    )}
                    <p className="text-sm font-bold text-foreground truncate">{caught.fish.name}</p>
                    <p className={`text-xs font-semibold text-rarity-${caught.fish.rarity}`}>{getRarityLabel(caught.fish.rarity, lang)}</p>
                    <p className="text-xs text-muted-foreground">{caught.weight} kg</p>
                    <p className="text-xs text-primary">+{Math.floor(caught.fish.xp * 0.5)} XP</p>
                    <p className="text-xs text-accent-foreground">💰 +{FISH_COIN_VALUE[caught.fish.rarity]}</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        )}

        {warehouse.length > 0 && (
          <div className="fixed bottom-6 right-6 z-50">
            <Button onClick={onSell} size="lg" className="bg-accent text-accent-foreground hover:bg-accent/90 font-bold text-lg shadow-lg">
              {t('wh.sell')} (+{totalXp} XP | 💰 +{totalCoins})
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
