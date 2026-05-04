/**
 * TDD tests for γ-cleanup-4 F2: MarketIntelligence dashboard cleanup.
 *
 * All 4 KPI cards showed "Unavailable": Bunker Rotterdam + EUA EU ETS have
 * url=null (no backend), BHSI returns 503 (not implemented in benchmark.ts).
 * Fix: keep only Toepfer TMI (the only working indicator).
 *
 * Uses static JSX source analysis (fs.readFileSync) so no jsdom / React
 * setup overhead; the component file is the source of truth.
 *
 * We check for KpiCard label="…" patterns specifically — so TODO/JSDoc
 * comments mentioning removed labels do not cause false positives.
 */

import * as fs from 'fs';
import * as path from 'path';

const componentPath = path.join(process.cwd(), 'components/dashboard/MarketIntelligence.tsx');
const source = fs.readFileSync(componentPath, 'utf8');

// Extract only the JSX/TSX portion — strip single-line and multi-line comments
// so TODO comments mentioning old label names don't cause false positives.
const withoutComments = source
  .replace(/\/\*[\s\S]*?\*\//g, '')   // block comments
  .replace(/\/\/.*$/gm, '');           // line comments

describe('MarketIntelligence dashboard cleanup (γ-cleanup-4 F2)', () => {
  it('contains Toepfer TMI KpiCard (the only implemented indicator)', () => {
    expect(withoutComments).toContain('Toepfer TMI');
  });

  it('does NOT render Bunker Rotterdam KpiCard (url=null, no backend)', () => {
    expect(withoutComments).not.toContain('Bunker Rotterdam');
  });

  it('does NOT render EUA EU ETS KpiCard (url=null, no backend)', () => {
    expect(withoutComments).not.toContain('EUA EU ETS');
  });

  it('does NOT render BHSI KpiCard (backend returns 503)', () => {
    expect(withoutComments).not.toContain('BHSI');
  });
});
