import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { motion } from 'framer-motion';
import { PlayerState, NET_LIMIT, NET_PRICE } from '@/game/types';

interface Props {
  player: PlayerState;
  onBuy: () => void;
  onBack: () => void;
}

export default function NetShop({ player, onBuy, onBack }: Props) {
  const nets = player.nets ?? 0;
  const full = nets >= NET_LIMIT;
  const canAfford = player.coins >= NET_PRICE;

  return (
    <div className="screen-shell bg-background">
      <div className="max-w-xl mx-auto">
        <div className="screen-header">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">Loja de Redes</h1>
            <p className="text-muted-foreground text-sm">Cada rede custa {NET_PRICE.toLocaleString()} moedas</p>
          </div>
          <Button variant="outline" onClick={onBack}>Voltar</Button>
        </div>

        <Card className="border-2 border-border mb-4">
          <CardContent className="p-4 flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Moedas</span>
            <span className="font-bold text-foreground">{player.coins.toLocaleString()}</span>
          </CardContent>
        </Card>

        <Card className="border-2 border-primary/40">
          <CardContent className="p-6 text-center">
            <motion.div
              animate={{ y: [0, -6, 0] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
              className="text-5xl font-black text-primary mb-2"
            >
              {nets}/{NET_LIMIT}
            </motion.div>
            <p className="text-sm text-muted-foreground mb-6">Redes disponíveis</p>
            <Button
              size="lg"
              className="w-full font-bold"
              disabled={full || !canAfford}
              onClick={() => onBuy()}
            >
              {full ? 'Limite máximo atingido' : canAfford ? `Comprar 1 rede — ${NET_PRICE.toLocaleString()}` : 'Moedas insuficientes'}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
