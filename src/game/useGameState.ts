import { useState, useCallback, useEffect } from 'react';
import { PlayerState, CaughtFish, Fish, getXpForLevel, FISH_COIN_VALUE, NET_LIMIT, NET_PRICE, MULTIPLIER_COST, MULTIPLIER_COST_4X, MULTIPLIER_DURATION, AQUARIUM_REWARDS, DailyGiftReward, getDailyGiftsForWeek } from './types';
import { LOCATIONS } from './data';
import { parseSavedState, serializePlayerState } from './persistence';
import {
  addToWarehouse,
  applyXp,
  buyMultiplier as applyMultiplierPurchase,
  buyNet as applyNetPurchase,
  buyOwnedItem,
  consumeNet as applyNetConsumption,
  getUnlockedLocationIds,
  grantOwnedItem,
  spendCoins as applyCoinSpend,
} from './stateRules';
import { browserStorage, KeyValueStorage } from './storage';

const STORAGE_KEY = 'fishing-game-state';

const defaultState: PlayerState = {
  level: 1,
  xp: 0,
  xpToNextLevel: getXpForLevel(1),
  totalFishCaught: 0,
  collection: [],
  unlockedLocations: LOCATIONS.filter(l => l.requiredLevel <= 1).map(l => l.id),
  heaviestFish: null,
  warehouse: [],
  coins: 0,
  activeSkin: 'default',
  ownedSkins: ['default'],
  activeBoatSkin: 'classic',
  ownedBoatSkins: ['classic'],
  luckMultiplierEnd: null,
  strengthMultiplierEnd: null,
  lastRouletteDate: null,
  aquariumWarehouse: [],
  aquariumSectors: { 1: [], 2: [], 3: [], 4: [], 5: [] },
  dailyGiftsLastClaim: null,
  dailyGiftsDay: 1,
  dailyGiftsWeek: 1,
  nets: 10,
};

export function loadPlayerState(storage: KeyValueStorage = browserStorage): PlayerState {
  return parseSavedState(storage.get(STORAGE_KEY), defaultState);
}

export function savePlayerState(state: PlayerState, storage: KeyValueStorage = browserStorage): void {
  storage.set(STORAGE_KEY, serializePlayerState(state));
}

