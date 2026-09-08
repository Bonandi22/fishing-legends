import { useState, useCallback, useEffect } from 'react';
import { syncCurrentPlayer } from '@/game/leaderboard';
import MainMenu from '@/components/game/MainMenu';
import LocationSelect from '@/components/game/LocationSelect';
import FishingScreen from '@/components/game/FishingScreen';
import Collection from '@/components/game/Collection';
import Warehouse from '@/components/game/Warehouse';
import SubmarineFishing from '@/components/game/SubmarineFishing';
import NetFishing from '@/components/game/NetFishing';
import NetShop from '@/components/game/NetShop';
import MultiplierShop from '@/components/game/MultiplierShop';
import SkinsShop from '@/components/game/SkinsShop';
import BoatSkinsShop from '@/components/game/BoatSkinsShop';
import Roulette from '@/components/game/Roulette';
import SkinRoulette from '@/components/game/SkinRoulette';
import Ranking from '@/components/game/Ranking';
import Aquarium from '@/components/game/Aquarium';
import DailyGifts from '@/components/game/DailyGifts';
import { useGameState } from '@/game/useGameState';
import { useBackgroundMusic } from '@/game/useBackgroundMusic';
import { I18nProvider } from '@/game/i18n';
import { AuthProvider } from '@/game/auth/AuthProvider';
import { useGameStateSync } from '@/game/auth/gameStateSync';
import {
  sellWarehouse as sellWarehouseApi,
  purchaseNet as purchaseNetApi,
  purchaseMultiplier as purchaseMultiplierApi,
  purchaseSkin as purchaseSkinApi,
  spinRoulette as spinRouletteApi,
  spinSkinRoulette as spinSkinRouletteApi,
  claimDailyGift as claimDailyGiftApi,
  castLine as castLineApi,
  landCatch as landCatchApi,
  type RewardEnvelope,
} from '@/api/endpoints';
import type { GameStateEnvelope } from '@/api/types';
import type { RewardGrant } from '@/game/rewards';
import type { Hooked } from '@/game/fishing';
import { rollFish, rollWeight } from '@/game/fishingLogic';
import { rollNet } from '@/game/netTypes';
import { resolveLuckyMode } from '@/game/stateRules';
import { FISH, LOCATIONS, getFishForLocation } from '@/game/data';
import { FishingLocation, Fish } from '@/game/types';

type Screen = 'menu' | 'locations' | 'fishing' | 'collection' | 'warehouse' | 'submarine' | 'multiplier' | 'skins' | 'boatSkins' | 'roulette' | 'skinRoulette' | 'ranking' | 'aquarium' | 'dailyGifts' | 'net' | 'netShop';

