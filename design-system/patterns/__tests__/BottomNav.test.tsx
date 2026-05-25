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
  Sparkles: () => <svg data-testid="icon-sparkles" />,
  Box: () => <svg data-testid="icon-box" />,
  Zap: () => <svg data-testid="icon-zap" />,
  MoreHorizontal: () => <svg data-testid="icon-more" />,
  LogOut: () => <svg data-testid="icon-logout" />,
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
});
