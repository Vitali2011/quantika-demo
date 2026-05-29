/**
 * U5 / #679 — REAL computeEconomics money math (replaces the fully-mocked
 * lib/economics/__tests__/index.test.ts behavior for the cost-summation path).
 *
 * Audit finding (high): "computeEconomics integration test mocks all four
 * sub-modules — verifies mock return values, not aggregation logic. A bug in the
 * cost-summation loop inside computeEconomics would not be caught."
 *
 * Honest approach: mock ONLY the two NETWORK I/O boundaries (fetchBunkerPrices,
 * fetchEuaPrice) — those do real fetch() and cannot run in unit tests. The pure
 * calculators (calculateEuEts, calculateWarRiskPremium, optimizeSplitBunker) and
 * the REAL computeEconomics summation all execute for real. Expected dollar
 * figures are DERIVED by invoking the real calculators in the test, so the
 * assertions track the production formulas instead of frozen magic numbers.
 *
 * Mutation contract: change the `bunkerCost + etsUsd + warRisk.premiumUsd`
 * summation in lib/economics/index.ts (drop a term, flip a sign, swap EUR→USD
 * factor) and the totalUsd assertion goes RED. Verified in the U5 report.
 */

import type { BunkerPrice } from '../bunker';

// ── Mock ONLY the network boundary ──
const FETCHED_AT = '2026-05-20T00:00:00.000Z';
const BUNKER_MAP = new Map<string, BunkerPrice>([
  ['Rotterdam', { port: 'Rotterdam', vlsfo: 500, mgo: 720, fetched_at: FETCHED_AT }],
  ['Singapore', { port: 'Singapore', vlsfo: 450, mgo: 690, fetched_at: FETCHED_AT }],
]);
const EUA_PRICE = 80;

jest.mock('../bunker', () => {
  const actual = jest.requireActual('../bunker');
  return {
    ...actual,
    fetchBunkerPrices: jest.fn().mockResolvedValue(
      new Map([
        ['Rotterdam', { port: 'Rotterdam', vlsfo: 500, mgo: 720, fetched_at: '2026-05-20T00:00:00.000Z' }],
        ['Singapore', { port: 'Singapore', vlsfo: 450, mgo: 690, fetched_at: '2026-05-20T00:00:00.000Z' }],
      ])
    ),
  };
});

jest.mock('../ets', () => {
  const actual = jest.requireActual('../ets');
  return {
    ...actual,
    // Keep REAL calculateEuEts; mock only the network fetch.
    fetchEuaPrice: jest.fn().mockResolvedValue({ price: 80, fetched_at: '2026-05-20T00:00:00.000Z' }),
  };
});

// war-risk and split-bunker are pure — NOT mocked, they run for real.

import { computeEconomics, type EconomicsInput } from '../index';
import { calculateEuEts } from '../ets';
import { calculateWarRiskPremium } from '../war-risk';
import { optimizeSplitBunker } from '../split-bunker';

const INPUT: EconomicsInput = {
  route: { fromPort: 'Rotterdam', toPort: 'Singapore', viaCanal: 'Suez' },
  vesselValueUsd: 15_000_000,
  daysInHra: 2,
  distanceNm: 11_000,
  euLegPercent: 0.5,
  vlsfoBurnMt: 400,
  consumptionMtPerDay: 30,
};

const ESTIMATED_DAYS = 20; // hardcoded in computeEconomics + split-bunker

describe('computeEconomics — REAL cost summation (only network mocked)', () => {
  it('totalUsd equals the real bunker + ETS(USD) + hull-war-premium composition', async () => {
    const result = await computeEconomics(INPUT);

    // Derive expected pieces from the REAL calculators the production code uses.
    const ets = calculateEuEts({
      distanceNm: INPUT.distanceNm,
      euLegPercent: INPUT.euLegPercent,
      vlsfoBurnMt: INPUT.vlsfoBurnMt,
      euaPrice: EUA_PRICE,
    });
    const expectedEtsUsd = Math.round(ets.amountEur * 1.08);

    const warRisk = calculateWarRiskPremium({
      route: { fromPort: INPUT.route.fromPort, toPort: INPUT.route.toPort, viaCanal: INPUT.route.viaCanal },
      vesselValueUsd: INPUT.vesselValueUsd,
      daysInHra: INPUT.daysInHra,
    });

    const split = optimizeSplitBunker({
      route: { fromPort: INPUT.route.fromPort, toPort: INPUT.route.toPort, intermediatePorts: [] },
      bunkerPrices: BUNKER_MAP,
      consumptionMtPerDay: INPUT.consumptionMtPerDay,
    });
    const bunkerPort = split.bunkerPlan[0]?.port ?? INPUT.route.fromPort;
    const cheapest = BUNKER_MAP.get(bunkerPort)!;
    const expectedBunkerCost = Math.round(cheapest.vlsfo * INPUT.consumptionMtPerDay * ESTIMATED_DAYS);

    const expectedTotal = expectedBunkerCost + expectedEtsUsd + warRisk.premiumUsd;

    // Real sub-modules really ran:
    expect(result.breakdown.bunkerPort).toBe('Singapore'); // cheaper than Rotterdam
    expect(result.breakdown.bunkerCost).toBe(expectedBunkerCost);
    expect(result.breakdown.euEtsAmount).toBe(ets.amountEur);
    expect(result.breakdown.warRiskPremium).toBe(warRisk.premiumUsd);

    // The aggregation under test:
    expect(result.totalUsd).toBe(expectedTotal);
  });

  it('produces concrete, non-zero figures (sanity on the real fixture)', async () => {
    const result = await computeEconomics(INPUT);
    // Singapore @ 450 USD/MT × 30 MT/day × 20 days = 270_000.
    expect(result.breakdown.bunkerCost).toBe(270_000);
    // Suez routing → Red Sea HRA dominant (0.075%): 15M × 0.00075 = 11_250 hull.
    expect(result.breakdown.warRiskPremium).toBe(11_250);
    expect(result.breakdown.warRiskZones).toContain('Red Sea / Bab al-Mandeb HRA');
    // ETS: 400 × 3.114 × 0.5 × 80 = 49_824 EUR.
    expect(result.breakdown.euEtsAmount).toBe(49_824);
    expect(result.totalUsd).toBeGreaterThan(0);
  });

  it('drops the war-risk premium to 0 for a route with no HRA exposure (real branch)', async () => {
    const safe = await computeEconomics({
      ...INPUT,
      route: { fromPort: 'Rotterdam', toPort: 'New York' }, // no canal, no HRA ports
    });
    expect(safe.breakdown.warRiskPremium).toBe(0);
    expect(safe.breakdown.warRiskZones).toEqual([]);
    // total still includes bunker + ETS.
    expect(safe.totalUsd).toBeGreaterThan(0);
  });
});
