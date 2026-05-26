/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { ModeProvider } from '../ModeProvider';
import { BottomNav } from '../BottomNav';

jest.mock('next/link', () => {
  const Link = ({ href, children, ...props }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    // eslint-disable-next-line @next/next/no-html-link-for-pages
    <a href={href} {...props}>{children}</a>
  );
  Link.displayName = 'Link';
  return Link;
});

// lucide-react icon mocks to avoid svg rendering issues
jest.mock('lucide-react', () => ({
  Layers: () => <svg data-testid="icon-layers" />,
  Box: () => <svg data-testid="icon-box" />,
  Sparkles: () => <svg data-testid="icon-sparkles" />,
  MoreHorizontal: () => <svg data-testid="icon-more" />,
}));

describe('BottomNav', () => {
  beforeEach(() => {
    window.history.pushState({}, '', '/');
    global.fetch = jest.fn().mockResolvedValue({ ok: true }) as typeof global.fetch;
  });

  it('renders nav with Matches, mode-primary, AI, More', () => {
    render(<ModeProvider initial="charterer"><BottomNav /></ModeProvider>);
    expect(screen.getByRole('link', { name: /matches/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /cargo/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ai command palette/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^more$/i })).toBeInTheDocument();
  });

  it('charterer mode shows Cargo link', () => {
    render(<ModeProvider initial="charterer"><BottomNav /></ModeProvider>);
    expect(screen.getByRole('link', { name: /cargo/i })).toHaveAttribute('href', '/cargo');
  });

  it('owner mode shows Vessels link instead of Cargo', () => {
    render(<ModeProvider initial="owner"><BottomNav /></ModeProvider>);
    expect(screen.getByRole('link', { name: /vessels/i })).toHaveAttribute('href', '/vessels');
    expect(screen.queryByRole('link', { name: /cargo/i })).not.toBeInTheDocument();
  });

  it('AI button dispatches open-command-palette event', () => {
    const listener = jest.fn();
    window.addEventListener('open-command-palette', listener);
    render(<ModeProvider initial="charterer"><BottomNav /></ModeProvider>);
    screen.getByRole('button', { name: /ai command palette/i }).click();
    expect(listener).toHaveBeenCalled();
    window.removeEventListener('open-command-palette', listener);
  });

  // #508 / #456 — spec requires exactly 4 navigation tabs: Matches, Cargo+Vessels, AI, More
  it('#508/#456: nav has 4 tabs (Matches, Cargo/Vessels, AI, More) with AI label and sparkle icon', () => {
    render(<ModeProvider initial="charterer"><BottomNav /></ModeProvider>);
    // All 4 required tab labels must be present
    expect(screen.getByText('Matches')).toBeInTheDocument();
    expect(screen.getByText('Cargo')).toBeInTheDocument();
    expect(screen.getByText('AI')).toBeInTheDocument();
    expect(screen.getByText('More')).toBeInTheDocument();
    // AI rendered as a button (not a link) — opens command palette
    expect(screen.getByRole('button', { name: /ai command palette/i })).toBeInTheDocument();
    // AI uses sparkle icon
    expect(screen.getByTestId('icon-sparkles')).toBeInTheDocument();
    // Matches uses layers icon (not sparkle)
    expect(screen.getByTestId('icon-layers')).toBeInTheDocument();
  });

  // #508 — LogOut must not appear in mobile nav; it lives on the More page
  it('#508: Log out button is not rendered in mobile BottomNav', () => {
    render(<ModeProvider initial="charterer"><BottomNav /></ModeProvider>);
    expect(screen.queryByLabelText(/log out/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/log out/i)).not.toBeInTheDocument();
  });
});
