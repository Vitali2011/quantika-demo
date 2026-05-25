/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { ModeProvider } from '../ModeProvider';
import { AppShell } from '../AppShell';

jest.mock('next/link', () => {
  const Link = ({ href, children, ...props }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    // eslint-disable-next-line @next/next/no-html-link-for-pages
    <a href={href} {...props}>{children}</a>
  );
  Link.displayName = 'Link';
  return Link;
});

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), forward: jest.fn(), refresh: jest.fn(), prefetch: jest.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock('lucide-react', () => ({
  Home: () => <svg data-testid="icon-home" />,
  Sparkles: () => <svg data-testid="icon-sparkles" />,
  Box: () => <svg data-testid="icon-box" />,
  MoreHorizontal: () => <svg data-testid="icon-more" />,
  LogOut: () => <svg data-testid="icon-logout" />,
  Sun: () => <svg data-testid="icon-sun" />,
  Moon: () => <svg data-testid="icon-moon" />,
}));

describe('AppShell', () => {
  beforeEach(() => {
    window.history.pushState({}, '', '/');
    global.fetch = jest.fn().mockResolvedValue({ ok: true }) as typeof global.fetch;
  });

  it('renders children', () => {
    render(
      <ModeProvider initial="charterer">
        <AppShell><div>page content</div></AppShell>
      </ModeProvider>,
    );
    expect(screen.getByText('page content')).toBeInTheDocument();
  });

  it('renders Matches nav link (in top nav)', () => {
    render(
      <ModeProvider initial="charterer">
        <AppShell><div>page content</div></AppShell>
      </ModeProvider>,
    );
    // TopNav desktop link (may appear multiple times across top + bottom nav)
    const matchLinks = screen.getAllByRole('link', { name: /matches/i });
    expect(matchLinks.length).toBeGreaterThanOrEqual(1);
  });

  it('renders ModeSwitcher with charterer active', () => {
    render(
      <ModeProvider initial="charterer">
        <AppShell><div>page content</div></AppShell>
      </ModeProvider>,
    );
    expect(screen.getByRole('button', { name: /charterer/i })).toHaveAttribute('aria-pressed', 'true');
  });

  it('renders both TopNav and BottomNav (Dashboard appears twice)', () => {
    render(
      <ModeProvider initial="charterer">
        <AppShell><div>page</div></AppShell>
      </ModeProvider>,
    );
    const dashLinks = screen.getAllByRole('link', { name: /dashboard/i });
    // One in TopNav + one in BottomNav
    expect(dashLinks.length).toBeGreaterThanOrEqual(2);
  });
});
