/**
 * @jest-environment jsdom
 *
 * TDD (RED) tests for components/nav/BottomNav.tsx
 *
 * The component does NOT exist yet — these tests are intentionally RED.
 * They define the expected behaviour so that the implementation can be
 * written to make them GREEN.
 *
 * Spec source: dev-pipeline-deep Phase 2a, mobile-bottom-nav-impl-t2b
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

jest.mock('next/navigation', () => ({
  usePathname: jest.fn(),
}));

import { usePathname } from 'next/navigation';
const mockUsePathname = usePathname as jest.MockedFunction<typeof usePathname>;

// This import will throw "Cannot find module" until the component is created.
// That is the intended RED failure for the file-not-found case.
import BottomNav from '@/components/nav/BottomNav';

describe('BottomNav — mobile bottom navigation (RED phase)', () => {
  beforeEach(() => {
    mockUsePathname.mockReturnValue('/dashboard');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  /**
   * TDD-1: All 4 navigation tabs rendered with correct hrefs.
   */
  it('TDD-1: renders 4 tabs — Home, Matches, Market, More — with correct hrefs', () => {
    render(<BottomNav />);

    // Tab labels must be visible
    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.getByText('Matches')).toBeInTheDocument();
    expect(screen.getByText('Market')).toBeInTheDocument();
    expect(screen.getByText('More')).toBeInTheDocument();

    // Correct hrefs
    expect(screen.getByRole('link', { name: /home/i })).toHaveAttribute('href', '/dashboard');
    expect(screen.getByRole('link', { name: /matches/i })).toHaveAttribute('href', '/matches');
    expect(screen.getByRole('link', { name: /market/i })).toHaveAttribute('href', '/market');
    expect(screen.getByRole('link', { name: /more/i })).toHaveAttribute('href', '/more');
  });

  /**
   * TDD-2: Root nav element is hidden on desktop (md:hidden).
   */
  it('TDD-2: root element has md:hidden CSS class (hidden on desktop breakpoint)', () => {
    const { container } = render(<BottomNav />);

    const nav = container.firstElementChild as HTMLElement;
    expect(nav).not.toBeNull();
    expect(nav.className).toContain('md:hidden');
  });

  /**
   * TDD-3: Accessibility — role="navigation" and aria-label="Main navigation".
   */
  it('TDD-3: has role="navigation" and aria-label="Main navigation"', () => {
    render(<BottomNav />);

    const nav = screen.getByRole('navigation', { name: 'Main navigation' });
    expect(nav).toBeInTheDocument();
  });

  /**
   * TDD-4: Active tab detection — /dashboard makes Home tab active.
   */
  it('TDD-4: Home tab has aria-current="page" when pathname is /dashboard', () => {
    mockUsePathname.mockReturnValue('/dashboard');
    render(<BottomNav />);

    const homeLink = screen.getByRole('link', { name: /home/i });
    expect(homeLink).toHaveAttribute('aria-current', 'page');

    // Other tabs must NOT be active
    expect(screen.getByRole('link', { name: /matches/i })).not.toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: /market/i })).not.toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: /more/i })).not.toHaveAttribute('aria-current', 'page');
  });

  /**
   * TDD-5: Active tab detection — /matches makes Matches tab active.
   */
  it('TDD-5: Matches tab has aria-current="page" when pathname is /matches', () => {
    mockUsePathname.mockReturnValue('/matches');
    render(<BottomNav />);

    const matchesLink = screen.getByRole('link', { name: /matches/i });
    expect(matchesLink).toHaveAttribute('aria-current', 'page');

    // Home and Market must NOT be active
    expect(screen.getByRole('link', { name: /home/i })).not.toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: /market/i })).not.toHaveAttribute('aria-current', 'page');
  });

  /**
   * TDD-6: Regression #417 — More tab active on /more.
   */
  it('TDD-6: More tab has aria-current="page" when pathname is /more', () => {
    mockUsePathname.mockReturnValue('/more');
    render(<BottomNav />);

    const moreLink = screen.getByRole('link', { name: /more/i });
    expect(moreLink).toHaveAttribute('aria-current', 'page');

    // Other tabs must NOT be active
    expect(screen.getByRole('link', { name: /home/i })).not.toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: /matches/i })).not.toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: /market/i })).not.toHaveAttribute('aria-current', 'page');
  });
});
