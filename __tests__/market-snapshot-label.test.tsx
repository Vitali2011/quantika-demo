/**
 * B13 — demo-snapshot label on market surfaces
 *
 * Strategy: static JSX source analysis (testEnvironment: 'node').
 * Verifies that all market-data surfaces carry the correct demo-snapshot label
 * and that the misleading "Live" copy has been removed from the about page.
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = process.cwd();

function readSource(filePath: string): string {
  return fs.readFileSync(path.join(ROOT, filePath), 'utf8');
}

// ──────────────────────────────────────────────────────────────────────────────
// app/market/page.tsx — badge must show "demo snapshot", not "Live · synced"
// ──────────────────────────────────────────────────────────────────────────────

describe('app/market/page.tsx — demo snapshot badge', () => {
  const src = readSource('app/market/page.tsx');

  it('contains "demo snapshot" label text', () => {
    expect(src).toContain('demo snapshot');
  });

  it('no longer shows "Live · synced"', () => {
    expect(src).not.toContain('Live · synced');
  });

  it('no longer shows stale "Last sync:" text in badge', () => {
    expect(src).not.toContain('Last sync:');
  });

  it('still keeps isStale variable (used as prop for MarketKpiTile)', () => {
    expect(src).toContain('const isStale =');
    // prop usage
    expect(src).toMatch(/isStale=\{isStale\}/);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// components/market/LiveStrip.tsx — caption added, aria-label updated
// ──────────────────────────────────────────────────────────────────────────────

describe('components/market/LiveStrip.tsx — demo snapshot caption', () => {
  const src = readSource('components/market/LiveStrip.tsx');

  it('renders "demo snapshot" caption', () => {
    expect(src).toContain('demo snapshot');
  });

  it('uses correct caption styling classes', () => {
    expect(src).toContain('text-[10px] font-mono text-slate-400 text-right tracking-wide');
  });

  it('wraps in space-y-1.5 container', () => {
    expect(src).toContain('space-y-1.5');
  });

  it('aria-label is "Market data" (not "Live market data")', () => {
    expect(src).toContain('aria-label="Market data"');
    expect(src).not.toContain('aria-label="Live market data"');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// components/dashboard/MarketIntelligence.tsx — caption added
// ──────────────────────────────────────────────────────────────────────────────

describe('components/dashboard/MarketIntelligence.tsx — demo data caption', () => {
  const src = readSource('components/dashboard/MarketIntelligence.tsx');

  it('renders "demo data" caption', () => {
    expect(src).toContain('demo data');
  });

  it('caption appears before noActiveDeals block', () => {
    const captionIdx = src.indexOf('demo data');
    const noActiveDealsIdx = src.indexOf('noActiveDeals &&');
    expect(captionIdx).toBeGreaterThan(0);
    expect(noActiveDealsIdx).toBeGreaterThan(captionIdx);
  });

  it('uses correct caption styling classes', () => {
    expect(src).toContain('text-[10px] font-mono text-slate-400 text-right tracking-wide');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// components/dashboard/DashboardKpiStrip.tsx — caption added
// ──────────────────────────────────────────────────────────────────────────────

describe('components/dashboard/DashboardKpiStrip.tsx — demo data caption', () => {
  const src = readSource('components/dashboard/DashboardKpiStrip.tsx');

  it('renders "demo data" caption', () => {
    expect(src).toContain('demo data');
  });

  it('wraps grid in space-y-1 container', () => {
    expect(src).toContain('space-y-1');
  });

  it('uses correct caption styling classes', () => {
    expect(src).toContain('text-[10px] font-mono text-slate-400 text-right tracking-wide');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// app/about/page.tsx — "Live " prefix removed from market intelligence desc
// ──────────────────────────────────────────────────────────────────────────────

describe('app/about/page.tsx — market intelligence copy', () => {
  const src = readSource('app/about/page.tsx');

  it('does not say "Live Baltic Exchange"', () => {
    expect(src).not.toContain('Live Baltic Exchange');
  });

  it('says "Baltic Exchange indices" without the Live prefix', () => {
    expect(src).toContain('Baltic Exchange indices (BDI, BCI, BSI, BHSI)');
  });
});
