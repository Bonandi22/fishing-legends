import { useState, useCallback, useEffect } from 'react';
import { PlayerState, CaughtFish, Fish, getXpForLevel } from './types';
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

export function useGameState() {
  const [player, setPlayer] = useState<PlayerState>(loadState);

  useEffect(() => { saveState(player); }, [player]);

  const catchFish = useCallback((fish: Fish, weight: number, locationId: string) => {
    setPlayer(prev => {
      let newXp = prev.xp + fish.xp;
      let newLevel = prev.level;
      let xpNeeded = prev.xpToNextLevel;

      while (newXp >= xpNeeded && newLevel < 20) {
        newXp -= xpNeeded;
        newLevel++;
        xpNeeded = getXpForLevel(newLevel);
      }

      const caught: CaughtFish = { fish, weight, location: locationId, timestamp: Date.now() };
      const newCollection = [...prev.collection, caught];
      const heaviest = !prev.heaviestFish || weight > prev.heaviestFish.weight ? caught : prev.heaviestFish;
      const unlockedLocations = LOCATIONS.filter(l => l.requiredLevel <= newLevel).map(l => l.id);
      const newWarehouse = prev.warehouse.length < 15 ? [...prev.warehouse, caught] : prev.warehouse;

      return {
        level: newLevel,
        xp: newXp,
        xpToNextLevel: xpNeeded,
        totalFishCaught: prev.totalFishCaught + 1,
        collection: newCollection,
        unlockedLocations,
        heaviestFish: heaviest,
        warehouse: newWarehouse,
      };
    });
  }, []);

  const sellWarehouse = useCallback(() => {
    setPlayer(prev => {
      if (prev.warehouse.length === 0) return prev;
      const bonusXp = prev.warehouse.reduce((sum, c) => sum + Math.floor(c.fish.xp * 0.5), 0);
      let newXp = prev.xp + bonusXp;
      let newLevel = prev.level;
      let xpNeeded = prev.xpToNextLevel;

      while (newXp >= xpNeeded && newLevel < 20) {
        newXp -= xpNeeded;
        newLevel++;
        xpNeeded = getXpForLevel(newLevel);
      }

      const unlockedLocations = LOCATIONS.filter(l => l.requiredLevel <= newLevel).map(l => l.id);

      return {
        ...prev,
        xp: newXp,
        level: newLevel,
        xpToNextLevel: xpNeeded,
        unlockedLocations,
        warehouse: [],
      };
    });
  }, []);

  const resetProgress = useCallback(() => {
    setPlayer({ ...defaultState });
  }, []);

  return { player, catchFish, resetProgress, sellWarehouse };
}
