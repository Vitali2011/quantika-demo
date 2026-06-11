/**
 * TDD tests — viaCanal:'suez' threading in buildMatchEconomics.
 * Stage 3 of war-risk-v2: Suez-transit detection for laden+ballast legs.
 */

import { buildMatchEconomics } from '@/lib/matching/tce-calculator';

describe('buildMatchEconomics — Suez-transit war-risk threading', () => {
  const baseInput = {
    cargoType: 'GRAIN',
    distanceNm: 6200,
    vesselDwt: 32000,
    quantityMt: 28000,
    speedKts: 13,
    consumptionMt: 22,
    calculatedAt: '2026-06-11T00:00:00.000Z',
    vesselValueUsd: 20_000_000,
  };

  // Test 1 — PI2 behavioral test: Med→East-of-Suez non-HRA discharge
  // Aliağa (Turkey, Aegean) → Kolkata (India). viaSuez = true.
  // Neither port is an HRA port by keyword, but Suez transit triggers red-sea-hra.
  it('Aliaga→Kolkata via Suez: laden war-risk triggered by viaCanal:suez', () => {
    const econ = buildMatchEconomics({
      ...baseInput,
      loadPort: 'Aliaga',
      dischargePort: 'Kolkata',
    });
    expect(econ).not.toBeNull();
    // Laden leg transits Suez → red-sea-hra applies
    expect(econ!.breakdown.warRiskBreakdownLaden).toBeDefined();
    expect(econ!.breakdown.warRiskBreakdownLaden!.hullPremiumUsd).toBeGreaterThan(0);
    expect(econ!.breakdown.warRiskPremium).toBeGreaterThan(0);
  });

  // Test 2 — Non-Suez route: Rotterdam → Santos (Brazil)
  // Neither port is HRA, no Suez transit → zero war risk.
  it('Rotterdam→Santos: no Suez transit, no HRA → zero war risk', () => {
    const econ = buildMatchEconomics({
      ...baseInput,
      loadPort: 'Rotterdam',
      dischargePort: 'Santos',
    });
    expect(econ).not.toBeNull();
    expect(econ!.breakdown.warRiskPremium).toBe(0);
    expect(econ!.breakdown.warRiskTotalCombined).toBe(0);
  });

  // Test 3 — Berbera (HRA port keyword) route — regression test: keyword still triggers
  it('Berbera→Rotterdam: HRA keyword still triggers laden war-risk (no regression)', () => {
    const econ = buildMatchEconomics({
      ...baseInput,
      loadPort: 'Berbera',
      dischargePort: 'Rotterdam',
    });
    expect(econ).not.toBeNull();
    expect(econ!.breakdown.warRiskBreakdownLaden).toBeDefined();
    expect(econ!.breakdown.warRiskBreakdownLaden!.hullPremiumUsd).toBeGreaterThan(0);
  });

  // Test 4 — Ballast Suez transit: Hamburg→Kolkata (ballast) transits Suez.
  // Hamburg = atlantic (westOfSuez), Kolkata = indian (eastOfSuez) → ballast transits Suez.
  // Jeddah (HRA) is the discharge port — ensures laden also has war risk.
  it('Hamburg open → Kolkata load → Rotterdam discharge: ballast Suez transit defined', () => {
    const econ = buildMatchEconomics({
      ...baseInput,
      loadPort: 'Kolkata',
      dischargePort: 'Rotterdam',
      vesselOpenPosition: 'Hamburg',
      ballastDistanceNm: 8400,
    });
    expect(econ).not.toBeNull();
    // Ballast leg Hamburg→Kolkata transits Suez → ballast breakdown defined via viaCanal
    expect(econ!.breakdown.warRiskBreakdownBallast).toBeDefined();
  });
});
