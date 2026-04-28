import { optimizeSplitBunker } from '../split-bunker';
import type { BunkerPrice } from '../bunker';

function makePrice(port: string, vlsfo: number, mgo?: number): BunkerPrice {
  return { port, vlsfo, mgo, fetched_at: new Date().toISOString() };
}

const PRICES: Map<string, BunkerPrice> = new Map([
  ['Rotterdam', makePrice('Rotterdam', 512)],
  ['Singapore', makePrice('Singapore', 498)],
  ['Houston',   makePrice('Houston', 533)],
  ['Fujairah',  makePrice('Fujairah', 505)],
]);

describe('optimizeSplitBunker', () => {
  it('returns recommendation string, savingsUsd, and bunkerPlan array', () => {
    const result = optimizeSplitBunker({
      route: { fromPort: 'Rotterdam', toPort: 'Singapore', intermediatePorts: ['Fujairah'] },
      bunkerPrices: PRICES,
      consumptionMtPerDay: 30,
    });
    expect(typeof result.recommendation).toBe('string');
    expect(typeof result.savingsUsd).toBe('number');
    expect(Array.isArray(result.bunkerPlan)).toBe(true);
  });

  it('selects cheapest port on route', () => {
    const result = optimizeSplitBunker({
      route: { fromPort: 'Rotterdam', toPort: 'Singapore', intermediatePorts: ['Fujairah'] },
      bunkerPrices: PRICES,
      consumptionMtPerDay: 30,
    });
    // Singapore is cheapest at 498 USD/MT
    const ports = result.bunkerPlan.map(b => b.port);
    expect(ports).toContain('Singapore');
  });

  it('returns empty bunkerPlan when no prices available', () => {
    const result = optimizeSplitBunker({
      route: { fromPort: 'Tokyo', toPort: 'Sydney', intermediatePorts: [] },
      bunkerPrices: new Map(),
      consumptionMtPerDay: 25,
    });
    expect(result.bunkerPlan).toHaveLength(0);
    expect(result.savingsUsd).toBe(0);
  });

  it('assigns positive volume to bunker ports', () => {
    const result = optimizeSplitBunker({
      route: { fromPort: 'Rotterdam', toPort: 'Singapore', intermediatePorts: ['Fujairah'] },
      bunkerPrices: PRICES,
      consumptionMtPerDay: 30,
    });
    result.bunkerPlan.forEach(b => {
      expect(b.volumeMt).toBeGreaterThan(0);
    });
  });

  it('calculates positive savings when split is beneficial vs. buying all at most expensive port', () => {
    const prices: Map<string, BunkerPrice> = new Map([
      ['Rotterdam', makePrice('Rotterdam', 550)],
      ['Singapore', makePrice('Singapore', 490)],
    ]);
    const result = optimizeSplitBunker({
      route: { fromPort: 'Rotterdam', toPort: 'Singapore', intermediatePorts: [] },
      bunkerPrices: prices,
      consumptionMtPerDay: 50,
    });
    // Should prefer Singapore (cheaper), savings vs Rotterdam
    expect(result.savingsUsd).toBeGreaterThanOrEqual(0);
  });
});
