import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import GameScreen from '@/components/game/shell/GameScreen';
import { I18nProvider } from '@/game/i18n';

function renderScreen(props: Partial<Parameters<typeof GameScreen>[0]> = {}) {
  const onBack = vi.fn();
  render(
    <I18nProvider>
      <GameScreen title="Coleção" onBack={onBack} {...props}>
        <p>conteúdo da tela</p>
      </GameScreen>
    </I18nProvider>,
  );
  return { onBack };
}

beforeEach(() => cleanup());

describe('GameScreen', () => {
  it('shows the title as the screen heading', () => {
    renderScreen();
    expect(screen.getByRole('heading', { name: 'Coleção' })).toBeInTheDocument();
  });

  it('renders its children', () => {
    renderScreen();
    expect(screen.getByText('conteúdo da tela')).toBeInTheDocument();
  });

  it('calls onBack from the back control', () => {
    const { onBack } = renderScreen();
    fireEvent.click(screen.getByRole('button', { name: /voltar/i }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('renders the subtitle when given', () => {
    renderScreen({ subtitle: '7/12 espécies' });
    expect(screen.getByText('7/12 espécies')).toBeInTheDocument();
  });

  it('shows a coin readout when coins are given', () => {
    renderScreen({ coins: 840 });
    expect(screen.getByText('840')).toBeInTheDocument();
  });

  it('omits the coin readout when coins are not given', () => {
    renderScreen();
    expect(screen.queryByText('💰')).not.toBeInTheDocument();
  });

  it('renders the action slot content', () => {
    renderScreen({ action: <button type="button">Vender tudo</button> });
    expect(screen.getByRole('button', { name: 'Vender tudo' })).toBeInTheDocument();
  });
});
