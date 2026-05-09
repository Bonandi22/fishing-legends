import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { PlayerState, BOAT_SKINS } from '@/game/types';
import { useI18n } from '@/game/i18n';

interface Props {
  player: PlayerState;
  onBuy: (skinId: string, price: number) => void;
  onEquip: (skinId: string) => void;
  onBack: () => void;
}

export default function BoatSkinsShop({ player, onBuy, onEquip, onBack }: Props) {
  const { t } = useI18n();

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-foreground">{t('boat.title')}</h1>
            <p className="text-muted-foreground">💰 {player.coins} {t('mult.coins')}</p>
          </div>
          <Button variant="outline" onClick={onBack}>{t('loc.back')}</Button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {BOAT_SKINS.map((skin, i) => {
            const owned = player.ownedBoatSkins.includes(skin.id);
            const equipped = player.activeBoatSkin === skin.id;
            const accent = skin.rail[1];

            return (
              <motion.div key={skin.id} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.05 }}>
                <Card className={`border-2 ${equipped ? 'border-primary shadow-lg shadow-primary/20' : owned ? 'border-accent' : 'border-border'}`}>
                  <CardContent className="p-4 text-center">
                    {/* Mini preview */}
                    <div
                      className="w-full h-20 mx-auto mb-2 rounded-xl flex items-end justify-center overflow-hidden relative"
                      style={{ background: `linear-gradient(to bottom, ${skin.hull[0]}, ${skin.hull[2]})` }}
                    >
                      <div
                        className="w-[88%] h-12 rounded-t-2xl"
                        style={{ background: `linear-gradient(to bottom, ${skin.deck[0]}, ${skin.deck[2]}, ${skin.deck[4]})` }}
                      />
                      <div
                        className="absolute left-[6%] right-[6%] h-1.5 rounded-full"
                        style={{ bottom: '46px', background: `linear-gradient(to bottom, ${skin.rail[0]}, ${skin.rail[2]})` }}
                      />
                      <span className="absolute top-1 right-1 text-base" style={{ color: accent }}>{skin.emoji}</span>
                    </div>
                    <p className="font-bold text-foreground text-sm">{skin.name}</p>
                    {skin.price > 0 && <p className="text-xs text-muted-foreground">💰 {skin.price}</p>}
                    <div className="mt-2">
                      {equipped ? (
                        <span className="text-xs font-bold text-primary">✅ {t('skins.equipped')}</span>
                      ) : owned ? (
                        <Button size="sm" variant="outline" onClick={() => onEquip(skin.id)} className="w-full text-xs">
                          {t('skins.equip')}
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          onClick={() => onBuy(skin.id, skin.price)}
                          disabled={player.coins < skin.price}
                          className="w-full text-xs"
                        >
                          {player.coins < skin.price ? t('mult.noCoins') : t('skins.buy')}
                        </Button>
                      )}
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
