import { useState, useCallback, useEffect } from 'react';
import { PlayerState, CaughtFish, Fish, getXpForLevel, FISH_COIN_VALUE, MULTIPLIER_COST, MULTIPLIER_DURATION, AQUARIUM_REWARDS, DAILY_GIFTS, DailyGiftReward } from './types';
import { LOCATIONS } from './data';

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
};

function loadState(): PlayerState {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return { ...defaultState, ...parsed };
    }
  } catch {}
  return { ...defaultState };
}

function saveState(state: PlayerState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function levelUp(xp: number, level: number, xpNeeded: number) {
  let newXp = xp;
  let newLevel = level;
  let needed = xpNeeded;
  while (newXp >= needed && newLevel < 20) {
    newXp -= needed;
    newLevel++;
    needed = getXpForLevel(newLevel);
  }
  return { xp: newXp, level: newLevel, xpToNextLevel: needed };
}

export function useGameState() {
  const [player, setPlayer] = useState<PlayerState>(loadState);

  useEffect(() => { saveState(player); }, [player]);

  const catchFish = useCallback((fish: Fish, weight: number, locationId: string) => {
    setPlayer(prev => {
      const { xp, level, xpToNextLevel } = levelUp(prev.xp + fish.xp, prev.level, prev.xpToNextLevel);
      const caught: CaughtFish = { fish, weight, location: locationId, timestamp: Date.now() };
      const newCollection = [...prev.collection, caught];
      const heaviest = !prev.heaviestFish || weight > prev.heaviestFish.weight ? caught : prev.heaviestFish;
      const unlockedLocations = LOCATIONS.filter(l => l.requiredLevel <= level).map(l => l.id);
      const mainFull = prev.warehouse.length >= 15;
      const newWarehouse = mainFull ? prev.warehouse : [...prev.warehouse, caught];
      const newAquariumWarehouse = mainFull ? [...(prev.aquariumWarehouse || []), caught] : (prev.aquariumWarehouse || []);

      return {
        ...prev,
        level, xp, xpToNextLevel,
        totalFishCaught: prev.totalFishCaught + 1,
        collection: newCollection,
        unlockedLocations,
        heaviestFish: heaviest,
        warehouse: newWarehouse,
        aquariumWarehouse: newAquariumWarehouse,
      };
    });
  }, []);

  const sellWarehouse = useCallback(() => {
    setPlayer(prev => {
      if (prev.warehouse.length === 0) return prev;
      const bonusXp = prev.warehouse.reduce((sum, c) => sum + Math.floor(c.fish.xp * 0.5), 0);
      const bonusCoins = prev.warehouse.reduce((sum, c) => sum + FISH_COIN_VALUE[c.fish.rarity], 0);
      const { xp, level, xpToNextLevel } = levelUp(prev.xp + bonusXp, prev.level, prev.xpToNextLevel);
      const unlockedLocations = LOCATIONS.filter(l => l.requiredLevel <= level).map(l => l.id);

      return {
        ...prev,
        xp, level, xpToNextLevel,
        unlockedLocations,
        warehouse: [],
        coins: prev.coins + bonusCoins,
      };
    });
  }, []);

  const buyMultiplier = useCallback((type: 'luck' | 'strength') => {
    setPlayer(prev => {
      if (prev.coins < MULTIPLIER_COST) return prev;
      const end = Date.now() + MULTIPLIER_DURATION;
      return {
        ...prev,
        coins: prev.coins - MULTIPLIER_COST,
        ...(type === 'luck' ? { luckMultiplierEnd: end } : { strengthMultiplierEnd: end }),
      };
    });
  }, []);

  const buySkin = useCallback((skinId: string, price: number) => {
    setPlayer(prev => {
      if (prev.coins < price || prev.ownedSkins.includes(skinId)) return prev;
      return {
        ...prev,
        coins: prev.coins - price,
        ownedSkins: [...prev.ownedSkins, skinId],
      };
    });
  }, []);

  const equipSkin = useCallback((skinId: string) => {
    setPlayer(prev => {
      if (!prev.ownedSkins.includes(skinId)) return prev;
      return { ...prev, activeSkin: skinId };
    });
  }, []);

  const buyBoatSkin = useCallback((skinId: string, price: number) => {
    setPlayer(prev => {
      if (prev.coins < price || prev.ownedBoatSkins.includes(skinId)) return prev;
      return {
        ...prev,
        coins: prev.coins - price,
        ownedBoatSkins: [...prev.ownedBoatSkins, skinId],
      };
    });
  }, []);

  const equipBoatSkin = useCallback((skinId: string) => {
    setPlayer(prev => {
      if (!prev.ownedBoatSkins.includes(skinId)) return prev;
      return { ...prev, activeBoatSkin: skinId };
    });
  }, []);

  const addCoins = useCallback((amount: number) => {
    setPlayer(prev => ({ ...prev, coins: prev.coins + amount }));
  }, []);

  const addSkin = useCallback((skinId: string): boolean => {
    let gained = true;
    setPlayer(prev => {
      if (prev.ownedSkins.includes(skinId)) {
        gained = false;
        // Duplicate -> convert to 500 coins
        return { ...prev, coins: prev.coins + 500 };
      }
      return { ...prev, ownedSkins: [...prev.ownedSkins, skinId] };
    });
    return gained;
  }, []);

  const addBoatSkin = useCallback((skinId: string): boolean => {
    let gained = true;
    setPlayer(prev => {
      if (prev.ownedBoatSkins.includes(skinId)) {
        gained = false;
        return { ...prev, coins: prev.coins + 500 };
      }
      return { ...prev, ownedBoatSkins: [...prev.ownedBoatSkins, skinId] };
    });
    return gained;
  }, []);

  const spendCoins = useCallback((amount: number): boolean => {
    let ok = false;
    setPlayer(prev => {
      if (prev.coins < amount) return prev;
      ok = true;
      return { ...prev, coins: prev.coins - amount };
    });
    return ok;
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
      const { xp, level, xpToNextLevel } = levelUp(prev.xp + reward.xp, prev.level, prev.xpToNextLevel);
      const unlockedLocations = LOCATIONS.filter(l => l.requiredLevel <= level).map(l => l.id);
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

  const resetProgress = useCallback(() => {
    setPlayer({ ...defaultState, aquariumSectors: { 1:[],2:[],3:[],4:[],5:[] } });
  }, []);

  return {
    player, catchFish, resetProgress, sellWarehouse,
    buyMultiplier, buySkin, equipSkin,
    buyBoatSkin, equipBoatSkin,
    addCoins, addSkin, addBoatSkin, spendCoins, addMultiplier, setLastRouletteDate,
    moveAquariumFishToSector,
  };
}
