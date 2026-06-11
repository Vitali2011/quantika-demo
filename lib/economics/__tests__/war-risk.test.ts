import { calculateWarRiskPremium, JWC_HRA_ZONES } from '../war-risk';
import { __resetRateCacheForTest, loadJwcRates } from '../war-risk-rates';

describe('JWC_HRA_ZONES', () => {
  it('contains at least 4 HRA zones with per-transit premium > 0', () => {
    expect(JWC_HRA_ZONES.length).toBeGreaterThanOrEqual(4);
    JWC_HRA_ZONES.forEach(z => {
      expect(z.premiumPercentPerTransit).toBeGreaterThan(0);
      expect(z.name).toBeTruthy();
      expect(z.id).toBeTruthy();
    });
  });

  it('per-transit rates are within realistic JWC range (0.04%–1.0%)', () => {
    // Upper bound updated to 0.01 (1%) to accommodate JWLA-033 Persian Gulf zone (0.5%)
    JWC_HRA_ZONES.forEach(z => {
      expect(z.premiumPercentPerTransit).toBeGreaterThanOrEqual(0.0004);
      expect(z.premiumPercentPerTransit).toBeLessThanOrEqual(0.01);
    });
  });
});

describe('calculateWarRiskPremium (per-voyage rate model — βf-04)', () => {
  it('returns applicable:false, $0 for a safe Atlantic route with no HRA', () => {
    const result = calculateWarRiskPremium({
      route: { fromPort: 'Rotterdam', toPort: 'New York' },
      vesselValueUsd: 10_000_000,
      daysInHra: 0,
    });
    expect(result.applicable).toBe(false);
    expect(result.premiumUsd).toBe(0);
    expect(result.zones).toHaveLength(0);
  });

  it('Gulf of Guinea HRA: $8M vessel → ~$40,000 (0.50% per transit, live rate)', () => {
    const result = calculateWarRiskPremium({
      route: { fromPort: 'Rotterdam', toPort: 'Lagos' },
      vesselValueUsd: 8_000_000,
      daysInHra: 5,
    });
    expect(result.applicable).toBe(true);
    expect(result.premiumUsd).toBeGreaterThanOrEqual(37_000);
    expect(result.premiumUsd).toBeLessThanOrEqual(43_000);
    expect(result.zones.some(z => /guinea/i.test(z))).toBe(true);
  });

  it('Red Sea / Bab al-Mandeb (Suez transit): $10M vessel → ~$20,000 (0.20% live rate)', () => {
    const result = calculateWarRiskPremium({
      route: { fromPort: 'Rotterdam', toPort: 'Singapore', viaCanal: 'Suez' },
      vesselValueUsd: 10_000_000,
      daysInHra: 1,
    });
    expect(result.applicable).toBe(true);
    expect(result.premiumUsd).toBeGreaterThanOrEqual(18_000);
    expect(result.premiumUsd).toBeLessThanOrEqual(22_000);
  });

  it('Black Sea HRA when any port is in Russia/Ukraine area: $12M → $78,000 (0.65% live rate)', () => {
    const result = calculateWarRiskPremium({
      route: { fromPort: 'Odessa', toPort: 'Rotterdam' },
      vesselValueUsd: 12_000_000,
      daysInHra: 1,
    });
    expect(result.applicable).toBe(true);
    expect(result.zones.some(z => /black sea/i.test(z))).toBe(true);
    expect(result.premiumUsd).toBeCloseTo(78_000, -1);
  });

  it('premium scales with vessel value (per-voyage, days-independent)', () => {
    const r1 = calculateWarRiskPremium({
      route: { fromPort: 'Aden', toPort: 'Mumbai' },
      vesselValueUsd: 10_000_000,
      daysInHra: 2,
    });
    const r2 = calculateWarRiskPremium({
      route: { fromPort: 'Aden', toPort: 'Mumbai' },
      vesselValueUsd: 20_000_000,
      daysInHra: 2,
    });
    expect(r1.applicable).toBe(true);
    expect(r2.applicable).toBe(true);
    expect(r2.premiumUsd).toBeGreaterThan(r1.premiumUsd);
    expect(r2.premiumUsd).toBeCloseTo(r1.premiumUsd * 2, -1);
  });

  it('daysInHra=0 with HRA zone matched → still applicable, premium > 0 (per-transit)', () => {
    const result = calculateWarRiskPremium({
      route: { fromPort: 'Rotterdam', toPort: 'Lagos' },
      vesselValueUsd: 8_000_000,
      daysInHra: 0,
    });
    expect(result.applicable).toBe(true);
    expect(result.premiumUsd).toBeGreaterThan(0);
  });

  it('vesselValueUsd missing/invalid → graceful fallback to $8M default', () => {
    const result = calculateWarRiskPremium({
      route: { fromPort: 'Rotterdam', toPort: 'Lagos' },
      vesselValueUsd: NaN as unknown as number,
      daysInHra: 1,
    });
    expect(result.applicable).toBe(true);
    // 8M × 0.50% (live GoG rate) = $40,000
    expect(result.premiumUsd).toBeCloseTo(40_000, -1);
  });

  it('detects Suez transit via canal hint even without HRA port name', () => {
    const result = calculateWarRiskPremium({
      route: { fromPort: 'Rotterdam', toPort: 'Singapore', viaCanal: 'Suez' },
      vesselValueUsd: 20_000_000,
      daysInHra: 3,
    });
    expect(result.applicable).toBe(true);
    expect(result.zones.length).toBeGreaterThan(0);
    expect(result.premiumUsd).toBeGreaterThan(0);
  });
});

