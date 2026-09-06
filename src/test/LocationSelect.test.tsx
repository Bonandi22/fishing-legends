import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import LocationSelect from '@/components/game/LocationSelect';
import { I18nProvider } from '@/game/i18n';
import { LOCATIONS } from '@/game/data';

const world1 = LOCATIONS.filter(l => (l.world ?? 1) === 1);
const world2 = LOCATIONS.filter(l => l.world === 2);

function renderScreen(props: Partial<Parameters<typeof LocationSelect>[0]> = {}) {
  const onSelect = vi.fn();
  const onBack = vi.fn();
  render(
    <I18nProvider>
      <LocationSelect
        playerLevel={1}
        unlockedLocations={['atlantic']}
        world={1}
        onSelect={onSelect}
        onBack={onBack}
        {...props}
      />
    </I18nProvider>,
  );
  return { onSelect, onBack };
}

beforeEach(() => cleanup());

describe('LocationSelect world filtering', () => {
  it('shows only the current world\'s waters', () => {
    renderScreen({ world: 2, playerLevel: 30, unlockedLocations: world2.map(l => l.id) });

    expect(screen.getByText('Fossa Abissal')).toBeInTheDocument();
    expect(screen.queryByText('Oceano Atlântico')).not.toBeInTheDocument();
  });

  it('reports how many waters are charted', () => {
    renderScreen({ unlockedLocations: ['atlantic', 'amazon', 'titicaca'] });
    expect(screen.getByText(`3/${world1.length}`)).toBeInTheDocument();
  });
});

describe('LocationSelect selection', () => {
  it('selects an unlocked water when its card is activated', () => {
    const { onSelect } = renderScreen();

    fireEvent.click(screen.getByRole('button', { name: /oceano atlântico/i }));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0][0]).toMatchObject({ id: 'atlantic' });
  });

  it('exposes unlocked waters as buttons and locked waters as plain regions', () => {
    renderScreen();
    expect(screen.getByRole('button', { name: /oceano atlântico/i })).toBeEnabled();
    expect(screen.queryByRole('button', { name: /mar do caribe/i })).not.toBeInTheDocument();
  });

  it('does not select a locked water', () => {
    const { onSelect } = renderScreen();

    // Caribbean requires level 3 and is not in unlockedLocations
    const caribbean = screen.getByText('Mar do Caribe').closest('[data-location]') as HTMLElement;
    fireEvent.click(caribbean);

    expect(onSelect).not.toHaveBeenCalled();
  });

  it('shows the required level on a locked water', () => {
    renderScreen();
    const caribbean = screen.getByText('Mar do Caribe').closest('[data-location]') as HTMLElement;
    expect(within(caribbean).getByText(/3/)).toBeInTheDocument();
  });
});

describe('LocationSelect navigation', () => {
  it('goes back from the header control', () => {
    const { onBack } = renderScreen();
    fireEvent.click(screen.getByRole('button', { name: /voltar/i }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
