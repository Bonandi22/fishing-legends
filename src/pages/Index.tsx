import { useState, useCallback, useEffect } from 'react';
import { syncCurrentPlayer } from '@/game/leaderboard';
import MainMenu from '@/components/game/MainMenu';
import LocationSelect from '@/components/game/LocationSelect';
import FishingScreen from '@/components/game/FishingScreen';
import Collection from '@/components/game/Collection';
import Warehouse from '@/components/game/Warehouse';
import SubmarineFishing from '@/components/game/SubmarineFishing';
import MultiplierShop from '@/components/game/MultiplierShop';
import SkinsShop from '@/components/game/SkinsShop';
import BoatSkinsShop from '@/components/game/BoatSkinsShop';
import Roulette from '@/components/game/Roulette';
import Ranking from '@/components/game/Ranking';
import { useGameState } from '@/game/useGameState';
import { useBackgroundMusic } from '@/game/useBackgroundMusic';
import { I18nProvider } from '@/game/i18n';
import { FishingLocation, Fish } from '@/game/types';

type Screen = 'menu' | 'locations' | 'fishing' | 'collection' | 'warehouse' | 'submarine' | 'multiplier' | 'skins' | 'boatSkins' | 'roulette' | 'ranking';

const IndexInner = () => {
  const {
    player, catchFish, resetProgress, sellWarehouse,
    buyMultiplier, buySkin, equipSkin,
    buyBoatSkin, equipBoatSkin,
    addCoins, addSkin, addMultiplier, setLastRouletteDate,
  } = useGameState();
  const { isPlaying: musicPlaying, toggle: toggleMusic } = useBackgroundMusic();
  const [screen, setScreen] = useState<Screen>('menu');
  const [selectedLocation, setSelectedLocation] = useState<FishingLocation | null>(null);

  // Keep current player in the leaderboard in sync
  useEffect(() => { syncCurrentPlayer(player); }, [player]);

  const handleSelectLocation = useCallback((loc: FishingLocation) => {
    setSelectedLocation(loc);
    setScreen('fishing');
  }, []);

  const handleCatch = useCallback((fish: Fish, weight: number, locationId: string) => {
    catchFish(fish, weight, locationId);
  }, [catchFish]);

  if (screen === 'locations') {
    return <LocationSelect playerLevel={player.level} unlockedLocations={player.unlockedLocations} onSelect={handleSelectLocation} onBack={() => setScreen('menu')} />;
  }
  if (screen === 'fishing' && selectedLocation) {
    return <FishingScreen location={selectedLocation} player={player} onCatch={handleCatch} onBack={() => setScreen('locations')} />;
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
    return <Roulette player={player} onAddCoins={addCoins} onAddSkin={addSkin} onAddMultiplier={addMultiplier} onSetLastRouletteDate={setLastRouletteDate} onBack={() => setScreen('menu')} />;
  }
  if (screen === 'ranking') {
    return <Ranking player={player} onBack={() => setScreen('menu')} />;
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
      onRanking={() => setScreen('ranking')}
      onReset={resetProgress}
      musicPlaying={musicPlaying}
      onToggleMusic={toggleMusic}
    />
  );
};

const Index = () => (
  <I18nProvider>
    <IndexInner />
  </I18nProvider>
);

export default Index;
