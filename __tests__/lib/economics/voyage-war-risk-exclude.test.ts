/**
 * PI2 behavioral — excludeWarRiskFromDailyTce flag (Fix C, #fix-list-vs-detail).
 *
 * When the flag is set:
 *  - daily_tce_usd excludes war-risk premium (matches stored TCE which uses empty ports → $0)
 *  - breakdown.war_risk_usd is still reported (breakdown line unchanged)
 *  - total_costs_usd still includes war-risk (so total is accurate)
 *
 * Parity acceptance: real-port TCE with flag ON equals empty-port TCE.
 */
import { calculateTCE } from '@/lib/economics/voyage-calculator';
import type { VoyageInput } from '@/lib/economics/voyage-calculator';

const BASE_INPUT: VoyageInput = {
  vessel: { dwt: 44000, valueUsd: 22_000_000, speedKts: 12, consumptionMtPerDay: 25 },
  route: { originPort: '', destinationPort: '', distanceNm: 254 },
  cargo: { quantityMt: 35000, freightRateUsdPerMt: 22 },
  bunkerPriceUsdPerMt: 600,
  euaPriceEur: 65,
  durationDays: 3,
};

const HRA_INPUT: VoyageInput = {
  ...BASE_INPUT,
  route: { originPort: 'Marmara', destinationPort: 'Constanta', distanceNm: 254 },
};

describe('excludeWarRiskFromDailyTce flag (Fix C)', () => {
  test('war_risk_usd still > 0 in breakdown when flag is set with real HRA ports', () => {
    const result = calculateTCE({ ...HRA_INPUT, excludeWarRiskFromDailyTce: true });
    expect(result.breakdown.war_risk_usd).toBeGreaterThan(0);
    expect(result.breakdown.applicable.war_risk).toBe(true);
  });

  test('daily_tce_usd with real ports + flag ON equals daily_tce_usd with empty ports (no flag)', () => {
    const withFlag = calculateTCE({ ...HRA_INPUT, excludeWarRiskFromDailyTce: true });
    const emptyPorts = calculateTCE({ ...BASE_INPUT });
    expect(withFlag.daily_tce_usd).toBe(emptyPorts.daily_tce_usd);
  });

  test('without flag, real ports depresses daily_tce_usd vs empty ports', () => {
    const withoutFlag = calculateTCE({ ...HRA_INPUT });
    const emptyPorts = calculateTCE({ ...BASE_INPUT });
    expect(withoutFlag.daily_tce_usd).toBeLessThan(emptyPorts.daily_tce_usd);
  });

  test('total_costs_usd includes war_risk_usd regardless of flag', () => {
    const result = calculateTCE({ ...HRA_INPUT, excludeWarRiskFromDailyTce: true });
    const { bunker_usd, canal_usd, da_usd, war_risk_usd, ets_usd, total_costs_usd } = result.breakdown;
    expect(total_costs_usd).toBe(bunker_usd + canal_usd + da_usd + war_risk_usd + ets_usd);
  });

  test('flag=false produces same result as omitting the flag', () => {
    const withFalse = calculateTCE({ ...HRA_INPUT, excludeWarRiskFromDailyTce: false });
    const withOmit = calculateTCE({ ...HRA_INPUT });
    expect(withFalse.daily_tce_usd).toBe(withOmit.daily_tce_usd);
    expect(withFalse.breakdown.war_risk_usd).toBe(withOmit.breakdown.war_risk_usd);
  });
});
