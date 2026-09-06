import type { ReactNode } from 'react';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/game/i18n';
import PriceTag from './PriceTag';

interface Props {
  name: string;
  price: number;
  owned: boolean;
  equipped: boolean;
  canAfford: boolean;
  preview: ReactNode;
  onBuy: () => void;
  onEquip: () => void;
}

/** One item in a cosmetic shop (rod skins, boat skins). */
export default function CosmeticCard({
  name,
  price,
  owned,
  equipped,
  canAfford,
  preview,
  onBuy,
  onEquip,
}: Props) {
  const { t } = useI18n();

  const ring = equipped ? 'ring-2 ring-lure' : owned ? 'ring-1 ring-biolume/50' : '';

  return (
    <div className={`menu-panel flex h-full flex-col gap-2 rounded-xl p-3 text-center ${ring}`}>
      <div className="flex h-20 items-center justify-center overflow-hidden rounded-lg bg-menu-raised/60">
        {preview}
      </div>

      <p className="truncate text-sm font-semibold text-foreground">{name}</p>

      <div className="mt-auto flex min-h-[3.25rem] flex-col justify-end gap-1.5">
        {equipped ? (
          <span className="inline-flex items-center justify-center gap-1 text-xs font-semibold text-lure">
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
            {t('skins.equipped')}
          </span>
        ) : owned ? (
          <Button size="sm" variant="outline" onClick={onEquip} className="w-full border-biolume/40 text-xs">
            {t('skins.equip')}
          </Button>
        ) : (
          <>
            <PriceTag price={price} className="justify-center" />
            <Button
              size="sm"
              onClick={onBuy}
              disabled={!canAfford}
              className="w-full bg-lure text-xs font-semibold text-lure-foreground hover:bg-lure/90"
            >
              {canAfford ? t('skins.buy') : t('mult.noCoins')}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
