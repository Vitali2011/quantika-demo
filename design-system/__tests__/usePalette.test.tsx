/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { render, screen, act } from '@testing-library/react';
import { usePalette, PaletteProvider } from '../patterns/usePalette';

function Probe() {
  const { open, isOpen, close } = usePalette();
  return (
    <>
      <span data-testid="state">{isOpen ? 'open' : 'closed'}</span>
      <button onClick={() => open()}>open</button>
      <button onClick={close}>close</button>
    </>
  );
}

describe('usePalette', () => {
  it('opens and closes', () => {
    render(<PaletteProvider><Probe /></PaletteProvider>);
    expect(screen.getByTestId('state')).toHaveTextContent('closed');
    act(() => { screen.getByText('open').click(); });
    expect(screen.getByTestId('state')).toHaveTextContent('open');
    act(() => { screen.getByText('close').click(); });
    expect(screen.getByTestId('state')).toHaveTextContent('closed');
  });

  it('⌘K opens palette globally', () => {
    render(<PaletteProvider><Probe /></PaletteProvider>);
    act(() => {
      const event = new KeyboardEvent('keydown', { key: 'k', metaKey: true });
      window.dispatchEvent(event);
    });
    expect(screen.getByTestId('state')).toHaveTextContent('open');
  });

  it('Ctrl+K opens palette globally', () => {
    render(<PaletteProvider><Probe /></PaletteProvider>);
    act(() => {
      const event = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true });
      window.dispatchEvent(event);
    });
    expect(screen.getByTestId('state')).toHaveTextContent('open');
  });

  it('open with specific tab changes activeTab', () => {
    function TabProbe() {
      const { open, isOpen, activeTab } = usePalette();
      return (
        <>
          <span data-testid="tab">{activeTab}</span>
          <span data-testid="state">{isOpen ? 'open' : 'closed'}</span>
          <button onClick={() => open('help')}>open-help</button>
        </>
      );
    }
    render(<PaletteProvider><TabProbe /></PaletteProvider>);
    act(() => { screen.getByText('open-help').click(); });
    expect(screen.getByTestId('tab')).toHaveTextContent('help');
    expect(screen.getByTestId('state')).toHaveTextContent('open');
  });
});
