/**
 * TDD tests for BP-04: RouteCompareModal price sources section.
 *
 * Uses static JSX source analysis. Verifies:
 * - "Price sources" section heading exists in component
 * - Two PriceSourceBadge components rendered (bunker + EUA)
 * - bunkerPriceSource / euaPriceSource from API response used
 * - Backward compat: only renders if fields exist in data
 */

import * as fs from 'fs';
import * as path from 'path';

const componentPath = path.join(process.cwd(), 'components/economics/RouteCompareModal.tsx');
const source = fs.readFileSync(componentPath, 'utf8');
const withoutComments = source
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/.*$/gm, '');

describe('RouteCompareModal price sources (BP-04)', () => {
  it('imports PriceSourceBadge component', () => {
    expect(source).toContain('PriceSourceBadge');
  });

  it('renders "Price sources" section heading', () => {
    expect(withoutComments).toContain('Price sources');
  });

  it('references bunkerPriceSource from API data', () => {
    expect(withoutComments).toContain('bunkerPriceSource');
  });

  it('references euaPriceSource from API data', () => {
    expect(withoutComments).toContain('euaPriceSource');
  });

  it('uses PriceSourceBadge component in JSX', () => {
    expect(withoutComments).toMatch(/<PriceSourceBadge/);
  });

  it('renders two PriceSourceBadge instances (bunker + EUA)', () => {
    const count = (withoutComments.match(/<PriceSourceBadge/g) || []).length;
    expect(count).toBeGreaterThanOrEqual(2);
  });

  it('has backward compat: only renders if bunkerPriceSource exists in data', () => {
    // conditional rendering pattern
    expect(withoutComments).toMatch(/bunkerPriceSource.*&&|data\.bunkerPriceSource/);
  });

  it('price sources section positioned after route comparison results', () => {
    const priceSourcesIdx = withoutComments.indexOf('Price sources');
    const routeCardIdx = withoutComments.indexOf('route-card-');
    expect(priceSourcesIdx).toBeGreaterThan(routeCardIdx);
  });

  it('RouteCompareResult type or data shape includes bunkerPriceSource', () => {
    // either via extended type or direct data access
    expect(withoutComments).toContain('bunkerPriceSource');
  });
});
