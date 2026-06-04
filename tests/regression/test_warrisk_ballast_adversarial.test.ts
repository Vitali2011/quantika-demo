/**
 * Adversarial regression tests — war-risk ballast leg (PR: fix-warrisk-ballast)
 * Goal: expose bugs, not confirm happy paths. DO NOT fix source code — report only.
 */

import { buildMatchEconomics } from '@/lib/matching/tce-calculator';
import { calculateWarRiskPremium } from '@/lib/economics/war-risk';

const CALC_AT = '2026-06-04T00:00:00.000Z';
const baseHRA = {
  cargoType: 'GRAIN',
  distanceNm: 3000,
  vesselDwt: 50000,
  quantityMt: 45000,
  speedKts: 12,
  consumptionMt: 25,
  loadPort: 'Lagos',         // Gulf of Guinea HRA
  dischargePort: 'Hamburg',
  calculatedAt: CALC_AT,
  vesselValueUsd: 8_000_000,
};

const baseNonHRA = {
  ...baseHRA,
  loadPort: 'Rotterdam',
  dischargePort: 'Hamburg',
};

describe('warRiskBallast — totalUsd semantic change (A1)', () => {
  // PRE-PR: totalUsd = costs + hull_premium_only
  // POST-PR: totalUsd = costs + (hull+crew+P&I + ballast_total)
  // This is an intentional change — crew+P&I now included in totalUsd for HRA laden routes
  it('HRA laden route without openPosition: totalUsd now includes hull+crew+P&I (not hull-only)', () => {
    const econ = buildMatchEconomics(baseHRA);  // no vesselOpenPosition
    expect(econ).not.toBeNull();

    const warRisk = calculateWarRiskPremium({
      route: { fromPort: 'Lagos', toPort: 'Hamburg' },
      vesselValueUsd: 8_000_000,
    });

    // Old behavior: totalUsd = costs + warRisk.premiumUsd (hull only)
    // New behavior: totalUsd = costs + warRisk.breakdown.totalPremiumUsd (hull+crew+P&I)
    // If no ballast position, warCombinedTotal = breakdown.totalPremiumUsd (not premiumUsd)
    const warFullTotal = warRisk.breakdown!.totalPremiumUsd;
    const warHullOnly = warRisk.premiumUsd;

    // These must differ for this test to have teeth
    expect(warFullTotal).toBeGreaterThan(warHullOnly);

    // New totalUsd should include the full war risk (hull+crew+P&I)
    // If this fails, it means totalUsd is still hull-only (pre-PR regression)
    expect(econ!.totalUsd).toBeGreaterThan(econ!.totalUsd - warFullTotal + warHullOnly);
    // Verify the breakdown field is set correctly
    expect(econ!.breakdown.warRiskTotalCombined).toBe(warFullTotal);
  });

  it('non-HRA route without openPosition: totalUsd unchanged (zero war risk)', () => {
    const econ = buildMatchEconomics(baseNonHRA);
    expect(econ).not.toBeNull();
    expect(econ!.breakdown.warRiskTotalCombined).toBe(0);
    expect(econ!.breakdown.warRiskBreakdownBallast).toBeUndefined();
    expect(econ!.breakdown.warRiskBreakdownLaden).toBeUndefined();
  });
});

describe('warRiskBallast — BC alias integrity (A2)', () => {
  it('warRiskBreakdown and warRiskBreakdownLaden reference the same object for HRA laden', () => {
    const econ = buildMatchEconomics(baseHRA);
    expect(econ).not.toBeNull();
    expect(econ!.breakdown.warRiskBreakdown).toBe(econ!.breakdown.warRiskBreakdownLaden);
  });

  it('warRiskBreakdown and warRiskBreakdownLaden both undefined for non-HRA laden', () => {
    const econ = buildMatchEconomics(baseNonHRA);
    expect(econ!.breakdown.warRiskBreakdown).toBeUndefined();
    expect(econ!.breakdown.warRiskBreakdownLaden).toBeUndefined();
  });

  it('warRiskPremium (hull-only BC field) unchanged: still hull-only for HRA laden', () => {
    const econ = buildMatchEconomics(baseHRA);
    const warRisk = calculateWarRiskPremium({
      route: { fromPort: 'Lagos', toPort: 'Hamburg' },
      vesselValueUsd: 8_000_000,
    });
    // BC field remains hull-only
    expect(econ!.breakdown.warRiskPremium).toBe(warRisk.premiumUsd);
    // Full total is larger
    expect(econ!.breakdown.warRiskPremium).toBeLessThan(warRisk.breakdown!.totalPremiumUsd);
  });
});

