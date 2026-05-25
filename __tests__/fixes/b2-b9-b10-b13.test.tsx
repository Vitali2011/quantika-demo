/**
 * @jest-environment jsdom
 *
 * PI2 behavioral tests for bug batch B2+B9+B10+B13.
 *
 * B2: AIBar placeholder must be English (not Russian).
 * B9: /market footer links must have href attributes.
 * B10: Matches table minWidth must be ≥970px so CARGO/AGE columns are never clipped.
 * B13: TopNav logo must render both the amber Q square and the "Quantika" wordmark.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import * as fs from 'fs';
import * as path from 'path';

jest.mock('next/navigation', () => ({
  usePathname: jest.fn().mockReturnValue('/dashboard'),
  useRouter: jest.fn().mockReturnValue({ push: jest.fn() }),
}));

jest.mock('next/link', () => {
  const MockLink = ({ href, children, ...rest }: { href: string; children: React.ReactNode; [k: string]: unknown }) =>
    React.createElement('a', { href, ...rest }, children);
  MockLink.displayName = 'Link';
  return MockLink;
});

// ─── helpers ────────────────────────────────────────────────────────────────

const ROOT = process.cwd();

function readSrc(rel: string) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

// ─── B2: AIBar English placeholder ──────────────────────────────────────────

import { ModeProvider } from '@/design-system/patterns/ModeProvider';
import { PaletteProvider } from '@/design-system/patterns/usePalette';
import { AIBar } from '@/design-system/patterns/AIBar';

describe('B2 — AIBar placeholder is English', () => {
  function renderAIBar(mode: 'charterer' | 'owner') {
    return render(
      React.createElement(
        ModeProvider,
        { initial: mode },
        React.createElement(PaletteProvider, {} as any, React.createElement(AIBar)),
      ),
    );
  }

  it('charterer mode: placeholder contains English text', () => {
    renderAIBar('charterer');
    const bar = screen.getByRole('button', { name: /open ai assistant/i });
    expect(bar.textContent).toMatch(/ask anything/i);
    expect(bar.textContent).not.toMatch(/Спроси/);
  });

  it('owner mode: placeholder contains English text', () => {
    renderAIBar('owner');
    const bar = screen.getByRole('button', { name: /open ai assistant/i });
    expect(bar.textContent).toMatch(/ask anything/i);
    expect(bar.textContent).not.toMatch(/Спроси/);
  });
});

// ─── B9: /market footer links have hrefs ────────────────────────────────────

import { RoutesSection } from '@/components/market/RoutesSection';
import { FixturesSection } from '@/components/market/FixturesSection';
import { KnowledgeFeed } from '@/components/market/KnowledgeFeed';

describe('B9 — /market footer links have href attributes', () => {
  it('RoutesSection "all routes →" is a link with href', () => {
    render(React.createElement(RoutesSection));
    const link = screen.getByRole('link', { name: /all routes/i });
    expect(link).toHaveAttribute('href');
    expect(link.getAttribute('href')).not.toBe('');
  });

  it('FixturesSection "fixture log →" is a link with href', () => {
    render(React.createElement(FixturesSection));
    const link = screen.getByRole('link', { name: /fixture log/i });
    expect(link).toHaveAttribute('href');
    expect(link.getAttribute('href')).not.toBe('');
  });

  it('KnowledgeFeed "library →" is a link with href', () => {
    render(React.createElement(KnowledgeFeed));
    const link = screen.getByRole('link', { name: /library/i });
    expect(link).toHaveAttribute('href');
    expect(link.getAttribute('href')).not.toBe('');
  });
});

// ─── B10: Matches table minWidth ≥ 970px ────────────────────────────────────

describe('B10 — Matches table minWidth covers all columns', () => {
  it('MatchesClient table has minWidth ≥ 970px (sum of all columns)', () => {
    const src = readSrc('app/matches/MatchesClient.tsx');
    const match = src.match(/minWidth:\s*'(\d+)px'/);
    expect(match).not.toBeNull();
    const minWidth = parseInt(match![1], 10);
    expect(minWidth).toBeGreaterThanOrEqual(970);
  });
});

// ─── B13: TopNav logo shows amber square + wordmark ─────────────────────────

describe('B13 — TopNav logo has amber Q square and Quantika wordmark', () => {
  it('TopNav source has bg-ds-accent square wrapping Q letter', () => {
    const src = readSrc('design-system/patterns/TopNav.tsx');
    expect(src).toMatch(/bg-ds-accent[^"]*text-ds-accent-fg/);
    // Q must appear as text content inside a span (the amber square)
    expect(src).toMatch(/<span[^>]*bg-ds-accent[^>]*>Q<\/span>/);
  });

  it('TopNav source renders "Quantika" wordmark text', () => {
    const src = readSrc('design-system/patterns/TopNav.tsx');
    expect(src).toMatch(/Quantika/);
    // Must be a visible text node (span), not only aria-label
    expect(src).toMatch(/<span[^>]*>[^<]*Quantika[^<]*<\/span>/);
  });
});
