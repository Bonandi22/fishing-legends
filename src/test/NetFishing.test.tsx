import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import NetFishing from '@/components/game/NetFishing';
import { I18nProvider } from '@/game/i18n';
import { LOCATIONS, FISH } from '@/game/data';
import { getXpForLevel, PlayerState, FishingLocation } from '@/game/types';
import type { NetHooked } from '@/game/fishing';

function makePlayer(over: Partial<PlayerState> = {}): PlayerState {
  return {
    level: 8, xp: 0, xpToNextLevel: getXpForLevel(8), totalFishCaught: 0,
    collection: [], unlockedLocations: ['titicaca'], heaviestFish: null, warehouse: [],
    coins: 0, activeSkin: 'default', ownedSkins: ['default'], activeBoatSkin: 'classic',
    ownedBoatSkins: ['classic'], luckMultiplierEnd: null, strengthMultiplierEnd: null,
    lastRouletteDate: null, aquariumWarehouse: [], aquariumSectors: { 1: [], 2: [], 3: [], 4: [], 5: [] },
    dailyGiftsLastClaim: null, dailyGiftsDay: 1, dailyGiftsWeek: 1, nets: 3,
    ...over,
  };
}

const lake = LOCATIONS.find(l => l.id === 'titicaca') as FishingLocation;

const netHooked = (over: Partial<NetHooked> = {}): NetHooked => ({
  kind: 'net',
  net: { rarity: 'common', fishCount: 3, greenZoneSize: 0.55, speed: 1 },
  catches: [{ fish: FISH[0], weight: 1 }, { fish: FISH[0], weight: 2 }, { fish: FISH[0], weight: 3 }],
  lucky: false,
  sessionId: 's1',
  ...over,
});

function renderNet(over: Partial<PlayerState> = {}, onCast = vi.fn().mockResolvedValue(netHooked()), onLand = vi.fn().mockResolvedValue({ outcome: 'landed' })) {
  const onBack = vi.fn();
  render(
    <I18nProvider>
      <NetFishing location={lake} player={makePlayer(over)} onCast={onCast} onLand={onLand} onBack={onBack} onOpenShop={vi.fn()} />
    </I18nProvider>,
  );
  return { onBack, onCast, onLand };
}

beforeEach(() => cleanup());

describe('NetFishing', () => {
  it('casts a net on mount and shows the pull control', async () => {
    const { onCast } = renderNet();
    expect(onCast).toHaveBeenCalledWith(lake.id, 'net');
    expect(await screen.findByRole('button', { name: /puxar/i })).toBeInTheDocument();
    expect(screen.getByText((txt) => /^Rede\s*[—–-]\s*\S/.test(txt))).toBeInTheDocument();
  });

  it('a green pull lands the haul via onLand', async () => {
    const onLand = vi.fn().mockResolvedValue({ outcome: 'landed' });
    // net with a full-width green zone so any pull position is a hit
    renderNet({}, vi.fn().mockResolvedValue(netHooked({ net: { rarity: 'common', fishCount: 3, greenZoneSize: 1, speed: 1 } })), onLand);
    fireEvent.click(await screen.findByRole('button', { name: /puxar/i }));
    await vi.waitFor(() => expect(onLand).toHaveBeenCalledTimes(1));
  });

  it('shows the no-nets state when the cast returns null', async () => {
    renderNet({}, vi.fn().mockResolvedValue(null));
    expect(await screen.findByText(/sem redes|no nets|sin redes/i)).toBeInTheDocument();
  });

  it('goes back', async () => {
    const { onBack } = renderNet();
    await screen.findByRole('button', { name: /puxar/i });
    fireEvent.click(screen.getByRole('button', { name: /voltar/i }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
