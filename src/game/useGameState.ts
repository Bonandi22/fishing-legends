import { useState, useCallback, useEffect, useRef } from 'react';
import { PlayerState, CaughtFish, Fish, getXpForLevel, NET_LIMIT, NET_PRICE } from './types';
import { LOCATIONS } from './data';
import { parseSavedState, serializePlayerState } from './persistence';
import {
  applyCatch,
  buyMultiplier as applyMultiplierPurchase,
  buyNet as applyNetPurchase,
  buyOwnedItem,
  consumeNet as applyNetConsumption,
  equipSkin as applyEquipSkin,
  placeAquariumFish,
  resolveDailyGift,
  sellWarehouse as applyWarehouseSale,
  spinDailyRoulette,
  spinSkinRoulette,
} from './stateRules';
import type { RewardGrant } from './rewards';
import { browserStorage, KeyValueStorage } from './storage';

const todayStr = () => new Date().toISOString().slice(0, 10);
const roll = (n: number) => Math.floor(Math.random() * n);

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
  const playerRef = useRef(player);

  useEffect(() => {
    playerRef.current = player;
    savePlayerState(player);
  }, [player]);

  const catchFishBatch = useCallback((catches: Array<Pick<CaughtFish, 'fish' | 'weight' | 'location'>>, fromNet = false) => {
    if (catches.length === 0) return;
    const base = Date.now();
    const withTimestamps: CaughtFish[] = catches.map((caught, index) => ({ ...caught, timestamp: base + index }));
    setPlayer(prev => applyCatch(prev, withTimestamps, { fromNet }, LOCATIONS));
  }, []);

  const catchFish = useCallback((fish: Fish, weight: number, locationId: string, fromNet = false) => {
    catchFishBatch([{ fish, weight, location: locationId }], fromNet);
  }, [catchFishBatch]);

  const sellWarehouse = useCallback(() => {
    setPlayer(prev => applyWarehouseSale(prev, LOCATIONS));
  }, []);

  const buyMultiplier = useCallback((type: 'luck' | 'strength', power: number = 2) => {
    setPlayer(prev => applyMultiplierPurchase(prev, type, power, Date.now()));
  }, []);

  const buySkin = useCallback((skinId: string, price: number) => {
    setPlayer(prev => buyOwnedItem(prev, 'rod', skinId, price));
  }, []);

  const equipSkin = useCallback((skinId: string) => {
    setPlayer(prev => applyEquipSkin(prev, 'rod', skinId));
  }, []);

  const buyBoatSkin = useCallback((skinId: string, price: number) => {
    setPlayer(prev => buyOwnedItem(prev, 'boat', skinId, price));
  }, []);

  const equipBoatSkin = useCallback((skinId: string) => {
    setPlayer(prev => applyEquipSkin(prev, 'boat', skinId));
  }, []);

  const moveAquariumFishToSector = useCallback((timestamp: number, sector: number) => {
    setPlayer(prev => placeAquariumFish(prev, timestamp, sector, LOCATIONS));
  }, []);

  // Reward flows for anonymous / degraded sessions: run the shared pure rule with
  // a Math.random roll against the latest player (playerRef, not the closed-over
  // `player`, so a rapid second click sees the applied cooldown), apply it, and
  // return the granted reward for the screen to reveal. Throw the same domain
  // codes the server does — the caller decides how to surface them.
  const claimDailyGiftLocal = useCallback((): RewardGrant => {
    const { next, reward } = resolveDailyGift(playerRef.current, todayStr(), Date.now());
    setPlayer(next);
    return reward;
  }, []);

  const spinDailyRouletteLocal = useCallback((): RewardGrant => {
    const { next, reward } = spinDailyRoulette(playerRef.current, todayStr(), Date.now(), roll);
    setPlayer(next);
    return reward;
  }, []);

  const spinSkinRouletteLocal = useCallback((): RewardGrant => {
    const { next, reward } = spinSkinRoulette(playerRef.current, roll);
    setPlayer(next);
    return reward;
  }, []);

  const consumeNet = useCallback((): void => {
    setPlayer(applyNetConsumption);
  }, []);

  const buyNet = useCallback((): void => {
    setPlayer(applyNetPurchase);
  }, []);

  // Takes an updater so the caller can merge against the CURRENT local state.
  // The server is not authoritative over local progress in 10.1 — hydration must
  // never overwrite fields the caller decided to keep (see auth/hydrate.ts).
  const replaceFromServer = useCallback((updater: (prev: PlayerState) => Partial<PlayerState>) => {
    setPlayer(prev => ({ ...prev, ...updater(prev) }));
  }, []);

  const resetProgress = useCallback(() => {
    setPlayer({ ...defaultState, aquariumSectors: { 1:[],2:[],3:[],4:[],5:[] } });
  }, []);

  return {
    player, catchFish, resetProgress, sellWarehouse,
    buyMultiplier, buySkin, equipSkin,
    buyBoatSkin, equipBoatSkin,
    claimDailyGiftLocal, spinDailyRouletteLocal, spinSkinRouletteLocal,
    moveAquariumFishToSector, consumeNet, buyNet, catchFishBatch,
    replaceFromServer,
  };
}
