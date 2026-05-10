import { calculateWarRiskPremium, JWC_HRA_ZONES } from '../war-risk';

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

  it('Gulf of Guinea HRA: $8M vessel → ~$4,000 (0.05% per transit)', () => {
    const result = calculateWarRiskPremium({
      route: { fromPort: 'Rotterdam', toPort: 'Lagos' },
      vesselValueUsd: 8_000_000,
      daysInHra: 5,
    });
    expect(result.applicable).toBe(true);
    expect(result.premiumUsd).toBeGreaterThanOrEqual(3_500);
    expect(result.premiumUsd).toBeLessThanOrEqual(5_000);
    expect(result.zones.some(z => /guinea/i.test(z))).toBe(true);
  });

  it('Red Sea / Bab al-Mandeb (Suez transit): $10M vessel → ~$7,500 (0.075%)', () => {
    const result = calculateWarRiskPremium({
      route: { fromPort: 'Rotterdam', toPort: 'Singapore', viaCanal: 'Suez' },
      vesselValueUsd: 10_000_000,
      daysInHra: 1,
    });
    expect(result.applicable).toBe(true);
    expect(result.premiumUsd).toBeGreaterThanOrEqual(7_000);
    expect(result.premiumUsd).toBeLessThanOrEqual(9_000);
  });

  it('Black Sea HRA when any port is in Russia/Ukraine area: $12M → $12,000 (0.10%)', () => {
    const result = calculateWarRiskPremium({
      route: { fromPort: 'Odessa', toPort: 'Rotterdam' },
      vesselValueUsd: 12_000_000,
      daysInHra: 1,
    });
    expect(result.applicable).toBe(true);
    expect(result.zones.some(z => /black sea/i.test(z))).toBe(true);
    expect(result.premiumUsd).toBeCloseTo(12_000, -1);
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
    // 8M × 0.05% = $4,000
    expect(result.premiumUsd).toBeCloseTo(4_000, -1);
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
