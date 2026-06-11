import { parseConsumption, computeEstimatedTce, estimateFreightRate } from '@/lib/matching/tce-calculator';
import { DEFAULT_BUNKER_USD_PER_MT } from '@/lib/constants';

const DEFAULT = 25; // DEFAULT_CONSUMPTION_MT_PER_DAY

describe('parseConsumption — grade-token bug (C1 #796)', () => {
  it('grade-prefixed: "Ballast: IFO 180 M/E 3.7MT/D" → 3.7 (not 180)', () => {
    expect(parseConsumption('Ballast: IFO 180 M/E 3.7MT/D')).toBe(3.7);
  });

  it('plain mt/day: "abt 14 mt/day" → 14', () => {
    expect(parseConsumption('abt 14 mt/day')).toBe(14);
  });

  it('empty string → DEFAULT (25)', () => {
    expect(parseConsumption('')).toBe(DEFAULT);
  });

  it('no mt/day unit and no grade: "VLSFO only" → DEFAULT (25)', () => {
    expect(parseConsumption('VLSFO only')).toBe(DEFAULT);
  });

  it('{value: "IFO 180 M/E 3.7MT/D"} wrapper → 3.7', () => {
    expect(parseConsumption({ value: 'IFO 180 M/E 3.7MT/D' })).toBe(3.7);
  });

  it('null → DEFAULT', () => {
    expect(parseConsumption(null)).toBe(DEFAULT);
  });
});

describe('parseConsumption downstream: seed TCE sanity (C1 #796)', () => {
  it('grade-prefixed consumption yields non-absurd TCE (not -$96k/day)', () => {
    const freight = estimateFreightRate('GRAIN', 5000, 50000);
    const tce = computeEstimatedTce(
      freight,
      5000,   // distanceNm
      50000,  // dwtSummer
      40000,  // quantityMt
      12,     // speedKts
      parseConsumption('Ballast: IFO 180 M/E 3.7MT/D'),
      undefined, undefined, undefined, DEFAULT_BUNKER_USD_PER_MT,
    );
    // With correct consumption (3.7 mt/day), TCE should be positive and not absurd
    expect(tce.tce_usd_per_day).toBeGreaterThan(-10000);
    expect(tce.tce_usd_per_day).toBeLessThan(200000);
  });

  it('grade-prefixed beats naive parseLeadingNumber (180 mt/day) — confirms fix improves TCE', () => {
    const freight = estimateFreightRate('GRAIN', 5000, 50000);
    const tceCorrect = computeEstimatedTce(
      freight, 5000, 50000, 40000, 12,
      parseConsumption('Ballast: IFO 180 M/E 3.7MT/D'), // 3.7
      undefined, undefined, undefined, DEFAULT_BUNKER_USD_PER_MT,
    );
    const tceNaive = computeEstimatedTce(
      freight, 5000, 50000, 40000, 12,
      180, // naive parseLeadingNumber result
      undefined, undefined, undefined, DEFAULT_BUNKER_USD_PER_MT,
    );
    expect(tceCorrect.tce_usd_per_day).toBeGreaterThan(tceNaive.tce_usd_per_day);
  });
});
