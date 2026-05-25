/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { render, screen, act } from '@testing-library/react';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), prefetch: jest.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));
import { ModeProvider } from '../patterns/ModeProvider';
import { PaletteProvider, usePalette } from '../patterns/usePalette';
import { CmdKPalette } from '../patterns/CmdKPalette';

function Trigger() {
  const { open } = usePalette();
  return <button onClick={() => open()}>open-palette</button>;
}

describe('CmdKPalette', () => {
  it('opens with search input and tabs', () => {
    render(
      <ModeProvider initial="charterer">
        <PaletteProvider>
          <Trigger />
          <CmdKPalette />
        </PaletteProvider>
      </ModeProvider>,
    );
    act(() => { screen.getByText('open-palette').click(); });
    expect(screen.getByPlaceholderText(/search or ask/i)).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /actions/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /navigate/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /help/i })).toBeInTheDocument();
  });

  it('shows actions by default', () => {
    render(
      <ModeProvider initial="charterer">
        <PaletteProvider>
          <Trigger />
          <CmdKPalette />
        </PaletteProvider>
      </ModeProvider>,
    );
    act(() => { screen.getByText('open-palette').click(); });
    expect(screen.getByText(/find vessel/i)).toBeInTheDocument();
  });
});
