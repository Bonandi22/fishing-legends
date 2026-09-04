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
import { FishingLocation, Fish } from '@/game/types';

type Screen = 'menu' | 'locations' | 'fishing' | 'collection' | 'warehouse' | 'submarine' | 'multiplier' | 'skins' | 'boatSkins' | 'roulette' | 'skinRoulette' | 'ranking' | 'aquarium' | 'dailyGifts' | 'net' | 'netShop';

const IndexInner = () => {
  const {
    player, catchFish, catchFishBatch, resetProgress, sellWarehouse,
    buyMultiplier, buySkin, equipSkin,
    buyBoatSkin, equipBoatSkin,
    addCoins, addSkin, addBoatSkin, spendCoins, addMultiplier, setLastRouletteDate,
    moveAquariumFishToSector, claimDailyGift, consumeNet, buyNet,
  } = useGameState();
  const { isPlaying: musicPlaying, toggle: toggleMusic, trackId: musicTrack, setTrack: setMusicTrack } = useBackgroundMusic();
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

  const handleCatch = useCallback((fish: Fish, weight: number, locationId: string) => {
    catchFish(fish, weight, locationId, screen === 'net');
  }, [catchFish, screen]);

  const handleNetCatch = useCallback((catches: Array<{ fish: Fish; weight: number }>, locationId: string) => {
    catchFishBatch(catches.map(caught => ({ ...caught, location: locationId })), true);
  }, [catchFishBatch]);

  if (screen === 'locations') {
    return <LocationSelect playerLevel={player.level} unlockedLocations={player.unlockedLocations} world={world} onSelect={handleSelectLocation} onBack={() => setScreen('menu')} />;
  }
  if (screen === 'fishing' && selectedLocation) {
    return <FishingScreen location={selectedLocation} player={player} onCatch={handleCatch} onBack={() => setScreen('locations')} onCastNet={() => { if ((player.nets ?? 0) > 0) { consumeNet(); setScreen('net'); } }} onOpenNetShop={() => setScreen('netShop')} />;
  }
  if (screen === 'net' && selectedLocation) {
    return <NetFishing location={selectedLocation} player={player} onCatch={handleCatch} onCatchBatch={handleNetCatch} onUseNet={consumeNet} onOpenShop={() => setScreen('netShop')} onBack={() => setScreen('locations')} />;
  }
  if (screen === 'netShop') {
    return <NetShop player={player} onBuy={buyNet} onBack={() => setScreen(selectedLocation ? 'fishing' : 'menu')} />;
  }
  if (screen === 'collection') {
    return <Collection player={player} onBack={() => setScreen('menu')} />;
  }
  if (screen === 'warehouse') {
    return <Warehouse player={player} onSell={sellWarehouse} onBack={() => setScreen('menu')} />;
  }
  if (screen === 'submarine') {
    return <SubmarineFishing player={player} onCatch={handleCatch} onBack={() => setScreen('menu')} />;
  }
  if (screen === 'multiplier') {
    return <MultiplierShop player={player} onBuy={buyMultiplier} onBack={() => setScreen('menu')} />;
  }
  if (screen === 'skins') {
    return <SkinsShop player={player} onBuy={buySkin} onEquip={equipSkin} onBack={() => setScreen('menu')} onOpenBoatVisuals={() => setScreen('boatSkins')} />;
  }
  if (screen === 'boatSkins') {
    return <BoatSkinsShop player={player} onBuy={buyBoatSkin} onEquip={equipBoatSkin} onBack={() => setScreen('skins')} />;
  }
  if (screen === 'roulette') {
    return <Roulette player={player} onAddCoins={addCoins} onAddSkin={addSkin} onAddBoatSkin={addBoatSkin} onAddMultiplier={addMultiplier} onSetLastRouletteDate={setLastRouletteDate} onBack={() => setScreen('menu')} />;
  }
  if (screen === 'skinRoulette') {
    return <SkinRoulette player={player} onAddSkin={addSkin} onAddBoatSkin={addBoatSkin} onSpend={spendCoins} onBack={() => setScreen('menu')} />;
  }
  if (screen === 'ranking') {
    return <Ranking player={player} onBack={() => setScreen('menu')} />;
  }
  if (screen === 'aquarium') {
    return <Aquarium player={player} onMoveToSector={moveAquariumFishToSector} onBack={() => setScreen('menu')} />;
  }
  if (screen === 'dailyGifts') {
    return <DailyGifts player={player} onClaim={claimDailyGift} onBack={() => setScreen('menu')} />;
  }

  return (
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
      onSwitchWorld={() => setWorld(w => (w === 2 ? 1 : 2))}
      onSetWorld={setWorld}
    />
  );
};

const Index = () => (
  <I18nProvider>
    <IndexInner />
  </I18nProvider>
);

export default Index;
