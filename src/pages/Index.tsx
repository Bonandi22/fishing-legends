import { useState, useCallback } from 'react';
import MainMenu from '@/components/game/MainMenu';
import LocationSelect from '@/components/game/LocationSelect';
import FishingScreen from '@/components/game/FishingScreen';
import Collection from '@/components/game/Collection';
import Warehouse from '@/components/game/Warehouse';
import { useGameState } from '@/game/useGameState';
import { FishingLocation, Fish } from '@/game/types';

type Screen = 'menu' | 'locations' | 'fishing' | 'collection' | 'warehouse';

const Index = () => {
  const { player, catchFish, resetProgress, sellWarehouse } = useGameState();
  const [screen, setScreen] = useState<Screen>('menu');
  const [selectedLocation, setSelectedLocation] = useState<FishingLocation | null>(null);

  const handleSelectLocation = useCallback((loc: FishingLocation) => {
    setSelectedLocation(loc);
    setScreen('fishing');
  }, []);

  const handleCatch = useCallback((fish: Fish, weight: number, locationId: string) => {
    catchFish(fish, weight, locationId);
  }, [catchFish]);

  if (screen === 'locations') {
    return (
      <LocationSelect
        playerLevel={player.level}
        unlockedLocations={player.unlockedLocations}
        onSelect={handleSelectLocation}
        onBack={() => setScreen('menu')}
      />
    );
  }

  if (screen === 'fishing' && selectedLocation) {
    return (
      <FishingScreen
        location={selectedLocation}
        player={player}
        onCatch={handleCatch}
        onBack={() => setScreen('locations')}
      />
    );
  }

  if (screen === 'collection') {
    return <Collection player={player} onBack={() => setScreen('menu')} />;
  }

  if (screen === 'warehouse') {
    return <Warehouse player={player} onSell={sellWarehouse} onBack={() => setScreen('menu')} />;
  }

  return (
    <MainMenu
      player={player}
      onPlay={() => setScreen('locations')}
      onCollection={() => setScreen('collection')}
      onWarehouse={() => setScreen('warehouse')}
      onReset={resetProgress}
    />
  );
};

export default Index;
