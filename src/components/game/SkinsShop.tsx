import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { PlayerState, ROD_SKINS } from '@/game/types';
import { useI18n } from '@/game/i18n';

interface Props {
  player: PlayerState;
  onBuy: (skinId: string, price: number) => void;
  onEquip: (skinId: string) => void;
  onBack: () => void;
  onOpenBoatVisuals: () => void;
}

export default function SkinsShop({ player, onBuy, onEquip, onBack, onOpenBoatVisuals }: Props) {
  const { t } = useI18n();

  return (
    <div className="screen-shell bg-background">
      <div className="max-w-4xl mx-auto">
        <div className="screen-header">
          <div>
            <h1 className="text-3xl font-bold text-foreground">{t('skins.title')}</h1>
            <p className="text-muted-foreground">💰 {player.coins} {t('mult.coins')}</p>
          </div>
          <Button variant="outline" onClick={onBack}>{t('loc.back')}</Button>
        </div>

        <div className="mb-4">
          <Button onClick={onOpenBoatVisuals} size="lg" className="w-full font-bold">
            {t('skins.visual')}
          </Button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {ROD_SKINS.filter(s => !s.exclusive).map((skin, i) => {
            const owned = player.ownedSkins.includes(skin.id);
            const equipped = player.activeSkin === skin.id;

            return (
              <motion.div key={skin.id} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.05 }}>
                <Card className={`border-2 ${equipped ? 'border-primary shadow-lg shadow-primary/20' : owned ? 'border-accent' : 'border-border'}`}>
                  <CardContent className="p-4 text-center">
                    <div
                      className="w-full h-20 mb-2 rounded-xl relative overflow-hidden flex items-center justify-center"
                      style={{ background: `linear-gradient(135deg, ${skin.color}22, ${skin.color}11)`, border: `2px solid ${skin.color}` }}
                    >
                      {/* Mini rod preview using the skin's real colors */}
                      <div className="relative w-[78%] h-3 rotate-[-28deg]">
                        {/* grip */}
                        <div
                          className="absolute left-0 top-0 h-full w-[28%] rounded-l-full"
                          style={{ background: `linear-gradient(to bottom, ${skin.gripColor}, ${skin.rodColor})` }}
                        />
                        {/* reel */}
                        <div
                          className="absolute left-[24%] -top-1 w-3 h-5 rounded-full border"
                          style={{ background: skin.reelColor, borderColor: skin.accentColor }}
                        />
                        {/* blank */}
                        <div
                          className="absolute right-0 top-[35%] h-[30%] w-[72%] rounded-r-full"
                          style={{
                            background: `linear-gradient(to right, ${skin.rodColor}, ${skin.accentColor})`,
                            boxShadow: skin.emissive ? `0 0 8px ${skin.emissive}` : undefined,
                          }}
                        />
                        {/* thread wraps */}
                        <div className="absolute right-[18%] top-[30%] h-[40%] w-[2px]" style={{ background: skin.accentColor }} />
                        <div className="absolute right-[42%] top-[30%] h-[40%] w-[2px]" style={{ background: skin.accentColor }} />
                      </div>
                      <span className="absolute top-0.5 right-1 text-sm">{skin.emoji}</span>
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
