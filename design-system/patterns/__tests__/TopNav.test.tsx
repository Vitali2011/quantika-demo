/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { ModeProvider } from '../ModeProvider';
import { TopNav } from '../TopNav';

// next/link renders as <a> in tests
jest.mock('next/link', () => {
  const Link = ({ href, children, ...props }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    // eslint-disable-next-line @next/next/no-html-link-for-pages
    <a href={href} {...props}>{children}</a>
  );
  Link.displayName = 'Link';
  return Link;
});

const mockUsePathname = jest.fn();
jest.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), prefetch: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

describe('TopNav', () => {
  beforeEach(() => {
    mockUsePathname.mockReturnValue('/dashboard');
    window.history.pushState({}, '', '/');
    global.fetch = jest.fn().mockResolvedValue({ ok: true }) as typeof global.fetch;
  });

  it('renders 5 primary nav links + More button in charterer mode', () => {
    render(<ModeProvider initial="charterer"><TopNav /></ModeProvider>);
    expect(screen.getByRole('link', { name: /dashboard/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /matches/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /cargo/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /vessels/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /market/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /more/i })).toBeInTheDocument();
  });

  it('charterer mode: Cargo is 3rd nav link, Vessels is 4th', () => {
    const { container } = render(<ModeProvider initial="charterer"><TopNav /></ModeProvider>);
    // Only direct <a> children of nav — excludes More dropdown links inside <details>
    const navLinks = Array.from(container.querySelectorAll('nav[aria-label="Primary navigation"] > a'));
    const texts = navLinks.map(l => l.textContent);
    expect(texts).toEqual(['Dashboard', 'Matches', 'Cargo', 'Vessels', 'Market']);
  });

  it('owner mode: Vessels is 3rd nav link, Cargo is 4th', () => {
    const { container } = render(<ModeProvider initial="owner"><TopNav /></ModeProvider>);
    const navLinks = Array.from(container.querySelectorAll('nav[aria-label="Primary navigation"] > a'));
    const texts = navLinks.map(l => l.textContent);
    expect(texts).toEqual(['Dashboard', 'Matches', 'Vessels', 'Cargo', 'Market']);
  });

  it('renders ModeSwitcher with charterer + owner buttons', () => {
    render(<ModeProvider initial="charterer"><TopNav /></ModeProvider>);
    expect(screen.getByRole('button', { name: /charterer/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /owner/i })).toHaveAttribute('aria-pressed', 'false');
  });

  describe('active-state — issue #555', () => {
    const activeLinks = (container: HTMLElement) =>
      Array.from(container.querySelectorAll('nav[aria-label="Primary navigation"] > a[aria-current="page"]'));

    it('no nav item is active on /settings', () => {
      mockUsePathname.mockReturnValue('/settings');
      const { container } = render(<ModeProvider initial="charterer"><TopNav /></ModeProvider>);
      expect(activeLinks(container)).toHaveLength(0);
    });

    it('no nav item is active on /email', () => {
      mockUsePathname.mockReturnValue('/email');
      const { container } = render(<ModeProvider initial="charterer"><TopNav /></ModeProvider>);
      expect(activeLinks(container)).toHaveLength(0);
    });

    it('no nav item is active on /processing', () => {
      mockUsePathname.mockReturnValue('/processing');
      const { container } = render(<ModeProvider initial="charterer"><TopNav /></ModeProvider>);
      expect(activeLinks(container)).toHaveLength(0);
    });

    it('Matches is active on /matches', () => {
      mockUsePathname.mockReturnValue('/matches');
      const { container } = render(<ModeProvider initial="charterer"><TopNav /></ModeProvider>);
      const active = activeLinks(container);
      expect(active).toHaveLength(1);
      expect(active[0]).toHaveTextContent('Matches');
    });

    it('Cargo is active on /cargo in charterer mode', () => {
      mockUsePathname.mockReturnValue('/cargo');
      const { container } = render(<ModeProvider initial="charterer"><TopNav /></ModeProvider>);
      const active = activeLinks(container);
      expect(active).toHaveLength(1);
      expect(active[0]).toHaveTextContent('Cargo');
    });

    it('Market is active on /market', () => {
      mockUsePathname.mockReturnValue('/market');
      const { container } = render(<ModeProvider initial="charterer"><TopNav /></ModeProvider>);
      const active = activeLinks(container);
      expect(active).toHaveLength(1);
      expect(active[0]).toHaveTextContent('Market');
    });
  });
});
