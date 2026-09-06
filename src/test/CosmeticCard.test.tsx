import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import CosmeticCard from '@/components/game/shops/CosmeticCard';
import { I18nProvider } from '@/game/i18n';

function renderCard(props: Partial<Parameters<typeof CosmeticCard>[0]> = {}) {
  const onBuy = vi.fn();
  const onEquip = vi.fn();
  render(
    <I18nProvider>
      <CosmeticCard
        name="Tubarão"
        price={999}
        owned={false}
        equipped={false}
        canAfford
        preview={<div data-testid="preview" />}
        onBuy={onBuy}
        onEquip={onEquip}
        {...props}
      />
    </I18nProvider>,
  );
  return { onBuy, onEquip };
}

beforeEach(() => cleanup());

describe('CosmeticCard', () => {
  it('shows the price and buys an unowned item', () => {
    const { onBuy } = renderCard();
    expect(screen.getByText(/999/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /comprar/i }));
    expect(onBuy).toHaveBeenCalledTimes(1);
  });

  it('disables the buy control when the player cannot afford it', () => {
    const { onBuy } = renderCard({ canAfford: false });
    fireEvent.click(screen.getByRole('button', { name: /moedas insuficientes/i }));
    expect(onBuy).not.toHaveBeenCalled();
  });

  it('equips an owned but unequipped item', () => {
    const { onEquip } = renderCard({ owned: true });
    fireEvent.click(screen.getByRole('button', { name: /equipar/i }));
    expect(onEquip).toHaveBeenCalledTimes(1);
  });

  it('shows an equipped item as equipped with no action button', () => {
    renderCard({ owned: true, equipped: true });
    expect(screen.getByText(/equipado/i)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders the preview slot', () => {
    renderCard();
    expect(screen.getByTestId('preview')).toBeInTheDocument();
  });
});