export function useGameState() {
  const [player, setPlayer] = useState<PlayerState>(loadPlayerState);

  useEffect(() => { savePlayerState(player); }, [player]);

  const catchFishBatch = useCallback((catches: Array<Pick<CaughtFish, 'fish' | 'weight' | 'location'>>, fromNet = false) => {
    if (catches.length === 0) return;
    setPlayer(prev => {
      const xpGain = catches.reduce((sum, caught) => sum + (fromNet ? Math.floor(caught.fish.xp * 0.3) : caught.fish.xp), 0);
      const { xp, level, xpToNextLevel } = applyXp(prev.xp, prev.level, prev.xpToNextLevel, xpGain);
      const timestampBase = Date.now();
      const newCatches: CaughtFish[] = catches.map((caught, index) => ({
        ...caught,
        timestamp: timestampBase + index,
      }));
      const newCollection = [...prev.collection, ...newCatches];
      const heaviest = newCatches.reduce<CaughtFish | null>(
        (current, caught) => !current || caught.weight > current.weight ? caught : current,
        prev.heaviestFish,
      );
      const unlockedLocations = getUnlockedLocationIds(level, LOCATIONS);
      const inventory = newCatches.reduce(
        (state, caught) => addToWarehouse(state.warehouse, state.aquariumWarehouse, caught),
        { warehouse: prev.warehouse, aquariumWarehouse: prev.aquariumWarehouse || [] },
      );

      return {
        ...prev,
        level, xp, xpToNextLevel,
        totalFishCaught: prev.totalFishCaught + newCatches.length,
        collection: newCollection,
        unlockedLocations,
        heaviestFish: heaviest,
        ...inventory,
      };
    });
  }, []);

  const catchFish = useCallback((fish: Fish, weight: number, locationId: string, fromNet = false) => {
    catchFishBatch([{ fish, weight, location: locationId }], fromNet);
  }, [catchFishBatch]);

  const sellWarehouse = useCallback(() => {
    setPlayer(prev => {
      if (prev.warehouse.length === 0) return prev;
      const bonusXp = prev.warehouse.reduce((sum, c) => sum + Math.floor(c.fish.xp * 0.5), 0);
      const bonusCoins = prev.warehouse.reduce((sum, c) => sum + FISH_COIN_VALUE[c.fish.rarity], 0);
      const { xp, level, xpToNextLevel } = applyXp(prev.xp, prev.level, prev.xpToNextLevel, bonusXp);
      const unlockedLocations = getUnlockedLocationIds(level, LOCATIONS);

      return {
        ...prev,
        xp, level, xpToNextLevel,
        unlockedLocations,
        warehouse: [],
        coins: prev.coins + bonusCoins,
      };
    });
  }, []);

  const buyMultiplier = useCallback((type: 'luck' | 'strength', power: number = 2) => {
    setPlayer(prev => applyMultiplierPurchase(prev, type, power, Date.now()));
  }, []);

  const buySkin = useCallback((skinId: string, price: number) => {
    setPlayer(prev => buyOwnedItem(prev, 'rod', skinId, price));
  }, []);

  const equipSkin = useCallback((skinId: string) => {
    setPlayer(prev => {
      if (!prev.ownedSkins.includes(skinId)) return prev;
      return { ...prev, activeSkin: skinId };
    });
  }, []);

  const buyBoatSkin = useCallback((skinId: string, price: number) => {
    setPlayer(prev => buyOwnedItem(prev, 'boat', skinId, price));
  }, []);

  const equipBoatSkin = useCallback((skinId: string) => {
    setPlayer(prev => {
      if (!prev.ownedBoatSkins.includes(skinId)) return prev;
      return { ...prev, activeBoatSkin: skinId };
    });
  }, []);

  const addCoins = useCallback((amount: number) => {
    setPlayer(prev => ({ ...prev, coins: prev.coins + Math.max(0, amount) }));
  }, []);

  const addSkin = useCallback((skinId: string): void => {
    setPlayer(prev => grantOwnedItem(prev, 'rod', skinId, 500));
  }, []);

  const addBoatSkin = useCallback((skinId: string): void => {
    setPlayer(prev => grantOwnedItem(prev, 'boat', skinId, 500));
  }, []);

  const spendCoins = useCallback((amount: number): void => {
    setPlayer(prev => applyCoinSpend(prev, amount));
  }, []);

  const addMultiplier = useCallback((type: 'luck' | 'strength') => {
    setPlayer(prev => {
      const end = Date.now() + MULTIPLIER_DURATION;
      return {
        ...prev,
        ...(type === 'luck' ? { luckMultiplierEnd: end } : { strengthMultiplierEnd: end }),
      };
    });
  }, []);

  const setLastRouletteDate = useCallback((date: string) => {
    setPlayer(prev => ({ ...prev, lastRouletteDate: date }));
  }, []);

  const moveAquariumFishToSector = useCallback((timestamp: number, sector: number) => {
    setPlayer(prev => {
      const aw = prev.aquariumWarehouse || [];
      const idx = aw.findIndex(c => c.timestamp === timestamp);
      if (idx < 0) return prev;
      const caught = aw[idx];
      const reward = AQUARIUM_REWARDS[caught.fish.rarity];
      const { xp, level, xpToNextLevel } = applyXp(prev.xp, prev.level, prev.xpToNextLevel, reward.xp);
      const unlockedLocations = getUnlockedLocationIds(level, LOCATIONS);
      const sectors = { ...(prev.aquariumSectors || { 1:[],2:[],3:[],4:[],5:[] }) };
      sectors[sector] = [...(sectors[sector] || []), caught];
      return {
        ...prev,
        xp, level, xpToNextLevel,
        unlockedLocations,
        coins: prev.coins + reward.coins,
        aquariumWarehouse: aw.filter((_, i) => i !== idx),
        aquariumSectors: sectors,
      };
    });
  }, []);

  const claimDailyGift = useCallback((): void => {
    const today = new Date().toISOString().slice(0, 10);
    setPlayer(prev => {
      if (prev.dailyGiftsLastClaim === today) return prev;
      const day = prev.dailyGiftsDay || 1;
      const week = prev.dailyGiftsWeek || 1;
      const gifts = getDailyGiftsForWeek(week);
      const reward = gifts[day - 1];
      const nextDay = day >= 7 ? 1 : day + 1;
      const nextWeek = day >= 7 ? week + 1 : week;
      let next = { ...prev, dailyGiftsLastClaim: today, dailyGiftsDay: nextDay, dailyGiftsWeek: nextWeek };
      if (reward.type === 'coins') {
        next.coins = prev.coins + reward.amount;
      } else if (reward.type === 'multiplier') {
        const end = Date.now() + MULTIPLIER_DURATION;
        if (reward.kind === 'luck') next.luckMultiplierEnd = end;
        else next.strengthMultiplierEnd = end;
      } else if (reward.type === 'boatSkin') {
        if (prev.ownedBoatSkins.includes(reward.skinId)) {
          next.coins = prev.coins + 1000;
        } else {
          next.ownedBoatSkins = [...prev.ownedBoatSkins, reward.skinId];
        }
      } else if (reward.type === 'rodSkin') {
        if (prev.ownedSkins.includes(reward.skinId)) {
          next.coins = prev.coins + 1000;
        } else {
          next.ownedSkins = [...prev.ownedSkins, reward.skinId];
        }
      }
      return next;
    });
  }, []);

  const consumeNet = useCallback((): void => {
    setPlayer(applyNetConsumption);
  }, []);

  const buyNet = useCallback((): void => {
    setPlayer(applyNetPurchase);
  }, []);

  const resetProgress = useCallback(() => {
    setPlayer({ ...defaultState, aquariumSectors: { 1:[],2:[],3:[],4:[],5:[] } });
  }, []);

  return {
    player, catchFish, resetProgress, sellWarehouse,
    buyMultiplier, buySkin, equipSkin,
    buyBoatSkin, equipBoatSkin,
    addCoins, addSkin, addBoatSkin, spendCoins, addMultiplier, setLastRouletteDate,
    moveAquariumFishToSector, claimDailyGift, consumeNet, buyNet, catchFishBatch,
  };
}
