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
import { hydrateFromServer } from '@/game/auth/hydrate';
import { maybeOfferImport, runImport } from '@/game/auth/importFlow';
import ImportSaveDialog from '@/components/game/menu/ImportSaveDialog';
import type { MigrationPreview } from '@/api/types';
import { FishingLocation, Fish } from '@/game/types';

type Screen = 'menu' | 'locations' | 'fishing' | 'collection' | 'warehouse' | 'submarine' | 'multiplier' | 'skins' | 'boatSkins' | 'roulette' | 'skinRoulette' | 'ranking' | 'aquarium' | 'dailyGifts' | 'net' | 'netShop';

const IndexInner = () => {
  const {
    player, catchFish, catchFishBatch, resetProgress, sellWarehouse,
    buyMultiplier, buySkin, equipSkin,
    buyBoatSkin, equipBoatSkin,
    addCoins, addSkin, addBoatSkin, spendCoins, addMultiplier, setLastRouletteDate,
    moveAquariumFishToSector, claimDailyGift, consumeNet, buyNet,
    replaceFromServer,
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

  let content: JSX.Element;
  if (screen === 'locations') {
    content = <LocationSelect playerLevel={player.level} unlockedLocations={player.unlockedLocations} world={world} onSelect={handleSelectLocation} onBack={() => setScreen('menu')} />;
  } else if (screen === 'fishing' && selectedLocation) {
    content = <FishingScreen location={selectedLocation} player={player} onCatch={handleCatch} onBack={() => setScreen('locations')} onCastNet={() => { if ((player.nets ?? 0) > 0) { consumeNet(); setScreen('net'); } }} onOpenNetShop={() => setScreen('netShop')} />;
  } else if (screen === 'net' && selectedLocation) {
    content = <NetFishing location={selectedLocation} player={player} onCatch={handleCatch} onCatchBatch={handleNetCatch} onUseNet={consumeNet} onOpenShop={() => setScreen('netShop')} onBack={() => setScreen('locations')} />;
  } else if (screen === 'netShop') {
    content = <NetShop player={player} onBuy={buyNet} onBack={() => setScreen(selectedLocation ? 'fishing' : 'menu')} />;
  } else if (screen === 'collection') {
    content = <Collection player={player} onBack={() => setScreen('menu')} />;
  } else if (screen === 'warehouse') {
    content = <Warehouse player={player} onSell={sellWarehouse} onBack={() => setScreen('menu')} />;
  } else if (screen === 'submarine') {
    content = <SubmarineFishing player={player} onCatch={handleCatch} onBack={() => setScreen('menu')} />;
  } else if (screen === 'multiplier') {
    content = <MultiplierShop player={player} onBuy={buyMultiplier} onBack={() => setScreen('menu')} />;
  } else if (screen === 'skins') {
    content = <SkinsShop player={player} onBuy={buySkin} onEquip={equipSkin} onBack={() => setScreen('menu')} onOpenBoatVisuals={() => setScreen('boatSkins')} />;
  } else if (screen === 'boatSkins') {
    content = <BoatSkinsShop player={player} onBuy={buyBoatSkin} onEquip={equipBoatSkin} onBack={() => setScreen('skins')} />;
  } else if (screen === 'roulette') {
    content = <Roulette player={player} onAddCoins={addCoins} onAddSkin={addSkin} onAddBoatSkin={addBoatSkin} onAddMultiplier={addMultiplier} onSetLastRouletteDate={setLastRouletteDate} onBack={() => setScreen('menu')} />;
  } else if (screen === 'skinRoulette') {
    content = <SkinRoulette player={player} onAddSkin={addSkin} onAddBoatSkin={addBoatSkin} onSpend={spendCoins} onBack={() => setScreen('menu')} />;
  } else if (screen === 'ranking') {
    content = <Ranking player={player} onBack={() => setScreen('menu')} />;
  } else if (screen === 'aquarium') {
    content = <Aquarium player={player} onMoveToSector={moveAquariumFishToSector} onBack={() => setScreen('menu')} />;
  } else if (screen === 'dailyGifts') {
    content = <DailyGifts player={player} onClaim={claimDailyGift} onBack={() => setScreen('menu')} />;
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

  const [importPreview, setImportPreview] = useState<(MigrationPreview & { raw: unknown }) | null>(null);

  const afterAuth = async () => {
    await hydrateFromServer(replaceFromServer).catch(() => {});
    await maybeOfferImport({ onPreview: setImportPreview });
  };

  const confirmImport = async () => {
    if (!importPreview) return;
    await runImport(importPreview.raw).catch(() => {});
    setImportPreview(null);
    await hydrateFromServer(replaceFromServer).catch(() => {});
  };

  return (
    <AuthProvider onAuthenticated={afterAuth}>
      {content}
      <ImportSaveDialog
        preview={importPreview}
        localLevel={player.level}
        localCoins={player.coins}
        onImport={confirmImport}
        onDismiss={() => setImportPreview(null)}
      />
    </AuthProvider>
  );
};

const Index = () => (
  <I18nProvider>
    <IndexInner />
  </I18nProvider>
);

export default Index;