const IndexInner = () => {
  const {
    player, catchFish, catchFishBatch, resetProgress, sellWarehouse,
    buyMultiplier, buySkin, equipSkin,
    buyBoatSkin, equipBoatSkin,
    claimDailyGiftLocal, spinDailyRouletteLocal, spinSkinRouletteLocal,
    moveAquariumFishToSector, buyNet,
    replaceFromServer,
  } = useGameState();
  const { isPlaying: musicPlaying, toggle: toggleMusic, trackId: musicTrack, setTrack: setMusicTrack } = useBackgroundMusic();
  const [syncEnabled, setSyncEnabled] = useState(false);
  const [busyOp, setBusyOp] = useState<null | 'sell' | 'net' | 'multiplier' | 'skin' | 'roulette' | 'skinRoulette' | 'dailyGift' | 'cast' | 'land'>(null);
  const { flushNow, start: startSync, applyServerResult } = useGameStateSync({ player, enabled: syncEnabled, replace: replaceFromServer });
  const [screen, setScreen] = useState<Screen>('menu');
  const [selectedLocation, setSelectedLocation] = useState<FishingLocation | null>(null);
  const [world, setWorld] = useState<1 | 2 | 3>(() => {
    const saved = localStorage.getItem('fishing-game-world');
    return saved === '3' ? 3 : saved === '2' ? 2 : 1;
  });

  useEffect(() => { localStorage.setItem('fishing-game-world', String(world)); }, [world]);

  // Auto revert if player drops below level 12
  useEffect(() => {
    if (player.level < 12 && world > 1) setWorld(1);
    else if (player.level < 20 && world === 3) setWorld(2);
  }, [player.level, world]);

  // Keep current player in the leaderboard in sync
  useEffect(() => { syncCurrentPlayer(player); }, [player]);

  const handleSelectLocation = useCallback((loc: FishingLocation) => {
    setSelectedLocation(loc);
    setScreen('fishing');
  }, []);

  // Submarine still catches locally (slice 6b-2 moves it server-side).
  const handleCatch = useCallback((fish: Fish, weight: number, locationId: string) => {
    catchFish(fish, weight, locationId, false);
  }, [catchFish]);

  // A value-granting economy op: anonymous / degraded → the local pure rule;
  // authenticated → flush any pending local mutation FIRST (else the server runs
  // the op on a stale blob and `applyServerResult` overwrites the un-pushed
  // change), then the server op, then adopt its authoritative result. Failure is
  // silent (no toast surface) and leaves local state untouched.
  const runEconomyOp = useCallback(async (
    op: 'sell' | 'net' | 'multiplier' | 'skin',
    local: () => void,
    api: (idempotencyKey: string) => Promise<GameStateEnvelope>,
  ) => {
    if (!syncEnabled) { local(); return; }
    setBusyOp(op);
    try {
      await flushNow();
      applyServerResult(await api(crypto.randomUUID()));
    } catch {
      console.warn(`economy op "${op}" failed; state unchanged`);
    } finally {
      setBusyOp(null);
    }
  }, [syncEnabled, flushNow, applyServerResult]);

  const handleSellWarehouse = useCallback(
    () => runEconomyOp('sell', sellWarehouse, sellWarehouseApi),
    [runEconomyOp, sellWarehouse],
  );
  const handleBuyNet = useCallback(
    () => runEconomyOp('net', buyNet, purchaseNetApi),
    [runEconomyOp, buyNet],
  );
  const handleBuyMultiplier = useCallback(
    (type: 'luck' | 'strength', power: number = 2) => {
      const p: 2 | 4 = power === 4 ? 4 : 2;
      return runEconomyOp('multiplier', () => buyMultiplier(type, p), key => purchaseMultiplierApi(key, type, p));
    },
    [runEconomyOp, buyMultiplier],
  );
  const handleBuySkin = useCallback(
    (skinId: string, price: number) =>
      runEconomyOp('skin', () => buySkin(skinId, price), key => purchaseSkinApi(key, 'rod', skinId)),
    [runEconomyOp, buySkin],
  );
  const handleBuyBoatSkin = useCallback(
    (skinId: string, price: number) =>
      runEconomyOp('skin', () => buyBoatSkin(skinId, price), key => purchaseSkinApi(key, 'boat', skinId)),
    [runEconomyOp, buyBoatSkin],
  );

  // Reward ops: anonymous / degraded → the local pure rule; authenticated → flush,
  // run the server op, adopt its state, and return its `reward` for the screen to
  // reveal. Failure is silent and leaves local state untouched (returns null).
  const runRewardOp = useCallback(async (
    op: 'roulette' | 'skinRoulette' | 'dailyGift',
    local: () => RewardGrant,
    api: (idempotencyKey: string) => Promise<RewardEnvelope>,
  ): Promise<RewardGrant | null> => {
    if (!syncEnabled) {
      try { return local(); } catch { return null; }
    }
    setBusyOp(op);
    try {
      await flushNow();
      const res = await api(crypto.randomUUID());
      applyServerResult(res);
      return res.reward;
    } catch {
      console.warn(`reward op "${op}" failed; state unchanged`);
      return null;
    } finally {
      setBusyOp(null);
    }
  }, [syncEnabled, flushNow, applyServerResult]);

  const handleSpinRoulette = useCallback(
    () => runRewardOp('roulette', spinDailyRouletteLocal, spinRouletteApi),
    [runRewardOp, spinDailyRouletteLocal],
  );
  const handleSpinSkinRoulette = useCallback(
    () => runRewardOp('skinRoulette', spinSkinRouletteLocal, spinSkinRouletteApi),
    [runRewardOp, spinSkinRouletteLocal],
  );
  const handleClaimDailyGift = useCallback(
    () => runRewardOp('dailyGift', claimDailyGiftLocal, claimDailyGiftApi),
    [runRewardOp, claimDailyGiftLocal],
  );

  // Fishing: the server rolls the fish/batch at cast time (authenticated) — the
  // client keeps only the minigame. Anonymous / degraded → roll locally. Net spends
  // a net on the cast (server, or the local roll).
  const handleCast = useCallback(async (locationId: string, mode: 'rod' | 'net' | 'submarine' = 'rod'): Promise<Hooked | null> => {
    if (syncEnabled) {
      setBusyOp('cast');
      try {
        await flushNow();
        const r = await castLineApi(crypto.randomUUID(), locationId, mode);
        applyServerResult(r);
        if (r.mode === 'net') {
          const catches = r.catches
            .map(c => ({ fish: FISH.find(f => f.id === c.fishId), weight: c.weight }))
            .filter((c): c is { fish: Fish; weight: number } => !!c.fish);
          return { kind: 'net', net: { rarity: r.net.rarity as Fish['rarity'], fishCount: r.net.fishCount, greenZoneSize: r.net.greenZoneSize, speed: r.net.speed }, catches, lucky: r.lucky, sessionId: r.sessionId };
        }
        const fish = FISH.find(f => f.id === r.fishId);
        if (!fish) return null;
        return { kind: 'rod', fish, weight: r.weight, lucky: r.lucky, sessionId: r.sessionId };
      } catch {
        console.warn('cast failed; no fish hooked');
        return null;
      } finally {
        setBusyOp(null);
      }
    }
    try {
      const location = LOCATIONS.find(l => l.id === locationId);
      if (!location) return null;
      const now = Date.now();
      const luck = resolveLuckyMode(player, now);
      const luckActive = !!player.luckMultiplierEnd && player.luckMultiplierEnd > now;
      const luckPower = luckActive ? (player.luckMultiplierPower ?? 2) : 2;
      if (mode === 'net') {
        if ((player.nets ?? 0) < 1) return null;
        const net = rollNet();
        const pool = getFishForLocation(location);
        const tier = pool.filter(f => f.rarity === net.rarity);
        const draw = tier.length > 0 ? tier : pool;
        const catches = Array.from({ length: net.fishCount }, () => {
          const f = draw[Math.floor(Math.random() * draw.length)];
          return { fish: f, weight: rollWeight(f) };
        });
        replaceFromServer(() => ({ nets: (player.nets ?? 0) - 1, luckyUntil: luck.luckyUntil, luckyCooldownUntil: luck.luckyCooldownUntil }));
        return { kind: 'net', net: { rarity: net.rarity, fishCount: net.fishCount, greenZoneSize: net.greenZoneSize, speed: net.speed }, catches, lucky: luck.lucky, sessionId: '' };
      }
      replaceFromServer(() => ({ luckyUntil: luck.luckyUntil, luckyCooldownUntil: luck.luckyCooldownUntil }));
      const fish = rollFish(location, player.level, luck.lucky || luckActive, luckPower);
      return { kind: 'rod', fish, weight: rollWeight(fish), lucky: luck.lucky, sessionId: '' };
    } catch {
      return null;
    }
  }, [syncEnabled, flushNow, applyServerResult, player, replaceFromServer]);

  const handleLand = useCallback(async (hooked: Hooked, locationId: string): Promise<'landed' | 'failed'> => {
    if (syncEnabled) {
      setBusyOp('land');
      try {
        applyServerResult(await landCatchApi(crypto.randomUUID(), hooked.sessionId));
        return 'landed';
      } catch {
        console.warn('land failed; the catch was lost');
        return 'failed';
      } finally {
        setBusyOp(null);
      }
    }
    if (hooked.kind === 'net') {
      catchFishBatch(hooked.catches.map(c => ({ fish: c.fish, weight: c.weight, location: locationId })), true);
    } else if (hooked.kind === 'rod') {
      catchFishBatch([{ fish: hooked.fish, weight: hooked.weight, location: locationId }], false);
    } else {
      return 'failed'; // submarine anon land is wired in slice 6b-2 Task 7
    }
    return 'landed';
  }, [syncEnabled, applyServerResult, catchFishBatch]);

  let content: JSX.Element;
  if (screen === 'locations') {
    content = <LocationSelect playerLevel={player.level} unlockedLocations={player.unlockedLocations} world={world} onSelect={handleSelectLocation} onBack={() => setScreen('menu')} />;
  } else if (screen === 'fishing' && selectedLocation) {
    content = <FishingScreen location={selectedLocation} player={player} onCast={handleCast} onLand={handleLand} onBack={() => setScreen('locations')} onCastNet={() => { if ((player.nets ?? 0) > 0) setScreen('net'); }} onOpenNetShop={() => setScreen('netShop')} />;
  } else if (screen === 'net' && selectedLocation) {
    content = <NetFishing location={selectedLocation} player={player} onCast={handleCast} onLand={handleLand} onOpenShop={() => setScreen('netShop')} onBack={() => setScreen('locations')} />;
  } else if (screen === 'netShop') {
    content = <NetShop player={player} onBuy={handleBuyNet} buying={busyOp === 'net'} onBack={() => setScreen(selectedLocation ? 'fishing' : 'menu')} />;
  } else if (screen === 'collection') {
    content = <Collection player={player} onBack={() => setScreen('menu')} />;
  } else if (screen === 'warehouse') {
    content = <Warehouse player={player} onSell={handleSellWarehouse} selling={busyOp === 'sell'} onBack={() => setScreen('menu')} />;
  } else if (screen === 'submarine') {
    content = <SubmarineFishing player={player} onCatch={handleCatch} onBack={() => setScreen('menu')} />;
  } else if (screen === 'multiplier') {
    content = <MultiplierShop player={player} onBuy={handleBuyMultiplier} buying={busyOp === 'multiplier'} onBack={() => setScreen('menu')} />;
  } else if (screen === 'skins') {
    content = <SkinsShop player={player} onBuy={handleBuySkin} buying={busyOp === 'skin'} onEquip={equipSkin} onBack={() => setScreen('menu')} onOpenBoatVisuals={() => setScreen('boatSkins')} />;
  } else if (screen === 'boatSkins') {
    content = <BoatSkinsShop player={player} onBuy={handleBuyBoatSkin} buying={busyOp === 'skin'} onEquip={equipBoatSkin} onBack={() => setScreen('skins')} />;
  } else if (screen === 'roulette') {
    content = <Roulette player={player} onSpin={handleSpinRoulette} busy={busyOp === 'roulette'} onBack={() => setScreen('menu')} />;
  } else if (screen === 'skinRoulette') {
    content = <SkinRoulette player={player} onSpin={handleSpinSkinRoulette} busy={busyOp === 'skinRoulette'} onBack={() => setScreen('menu')} />;
  } else if (screen === 'ranking') {
    content = <Ranking player={player} onBack={() => setScreen('menu')} />;
  } else if (screen === 'aquarium') {
    content = <Aquarium player={player} onMoveToSector={moveAquariumFishToSector} onBack={() => setScreen('menu')} />;
  } else if (screen === 'dailyGifts') {
    content = <DailyGifts player={player} onClaim={handleClaimDailyGift} onBack={() => setScreen('menu')} />;
  } else {
    content = (
      <MainMenu
        player={player}
        onPlay={() => setScreen('locations')}
        onCollection={() => setScreen('collection')}
        onWarehouse={() => setScreen('warehouse')}
        onSubmarine={() => setScreen('submarine')}
        onMultiplier={() => setScreen('multiplier')}
        onSkins={() => setScreen('skins')}
        onRoulette={() => setScreen('roulette')}
        onSkinRoulette={() => setScreen('skinRoulette')}
        onRanking={() => setScreen('ranking')}
        onAquarium={() => setScreen('aquarium')}
        onDailyGifts={() => setScreen('dailyGifts')}
        onReset={resetProgress}
        musicPlaying={musicPlaying}
        onToggleMusic={toggleMusic}
        musicTrack={musicTrack}
        onSetMusicTrack={setMusicTrack}
        world={world}
        onSetWorld={setWorld}
      />
    );
  }

  const afterAuth = async () => {
    // The server blob is authoritative: load it and replace local state, seeding the
    // sync hook's version. On a first login with no server state, `start` adopts the
    // local save. Only a hard GET failure leaves the client read-only (sync disabled).
    const kind = await startSync();
    setSyncEnabled(kind !== 'error');
  };

  const handleLoggedOut = () => {
    setSyncEnabled(false);
    resetProgress();
  };

  return (
    <AuthProvider onAuthenticated={afterAuth} onBeforeLogout={flushNow} onLoggedOut={handleLoggedOut}>
      {content}
    </AuthProvider>
  );
};

const Index = () => (
  <I18nProvider>
    <IndexInner />
  </I18nProvider>
);

export default Index;
