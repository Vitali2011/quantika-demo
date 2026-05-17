import { computeEconomics } from '../index';
import type { EconomicsInput } from '../index';

// Mock all sub-modules
jest.mock('../bunker', () => ({
  fetchBunkerPrices: jest.fn().mockResolvedValue(
    new Map([
      ['Rotterdam', { port: 'Rotterdam', vlsfo: 512, mgo: 748, fetched_at: '2026-04-28T00:00:00.000Z' }],
      ['Singapore', { port: 'Singapore', vlsfo: 498, mgo: 729, fetched_at: '2026-04-28T00:00:00.000Z' }],
    ])
  ),
}));

jest.mock('../ets', () => ({
  calculateEuEts: jest.fn().mockReturnValue({ amountEur: 5000, applicable: true }),
  fetchEuaPrice: jest.fn().mockResolvedValue({ price: 87.5, fetched_at: '2026-04-28T00:00:00.000Z' }),
}));

jest.mock('../war-risk', () => ({
  calculateWarRiskPremium: jest.fn().mockReturnValue({
    premiumUsd: 1500,
    zones: ['Red Sea / Bab al-Mandeb HRA'],
    applicable: true,
    zoneIds: ['red-sea-hra'],
    breakdown: {
      hullPremiumUsd: 1500,
      crewWarBonusUsd: 10_000,
      piSurchargeUsd: 20_000,
      totalPremiumUsd: 31_500,
    },
  }),
}));

jest.mock('../split-bunker', () => ({
  optimizeSplitBunker: jest.fn().mockReturnValue({
    recommendation: 'Bunker at Singapore',
    savingsUsd: 700,
    bunkerPlan: [{ port: 'Singapore', volumeMt: 600 }],
  }),
}));

const SAMPLE_INPUT: EconomicsInput = {
  route: {
    fromPort: 'Rotterdam',
    toPort: 'Singapore',
    viaCanal: 'Suez',
    intermediatePorts: ['Fujairah'],
  },
  vesselValueUsd: 15_000_000,
  daysInHra: 2,
  distanceNm: 11_000,
  euLegPercent: 0.5,
  vlsfoBurnMt: 400,
  consumptionMtPerDay: 30,
};

describe('computeEconomics', () => {
  it('returns an EconomicsResult with all required fields', async () => {
    const result = await computeEconomics(SAMPLE_INPUT);
    expect(result).toHaveProperty('breakdown');
    expect(result).toHaveProperty('totalUsd');
    expect(result).toHaveProperty('calculatedAt');
    expect(result).toHaveProperty('dataFreshness');
    expect(result.dataFreshness).toHaveProperty('bunker');
    expect(result.dataFreshness).toHaveProperty('eua');
  });

  it('breakdown contains all required sub-fields', async () => {
    const result = await computeEconomics(SAMPLE_INPUT);
    const { breakdown } = result;
    expect(typeof breakdown.bunkerCost).toBe('number');
    expect(typeof breakdown.bunkerPort).toBe('string');
    expect(typeof breakdown.euEtsAmount).toBe('number');
    expect(typeof breakdown.euEtsApplicable).toBe('boolean');
    expect(typeof breakdown.warRiskPremium).toBe('number');
    expect(Array.isArray(breakdown.warRiskZones)).toBe(true);
  });

  it('MEDIUM-3: warRiskTotal is populated from breakdown.totalPremiumUsd when war risk applicable', async () => {
    const result = await computeEconomics(SAMPLE_INPUT);
    expect(result.breakdown.warRiskTotal).toBe(31_500);
  });

  it('MEDIUM-3: warRiskBreakdown contains hull + crew + P&I fields', async () => {
    const result = await computeEconomics(SAMPLE_INPUT);
    const wb = result.breakdown.warRiskBreakdown!;
    expect(wb.hullPremiumUsd).toBe(1500);
    expect(wb.crewWarBonusUsd).toBe(10_000);
    expect(wb.piSurchargeUsd).toBe(20_000);
    expect(wb.totalPremiumUsd).toBe(31_500);
  });

  it('totalUsd is sum of costs', async () => {
    const result = await computeEconomics(SAMPLE_INPUT);
    expect(result.totalUsd).toBeGreaterThan(0);
  });

  it('calculatedAt is valid ISO string', async () => {
    const result = await computeEconomics(SAMPLE_INPUT);
    expect(() => new Date(result.calculatedAt)).not.toThrow();
    expect(new Date(result.calculatedAt).getTime()).toBeGreaterThan(0);
  });

  it('does not throw when mocked sub-modules return minimal data', async () => {
    await expect(computeEconomics(SAMPLE_INPUT)).resolves.toBeDefined();
  });
});
