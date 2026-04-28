import { assessShadowFleetRisk } from '../shadow-fleet';
import type { VesselData } from '../shadow-fleet';

function baseVessel(): VesselData {
  return {
    flagChanges12m: 0,
    classSocietyChanges24m: 0,
    ownerJurisdiction: 'Norway',
    flag: 'Norway',
    piClub: 'Gard',
    aisBlackoutDays: 0,
    vesselAge: 5,
    classSociety: 'DNV',
    namesLast24m: 1,
    isIacsClass: true,
    isPiIgClub: true,
  };
}

describe('assessShadowFleetRisk', () => {
  it('returns none for a clean vessel', () => {
    const result = assessShadowFleetRisk(baseVessel());
    expect(result.riskLevel).toBe('none');
    expect(result.flags).toHaveLength(0);
  });

  it('flags excessive flag changes (≥3 in 12 months)', () => {
    const result = assessShadowFleetRisk({ ...baseVessel(), flagChanges12m: 3 });
    expect(result.flags).toContain('FLAG_CHANGES_EXCESSIVE');
  });

  it('does not flag 2 flag changes', () => {
    const result = assessShadowFleetRisk({ ...baseVessel(), flagChanges12m: 2 });
    expect(result.flags).not.toContain('FLAG_CHANGES_EXCESSIVE');
  });

  it('flags excessive class society changes (≥2 in 24 months)', () => {
    const result = assessShadowFleetRisk({ ...baseVessel(), classSocietyChanges24m: 2 });
    expect(result.flags).toContain('CLASS_CHANGES_EXCESSIVE');
  });

  it('flags high-risk ownership combo (Marshall Islands shell + Comoros flag)', () => {
    const result = assessShadowFleetRisk({
      ...baseVessel(),
      ownerJurisdiction: 'Marshall Islands',
      flag: 'Comoros',
    });
    expect(result.flags).toContain('HIGH_RISK_OWNERSHIP_COMBO');
  });

  it('flags non-IG P&I cover', () => {
    const result = assessShadowFleetRisk({ ...baseVessel(), isPiIgClub: false, piClub: 'Unknown Insurer' });
    expect(result.flags).toContain('NON_IG_PI_COVER');
  });

  it('flags AIS dark periods > 30 days', () => {
    const result = assessShadowFleetRisk({ ...baseVessel(), aisBlackoutDays: 31 });
    expect(result.flags).toContain('AIS_DARK_PERIOD');
  });

  it('does not flag AIS dark periods ≤ 30 days', () => {
    const result = assessShadowFleetRisk({ ...baseVessel(), aisBlackoutDays: 30 });
    expect(result.flags).not.toContain('AIS_DARK_PERIOD');
  });

  it('flags old vessel with non-IACS class', () => {
    const result = assessShadowFleetRisk({ ...baseVessel(), vesselAge: 21, isIacsClass: false });
    expect(result.flags).toContain('OLD_NON_IACS');
  });

  it('does not flag old vessel with IACS class', () => {
    const result = assessShadowFleetRisk({ ...baseVessel(), vesselAge: 25, isIacsClass: true });
    expect(result.flags).not.toContain('OLD_NON_IACS');
  });

  it('flags recent IMO renaming (2+ names in 24 months)', () => {
    const result = assessShadowFleetRisk({ ...baseVessel(), namesLast24m: 2 });
    expect(result.flags).toContain('RECENT_RENAMING');
  });

  it('returns medium risk for 1–2 flags', () => {
    const result = assessShadowFleetRisk({ ...baseVessel(), flagChanges12m: 3 });
    expect(result.riskLevel).toBe('medium');
  });

  it('returns medium risk for 2 flags', () => {
    const result = assessShadowFleetRisk({
      ...baseVessel(),
      flagChanges12m: 3,
      classSocietyChanges24m: 2,
    });
    expect(result.riskLevel).toBe('medium');
  });

  it('returns high risk for 3+ flags', () => {
    const result = assessShadowFleetRisk({
      ...baseVessel(),
      flagChanges12m: 3,
      classSocietyChanges24m: 2,
      isPiIgClub: false,
    });
    expect(result.riskLevel).toBe('high');
    expect(result.flags.length).toBeGreaterThanOrEqual(3);
  });
});
