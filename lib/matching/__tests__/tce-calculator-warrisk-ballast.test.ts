/**
 * TDD tests — ballast leg war-risk in buildMatchEconomics.
 * PR: fix-warrisk-ballast
 */

import { buildMatchEconomics } from '@/lib/matching/tce-calculator';

describe('buildMatchEconomics — ballast-leg war risk', () => {
  const baseInput = {
    cargoType: 'GRAIN',
    distanceNm: 5800,
    vesselDwt: 5328,
    quantityMt: 3000,
    speedKts: 11,
    consumptionMt: 14,
    loadPort: 'Marmara',
    dischargePort: 'Veracruz',
    calculatedAt: '2026-06-04T00:00:00.000Z',
    vesselValueUsd: 22_000_000,
  };

  it('SEAGULL-12 case: ballast through Red Sea HRA → non-zero ballast premium', () => {
    const econ = buildMatchEconomics({ ...baseInput, vesselOpenPosition: 'Hodeidah, Yemen' });
    expect(econ).not.toBeNull();
    // Laden leg (Marmara→Veracruz) hits no HRA
    expect(econ!.breakdown.warRiskBreakdownLaden).toBeUndefined();
    // Ballast leg (Hodeidah→Marmara) crosses Red Sea HRA
    expect(econ!.breakdown.warRiskBreakdownBallast).toBeDefined();
    expect(econ!.breakdown.warRiskBreakdownBallast!.totalPremiumUsd).toBeGreaterThan(0);
    expect(econ!.breakdown.warRiskZonesBallast).toContain('Red Sea / Bab al-Mandeb HRA');
    // Combined total reflects the ballast premium (laden is zero here)
    expect(econ!.breakdown.warRiskTotalCombined).toBe(
      econ!.breakdown.warRiskBreakdownBallast!.totalPremiumUsd,
    );
  });

  it('non-warzone open position → zero ballast premium, no change to laden', () => {
    const econ = buildMatchEconomics({ ...baseInput, vesselOpenPosition: 'Rotterdam' });
    expect(econ!.breakdown.warRiskBreakdownBallast).toBeUndefined();
    // warRiskTotalCombined falls back to laden-only (which is also 0 here)
    expect(econ!.breakdown.warRiskTotalCombined).toBe(0);
  });

  it('omitted openPosition → identical to legacy laden-only result', () => {
    const econLegacy = buildMatchEconomics(baseInput);                       // no openPosition
    const econExplicit = buildMatchEconomics({ ...baseInput, vesselOpenPosition: null });
    expect(econLegacy!.totalUsd).toBe(econExplicit!.totalUsd);
    expect(econLegacy!.breakdown.warRiskBreakdownBallast).toBeUndefined();
  });

  it('laden voyage in HRA + ballast also in HRA → both premiums present and summed', () => {
    const econ = buildMatchEconomics({
      ...baseInput,
      loadPort: 'Odessa',
      dischargePort: 'Constanta',
      vesselOpenPosition: 'Hodeidah',
    });
    expect(econ!.breakdown.warRiskBreakdownLaden).toBeDefined();
    expect(econ!.breakdown.warRiskBreakdownBallast).toBeDefined();
    expect(econ!.breakdown.warRiskTotalCombined).toBe(
      econ!.breakdown.warRiskBreakdownLaden!.totalPremiumUsd +
      econ!.breakdown.warRiskBreakdownBallast!.totalPremiumUsd,
    );
  });
});
