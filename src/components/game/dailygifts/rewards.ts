import { DailyGiftReward, ROD_SKINS, BOAT_SKINS } from '@/game/types';

type T = (key: 'daily.coins' | 'daily.rewardLuck' | 'daily.rewardStrength' | 'daily.boatSkin' | 'daily.rodSkin') => string;

/** Human label for a daily reward, e.g. "150 moedas" or "Skin de barco: Leviatã". */
export function rewardLabel(r: DailyGiftReward, t: T): string {
  if (r.type === 'coins') return `${r.amount} ${t('daily.coins')}`;
  if (r.type === 'multiplier') return r.kind === 'luck' ? t('daily.rewardLuck') : t('daily.rewardStrength');
  if (r.type === 'boatSkin') {
    const b = BOAT_SKINS.find(s => s.id === r.skinId);
    return `${t('daily.boatSkin')}: ${b?.name ?? r.skinId}`;
  }
  const s = ROD_SKINS.find(x => x.id === r.skinId);
  return `${t('daily.rodSkin')}: ${s?.name ?? r.skinId}`;
}

export function isExclusive(r: DailyGiftReward): boolean {
  return r.type === 'boatSkin' || r.type === 'rodSkin';
}
