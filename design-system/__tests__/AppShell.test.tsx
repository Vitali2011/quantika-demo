/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { AppShell } from '../patterns/AppShell';

// Stub child components that depend on router / client-only hooks
jest.mock('../patterns/TopNav', () => ({ TopNav: () => <nav data-testid="top-nav" /> }));
jest.mock('../patterns/BottomNav', () => ({ BottomNav: () => <nav data-testid="bottom-nav" /> }));
jest.mock('../patterns/AIBar', () => ({ AIBar: () => <div data-testid="ai-bar" /> }));
jest.mock('../patterns/HelpFAB', () => ({ HelpFAB: () => <button data-testid="help-fab" /> }));
jest.mock('../patterns/CmdKPalette', () => ({ CmdKPalette: () => <div data-testid="cmd-k" /> }));
jest.mock('../patterns/usePalette', () => ({
  PaletteProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe('AppShell', () => {
  it('renders skip-to-content link targeting #main-content', () => {
    render(<AppShell><div>page content</div></AppShell>);
    const skipLink = screen.getByRole('link', { name: /skip to content/i });
    expect(skipLink).toHaveAttribute('href', '#main-content');
  });

  it('main element has id=main-content', () => {
    render(<AppShell><div>page content</div></AppShell>);
    expect(document.getElementById('main-content')).toBeInTheDocument();
  });
});
