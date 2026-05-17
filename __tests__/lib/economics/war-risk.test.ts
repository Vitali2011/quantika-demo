/**
 * Issue #178: crew war bonus + P&I surcharge breakdown.
 * Tests the new WarRiskBreakdown field on WarRiskResult.
 */
import {
  calculateWarRiskPremium,
  CREW_WAR_BONUS_PER_PERSON_USD,
  DEFAULT_CREW_COUNT,
  PI_SURCHARGE_USD,
} from '@/lib/economics/war-risk';

describe('WarRiskBreakdown — crew war bonus + P&I surcharge (issue #178)', () => {
  describe('breakdown presence', () => {
    it('includes breakdown when route is in HRA zone', () => {
      const result = calculateWarRiskPremium({
        route: { fromPort: 'Rotterdam', toPort: 'Lagos' },
        vesselValueUsd: 8_000_000,
      });
      expect(result.applicable).toBe(true);
      expect(result.breakdown).toBeDefined();
    });

    it('breakdown is undefined when route is safe (no HRA)', () => {
      const result = calculateWarRiskPremium({
        route: { fromPort: 'Rotterdam', toPort: 'New York' },
        vesselValueUsd: 10_000_000,
      });
      expect(result.applicable).toBe(false);
      expect(result.breakdown).toBeUndefined();
    });
  });

  describe('default crew (20 persons)', () => {
    it('crewWarBonusUsd = $500 × 20 = $10,000 by default', () => {
      const result = calculateWarRiskPremium({
        route: { fromPort: 'Rotterdam', toPort: 'Lagos' },
        vesselValueUsd: 8_000_000,
      });
      expect(result.breakdown!.crewWarBonusUsd).toBe(DEFAULT_CREW_COUNT * CREW_WAR_BONUS_PER_PERSON_USD);
      expect(result.breakdown!.crewWarBonusUsd).toBe(10_000);
    });

    it('piSurchargeUsd = $5,000 flat per voyage', () => {
      const result = calculateWarRiskPremium({
        route: { fromPort: 'Rotterdam', toPort: 'Odessa' },
        vesselValueUsd: 10_000_000,
      });
      expect(result.breakdown!.piSurchargeUsd).toBe(PI_SURCHARGE_USD);
      expect(result.breakdown!.piSurchargeUsd).toBe(5_000);
    });
  });

  describe('configurable crewCount param', () => {
    it('crewCount=10 → crewWarBonusUsd = $5,000', () => {
      const result = calculateWarRiskPremium({
        route: { fromPort: 'Rotterdam', toPort: 'Lagos' },
        vesselValueUsd: 8_000_000,
        crewCount: 10,
      });
      expect(result.breakdown!.crewWarBonusUsd).toBe(5_000);
    });

    it('crewCount=25 → crewWarBonusUsd = $12,500', () => {
      const result = calculateWarRiskPremium({
        route: { fromPort: 'Rotterdam', toPort: 'Lagos' },
        vesselValueUsd: 8_000_000,
        crewCount: 25,
      });
      expect(result.breakdown!.crewWarBonusUsd).toBe(12_500);
    });
  });

  describe('totalPremiumUsd = hull + crew + P&I', () => {
    it('Gulf of Guinea $8M: totalPremiumUsd = hullPremiumUsd + $10k + $5k', () => {
      const result = calculateWarRiskPremium({
        route: { fromPort: 'Rotterdam', toPort: 'Lagos' },
        vesselValueUsd: 8_000_000,
      });
      expect(result.breakdown!.hullPremiumUsd).toBe(result.premiumUsd);
      expect(result.breakdown!.totalPremiumUsd).toBe(result.premiumUsd + 10_000 + 5_000);
    });

    it('Black Sea HRA: totalPremiumUsd > hull-only premiumUsd', () => {
      const result = calculateWarRiskPremium({
        route: { fromPort: 'Odessa', toPort: 'Rotterdam' },
        vesselValueUsd: 12_000_000,
      });
      expect(result.breakdown!.totalPremiumUsd).toBeGreaterThan(result.premiumUsd);
    });

    it('Red Sea / Suez transit: totalPremiumUsd = hull + $10k + $5k', () => {
      const result = calculateWarRiskPremium({
        route: { fromPort: 'Rotterdam', toPort: 'Singapore', viaCanal: 'Suez' },
        vesselValueUsd: 10_000_000,
      });
      expect(result.breakdown!.totalPremiumUsd).toBe(
        result.breakdown!.hullPremiumUsd + result.breakdown!.crewWarBonusUsd + result.breakdown!.piSurchargeUsd,
      );
    });
  });

  describe('backward compat — premiumUsd unchanged', () => {
    it('premiumUsd remains hull-only, not inflated by crew/P&I', () => {
      const result = calculateWarRiskPremium({
        route: { fromPort: 'Rotterdam', toPort: 'Lagos' },
        vesselValueUsd: 8_000_000,
      });
      // Hull = 8M × 0.0005 = $4,000 (unchanged)
      expect(result.premiumUsd).toBeCloseTo(4_000, -1);
      // Total is higher
      expect(result.breakdown!.totalPremiumUsd).toBeGreaterThan(result.premiumUsd);
    });
  });
});
