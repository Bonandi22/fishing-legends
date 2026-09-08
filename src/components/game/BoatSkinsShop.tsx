import { motion } from 'framer-motion';
import { PlayerState, BOAT_SKINS } from '@/game/types';
import { useI18n } from '@/game/i18n';
import GameScreen from './shell/GameScreen';
import { screenItem } from './shell/motion';
import CosmeticCard from './shops/CosmeticCard';
import BoatPreview from './shops/BoatPreview';

interface Props {
  player: PlayerState;
  onBuy: (skinId: string, price: number) => void;
  onEquip: (skinId: string) => void;
  onBack: () => void;
  buying?: boolean;
}

export default function BoatSkinsShop({ player, onBuy, onEquip, onBack, buying = false }: Props) {
  const { t } = useI18n();
  const skins = BOAT_SKINS.filter(s => !s.exclusive);

  return (
    <GameScreen title={t('boat.name')} onBack={onBack} coins={player.coins}>
      <motion.div variants={screenItem} className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {skins.map(skin => (
          <CosmeticCard
            key={skin.id}
            name={skin.name}
            price={skin.price}
            owned={player.ownedBoatSkins.includes(skin.id)}
            equipped={player.activeBoatSkin === skin.id}
            canAfford={player.coins >= skin.price}
            busy={buying}
            preview={<BoatPreview skin={skin} />}
            onBuy={() => onBuy(skin.id, skin.price)}
            onEquip={() => onEquip(skin.id)}
          />
        ))}
      </motion.div>
    </GameScreen>
  );
}
