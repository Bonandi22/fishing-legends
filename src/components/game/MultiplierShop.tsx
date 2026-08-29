import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { PlayerState, MULTIPLIER_COST, MULTIPLIER_COST_4X } from '@/game/types';
import { useI18n } from '@/game/i18n';

interface Props {
  player: PlayerState;
  onBuy: (type: 'luck' | 'strength', power?: number) => void;
  onBack: () => void;
}

export default function MultiplierShop({ player, onBuy, onBack }: Props) {
  const { t } = useI18n();
  const now = Date.now();
  const luckActive = player.luckMultiplierEnd && player.luckMultiplierEnd > now;
  const strengthActive = player.strengthMultiplierEnd && player.strengthMultiplierEnd > now;

  const multipliers = [
    { type: 'luck' as const, power: 2, emoji: '🍀', name: `2x ${t('mult.luck')}`, desc: t('mult.luckDesc'), active: luckActive, cost: MULTIPLIER_COST },
    { type: 'strength' as const, power: 2, emoji: '💪', name: `2x ${t('mult.strength')}`, desc: t('mult.strengthDesc'), active: strengthActive, cost: MULTIPLIER_COST },
    { type: 'luck' as const, power: 4, emoji: '🍀', name: `4x ${t('mult.luck')}`, desc: t('mult.luckDesc'), active: luckActive && player.luckMultiplierPower === 4, cost: MULTIPLIER_COST_4X },
    { type: 'strength' as const, power: 4, emoji: '💪', name: `4x ${t('mult.strength')}`, desc: t('mult.strengthDesc'), active: strengthActive && player.strengthMultiplierPower === 4, cost: MULTIPLIER_COST_4X },
  ];

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-foreground">{t('mult.title')}</h1>
            <p className="text-muted-foreground">💰 {player.coins} {t('mult.coins')}</p>
          </div>
          <Button variant="outline" onClick={onBack}>{t('loc.back')}</Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {multipliers.map((m, i) => (
            <motion.div key={m.type + m.power} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}>
              <Card className={`border-2 ${m.active ? 'border-primary shadow-lg shadow-primary/20' : 'border-border'}`}>
                <CardContent className="p-6 text-center">
                  <div className="text-5xl mb-3">{m.emoji}</div>
                  <h2 className="text-xl font-bold text-foreground mb-1">{m.name}</h2>
                  <p className="text-sm text-muted-foreground mb-4">{m.desc}</p>
                  <p className="text-lg font-bold text-primary mb-3">💰 {m.cost}</p>
                  <p className="text-xs text-muted-foreground mb-3">⏱️ 1 {t('mult.minute')}</p>
                  {m.active ? (
                    <motion.div
                      className="bg-primary/20 text-primary font-bold py-2 px-4 rounded-lg"
                      animate={{ scale: [1, 1.05, 1] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                    >
                      ✅ {t('mult.active')}
                    </motion.div>
                  ) : (
                    <Button
                      onClick={() => onBuy(m.type, m.power)}
                      disabled={player.coins < m.cost}
                      className="w-full"
                    >
                      {player.coins < m.cost ? t('mult.noCoins') : t('mult.buy')}
                    </Button>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