describe('calculateWarRiskPremium — live rates (Stage 2)', () => {
  beforeEach(() => {
    __resetRateCacheForTest();
  });

  afterEach(() => {
    __resetRateCacheForTest();
  });

  it('Red Sea $8M → hull uses 0.20% live rate → premiumUsd === 16,000, rateDate === 2026-03-12, rateSource === knowledge', () => {
    const result = calculateWarRiskPremium({
      route: { fromPort: 'Rotterdam', toPort: 'Aden', viaCanal: 'Suez' },
      vesselValueUsd: 8_000_000,
      daysInHra: 1,
    });
    expect(result.applicable).toBe(true);
    // 8_000_000 × 0.002 = 16_000
    expect(result.premiumUsd).toBe(16_000);
    expect(result.rateDate).toBe('2026-03-12');
    expect(result.rateSource).toBe('knowledge');
  });

  it('Gulf of Guinea $8M → hull uses 0.50% live rate → premiumUsd === 40,000', () => {
    const result = calculateWarRiskPremium({
      route: { fromPort: 'Rotterdam', toPort: 'Lagos' },
      vesselValueUsd: 8_000_000,
      daysInHra: 5,
    });
    expect(result.applicable).toBe(true);
    // 8_000_000 × 0.005 = 40_000
    expect(result.premiumUsd).toBe(40_000);
    expect(result.rateSource).toBe('knowledge');
  });

  it('Persian Gulf $8M → hull uses 0.75% live rate → premiumUsd ≈ 60,000', () => {
    const result = calculateWarRiskPremium({
      route: { fromPort: 'Rotterdam', toPort: 'Bandar Abbas' },
      vesselValueUsd: 8_000_000,
      daysInHra: 2,
    });
    expect(result.applicable).toBe(true);
    // 8_000_000 × 0.0075 = 60_000 (allow ±1)
    expect(result.premiumUsd).toBeGreaterThanOrEqual(59_999);
    expect(result.premiumUsd).toBeLessThanOrEqual(60_001);
    expect(result.rateSource).toBe('knowledge');
  });

  it('loader-unavailable fallback: YAML not found → rateDate === 2024-01-01, rateSource === hardcoded', () => {
    // Force the rate loader to see a missing file so _cache becomes null.
    // loadJwcRates() with a non-existent path catches the ENOENT and sets _cache = null.
    loadJwcRates('/tmp/__nonexistent_jwc_rates_test__.yaml');

    const result = calculateWarRiskPremium({
      route: { fromPort: 'Rotterdam', toPort: 'Aden', viaCanal: 'Suez' },
      vesselValueUsd: 8_000_000,
      daysInHra: 1,
    });
    expect(result.applicable).toBe(true);
    expect(result.rateDate).toBe('2024-01-01');
    expect(result.rateSource).toBe('hardcoded');
    // 8_000_000 × 0.00075 (hardcoded Red Sea fallback) = 6_000
    expect(result.premiumUsd).toBeCloseTo(6_000, -1);
  });
});