describe('warRiskBallast — zone field asymmetry (A3)', () => {
  it('non-HRA openPosition: warRiskZonesBallast is [] (not undefined)', () => {
    const econ = buildMatchEconomics({ ...baseNonHRA, vesselOpenPosition: 'Rotterdam' });
    expect(econ).not.toBeNull();
    // warRiskZonesBallast is always set (to [] when no HRA)
    // warRiskBreakdownBallast is undefined when no HRA
    expect(econ!.breakdown.warRiskZonesBallast).toEqual([]);
    expect(econ!.breakdown.warRiskBreakdownBallast).toBeUndefined();
  });

  it('omitted openPosition: warRiskZonesBallast is still [] (from inline fallback)', () => {
    const econ = buildMatchEconomics(baseNonHRA);  // no openPosition
    // Inline fallback also has zones: []
    expect(econ!.breakdown.warRiskZonesBallast).toEqual([]);
    expect(econ!.breakdown.warRiskBreakdownBallast).toBeUndefined();
  });
});

describe('warRiskBallast — null/empty input edge cases (A4)', () => {
  it('empty string openPosition → no ballast premium (falsy guard)', () => {
    const econ = buildMatchEconomics({ ...baseNonHRA, vesselOpenPosition: '' });
    expect(econ!.breakdown.warRiskBreakdownBallast).toBeUndefined();
    expect(econ!.breakdown.warRiskTotalCombined).toBe(0);
  });

  it('null openPosition → no ballast premium', () => {
    const econ = buildMatchEconomics({ ...baseNonHRA, vesselOpenPosition: null });
    expect(econ!.breakdown.warRiskBreakdownBallast).toBeUndefined();
    expect(econ!.breakdown.warRiskTotalCombined).toBe(0);
  });

  it('HRA openPosition but null loadPort → no ballast premium (guard: openPos && loadPort)', () => {
    const econ = buildMatchEconomics({ ...baseNonHRA, loadPort: null, vesselOpenPosition: 'Hodeidah' });
    expect(econ!.breakdown.warRiskBreakdownBallast).toBeUndefined();
  });

  it('uppercase HRA port name in openPosition: HODEIDAH still triggers ballast premium', () => {
    const econ = buildMatchEconomics({ ...baseNonHRA, vesselOpenPosition: 'HODEIDAH' });
    expect(econ!.breakdown.warRiskBreakdownBallast).toBeDefined();
    expect(econ!.breakdown.warRiskBreakdownBallast!.totalPremiumUsd).toBeGreaterThan(0);
  });

  it('HRA port with extra context text: "Hodeidah, Yemen" triggers ballast premium', () => {
    const econ = buildMatchEconomics({ ...baseNonHRA, vesselOpenPosition: 'Hodeidah, Yemen' });
    expect(econ!.breakdown.warRiskBreakdownBallast).toBeDefined();
    expect(econ!.breakdown.warRiskBreakdownBallast!.totalPremiumUsd).toBeGreaterThan(0);
  });
});

describe('warRiskBallast — totalUsd consistency (A5)', () => {
  it('HRA ballast + no laden HRA: totalUsd = costs + ballast_full_total', () => {
    // Marmara→Veracruz: not HRA. Hodeidah→Marmara: Red Sea HRA
    const econ = buildMatchEconomics({
      cargoType: 'GRAIN',
      distanceNm: 5800,
      vesselDwt: 5328,
      quantityMt: 3000,
      speedKts: 11,
      consumptionMt: 14,
      loadPort: 'Marmara',
      dischargePort: 'Veracruz',
      calculatedAt: CALC_AT,
      vesselValueUsd: 22_000_000,
      vesselOpenPosition: 'Hodeidah',
    });
    expect(econ).not.toBeNull();
    const ballastTotal = econ!.breakdown.warRiskBreakdownBallast!.totalPremiumUsd;
    // warCombinedTotal should equal ballast total (laden is 0)
    expect(econ!.breakdown.warRiskTotalCombined).toBe(ballastTotal);
    // totalUsd must include the ballast total
    // If ballast = 0 (regression), totalUsd would be lower
    const econNoBallast = buildMatchEconomics({
      cargoType: 'GRAIN', distanceNm: 5800, vesselDwt: 5328, quantityMt: 3000,
      speedKts: 11, consumptionMt: 14, loadPort: 'Marmara', dischargePort: 'Veracruz',
      calculatedAt: CALC_AT, vesselValueUsd: 22_000_000,
    });
    expect(econ!.totalUsd).toBe(econNoBallast!.totalUsd + ballastTotal);
  });

  it('warRiskTotalCombined matches sum of individual breakdown.totalPremiumUsd values', () => {
    const econ = buildMatchEconomics({
      ...baseHRA,
      vesselOpenPosition: 'Hodeidah',  // ballast through Red Sea HRA
    });
    const ladenTotal = econ!.breakdown.warRiskBreakdownLaden!.totalPremiumUsd;
    const ballastTotal = econ!.breakdown.warRiskBreakdownBallast!.totalPremiumUsd;
    expect(econ!.breakdown.warRiskTotalCombined).toBe(ladenTotal + ballastTotal);
  });
});
