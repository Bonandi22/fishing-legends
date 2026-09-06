import { Coins, Zap, Sparkles, Ship, Anchor } from 'lucide-react';
import { DailyGiftReward } from '@/game/types';

export default function RewardIcon({ r, className = 'h-6 w-6' }: { r: DailyGiftReward; className?: string }) {
  if (r.type === 'coins') return <Coins className={`${className} text-lure`} aria-hidden="true" />;
  if (r.type === 'multiplier') {
    return r.kind === 'luck'
      ? <Sparkles className={`${className} text-biolume`} aria-hidden="true" />
      : <Zap className={`${className} text-biolume`} aria-hidden="true" />;
  }
  if (r.type === 'boatSkin') return <Ship className={`${className} text-lure`} aria-hidden="true" />;
  return <Anchor className={`${className} text-lure`} aria-hidden="true" />;
}
