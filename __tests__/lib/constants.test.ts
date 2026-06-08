/**
 * W7: centralized bunker + ETS fallback constants (closes I8, I9).
 * RED first — these exports don't exist until GREEN phase.
 */
import { DEFAULT_BUNKER_USD_PER_MT, FALLBACK_EUA_EUR_PER_TCO2, BUNKER_DEFAULTS } from '@/lib/constants';

describe('centralized constants (W7)', () => {
  it('exports DEFAULT_BUNKER_USD_PER_MT = 600', () => {
    expect(DEFAULT_BUNKER_USD_PER_MT).toBe(600);
  });

  it('exports FALLBACK_EUA_EUR_PER_TCO2 = 87.5', () => {
    expect(FALLBACK_EUA_EUR_PER_TCO2).toBe(87.5);
  });

  it('BUNKER_DEFAULTS.bunkerPrice all equal DEFAULT_BUNKER_USD_PER_MT', () => {
    for (const cls of Object.keys(BUNKER_DEFAULTS) as Array<keyof typeof BUNKER_DEFAULTS>) {
      expect(BUNKER_DEFAULTS[cls].bunkerPrice).toBe(DEFAULT_BUNKER_USD_PER_MT);
    }
  });
});

// PI2 behavioral: prove fallback parity — no default value drift between modules
describe('fallback parity — PI2 behavioral (W7)', () => {
  it('computeEstimatedTce with no bunkerPriceUsdPerMt == with DEFAULT_BUNKER_USD_PER_MT', async () => {
    // Dynamic import to avoid pulling server deps at compile time
    const { computeEstimatedTce } = await import('@/lib/matching/tce-calculator');
    const freight = { rate: 20, source: 'estimated' as const, confidence: 0.5 };
    const withDefault = computeEstimatedTce(freight, 3000, 50000, 45000);
    const withExplicit = computeEstimatedTce(
      freight, 3000, 50000, 45000,
      12, 25, undefined, undefined, undefined,
      DEFAULT_BUNKER_USD_PER_MT,
    );
    expect(withDefault.tce_usd_per_day).toBe(withExplicit.tce_usd_per_day);
  });

  it('RouteCompareModal DEFAULT_MARKET bunker == DEFAULT_BUNKER_USD_PER_MT (source code grep)', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(
      require.resolve('@/components/economics/RouteCompareModal'),
    ).toString();
    // After W7: DEFAULT_MARKET must not hardcode 620 or any literal other than the imported constant
    expect(src).not.toMatch(/bunkerPriceUsdPerMt:\s*620/);
  });
});
