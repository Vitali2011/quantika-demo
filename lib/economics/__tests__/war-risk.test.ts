import { calculateWarRiskPremium, JWC_HRA_ZONES } from '../war-risk';

describe('JWC_HRA_ZONES', () => {
  it('contains at least 4 HRA zones with premium > 0', () => {
    expect(JWC_HRA_ZONES.length).toBeGreaterThanOrEqual(4);
    JWC_HRA_ZONES.forEach(z => {
      expect(z.premiumPercent).toBeGreaterThan(0);
      expect(z.name).toBeTruthy();
    });
  });
});

describe('calculateWarRiskPremium', () => {
  it('returns 0 premium for a safe Atlantic route with no HRA', () => {
    const result = calculateWarRiskPremium({
      route: { fromPort: 'Rotterdam', toPort: 'New York' },
      vesselValueUsd: 10_000_000,
      daysInHra: 0,
    });
    expect(result.premiumUsd).toBe(0);
    expect(result.zones).toHaveLength(0);
  });

  it('detects Red Sea HRA when route involves Suez Canal', () => {
    const result = calculateWarRiskPremium({
      route: { fromPort: 'Rotterdam', toPort: 'Singapore', viaCanal: 'Suez' },
      vesselValueUsd: 20_000_000,
      daysInHra: 3,
    });
    expect(result.zones.length).toBeGreaterThan(0);
    expect(result.premiumUsd).toBeGreaterThan(0);
  });

  it('detects Gulf of Guinea HRA when toPort is West Africa', () => {
    const result = calculateWarRiskPremium({
      route: { fromPort: 'Rotterdam', toPort: 'Lagos' },
      vesselValueUsd: 15_000_000,
      daysInHra: 2,
    });
    expect(result.zones.some(z => /guinea/i.test(z))).toBe(true);
    expect(result.premiumUsd).toBeGreaterThan(0);
  });

  it('detects Black Sea HRA when any port is in Russia/Ukraine area', () => {
    const result = calculateWarRiskPremium({
      route: { fromPort: 'Odessa', toPort: 'Rotterdam' },
      vesselValueUsd: 12_000_000,
      daysInHra: 1,
    });
    expect(result.zones.some(z => /black sea/i.test(z))).toBe(true);
    expect(result.premiumUsd).toBeGreaterThan(0);
  });

  it('calculates premium proportional to vessel value and days in HRA', () => {
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
    expect(r2.premiumUsd).toBeGreaterThan(r1.premiumUsd);
  });

  it('returns 0 premium when daysInHra is 0 even for HRA route', () => {
    const result = calculateWarRiskPremium({
      route: { fromPort: 'Aden', toPort: 'Mumbai' },
      vesselValueUsd: 10_000_000,
      daysInHra: 0,
    });
    expect(result.premiumUsd).toBe(0);
  });
});
