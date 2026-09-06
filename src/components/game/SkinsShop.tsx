import { motion } from 'framer-motion';
import { ChevronRight } from 'lucide-react';
import { PlayerState, ROD_SKINS } from '@/game/types';
import { useI18n } from '@/game/i18n';
import GameScreen from './shell/GameScreen';
import { screenItem } from './shell/motion';
import CosmeticCard from './shops/CosmeticCard';
import RodPreview from './shops/RodPreview';

interface Props {
  player: PlayerState;
  onBuy: (skinId: string, price: number) => void;
  onEquip: (skinId: string) => void;
  onBack: () => void;
  onOpenBoatVisuals: () => void;
}

export default function SkinsShop({ player, onBuy, onEquip, onBack, onOpenBoatVisuals }: Props) {
  const { t } = useI18n();
  const skins = ROD_SKINS.filter(s => !s.exclusive);

  return (
    <GameScreen title={t('skins.name')} onBack={onBack} coins={player.coins}>
      <motion.button
        type="button"
        variants={screenItem}
        onClick={onOpenBoatVisuals}
        className="menu-row mb-5 flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm text-foreground"
      >
        <span className="flex-1">{t('skins.boatLink')}</span>
        <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
      </motion.button>

      <motion.div variants={screenItem} className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {skins.map(skin => (
          <CosmeticCard
            key={skin.id}
            name={skin.name}
            price={skin.price}
            owned={player.ownedSkins.includes(skin.id)}
            equipped={player.activeSkin === skin.id}
            canAfford={player.coins >= skin.price}
            preview={<RodPreview skin={skin} />}
            onBuy={() => onBuy(skin.id, skin.price)}
            onEquip={() => onEquip(skin.id)}
          />
        ))}
      </motion.div>
    </GameScreen>
  );
}
