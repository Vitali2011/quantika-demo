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

describe('TopNav', () => {
  beforeEach(() => {
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
});
