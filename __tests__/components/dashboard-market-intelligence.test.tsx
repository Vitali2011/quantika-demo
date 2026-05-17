/**
 * TDD tests for MarketIntelligence KPI cards.
 *
 * Issue #177: Bunker Rotterdam + EUA EU ETS + BHSI restored now that
 * /api/market/benchmark supports all three indicators via their respective
 * DB repositories (bunker_prices, eua_prices, market_indices).
 *
 * Uses static JSX source analysis (fs.readFileSync) — component source is truth.
 */

import * as fs from 'fs';
import * as path from 'path';

const componentPath = path.join(process.cwd(), 'components/dashboard/MarketIntelligence.tsx');
const source = fs.readFileSync(componentPath, 'utf8');

const withoutComments = source
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/.*$/gm, '');

describe('MarketIntelligence KPI cards (issue #177)', () => {
  it('renders Toepfer TMI KpiCard', () => {
    expect(withoutComments).toContain('Toepfer TMI');
  });

  it('renders Bunker Rotterdam KpiCard (backend implemented via bunker_prices DB)', () => {
    expect(withoutComments).toContain('Bunker Rotterdam');
  });

  it('renders EUA EU ETS KpiCard (backend implemented via eua_prices DB)', () => {
    expect(withoutComments).toContain('EUA EU ETS');
  });

  it('renders BHSI KpiCard (backend implemented via market_indices DB)', () => {
    expect(withoutComments).toContain('BHSI');
  });
});
