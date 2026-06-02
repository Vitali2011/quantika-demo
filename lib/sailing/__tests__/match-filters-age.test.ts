/**
 * TDD: checkVesselAge hard-filter gate.
 * Rule: block when cargoMaxVesselAgeYrs != null && vesselBuilt != null && refYear != null
 *       && (refYear - vesselBuilt) > cargoMaxVesselAgeYrs.
 * Conservative: any input null → pass.
 */

import { checkVesselAge } from '../match-filters';

describe('checkVesselAge', () => {
  it('blocks when vessel age exceeds limit (built 1996, limit 25, refYear 2026 → age 30)', () => {
    const r = checkVesselAge({ cargoMaxVesselAgeYrs: 25, vesselBuilt: 1996, refYear: 2026 });
    expect(r.pass).toBe(false);
    expect(r.reason).toMatch(/age/i);
    expect(r.reason).toContain('30');
    expect(r.reason).toContain('25');
  });

  it('passes when vessel age is within limit (built 2008, limit 25, refYear 2026 → age 18)', () => {
    const r = checkVesselAge({ cargoMaxVesselAgeYrs: 25, vesselBuilt: 2008, refYear: 2026 });
    expect(r.pass).toBe(true);
  });

  it('passes at exact limit (built 2001, limit 25, refYear 2026 → age 25)', () => {
    const r = checkVesselAge({ cargoMaxVesselAgeYrs: 25, vesselBuilt: 2001, refYear: 2026 });
    expect(r.pass).toBe(true);
  });

  it('conservative: vesselBuilt null → pass', () => {
    const r = checkVesselAge({ cargoMaxVesselAgeYrs: 25, vesselBuilt: null, refYear: 2026 });
    expect(r.pass).toBe(true);
  });

  it('conservative: cargoMaxVesselAgeYrs null → pass', () => {
    const r = checkVesselAge({ cargoMaxVesselAgeYrs: null, vesselBuilt: 1990, refYear: 2026 });
    expect(r.pass).toBe(true);
  });

  it('conservative: refYear null → pass', () => {
    const r = checkVesselAge({ cargoMaxVesselAgeYrs: 25, vesselBuilt: 1990, refYear: null });
    expect(r.pass).toBe(true);
  });

  it('conservative: all null → pass', () => {
    const r = checkVesselAge({ cargoMaxVesselAgeYrs: null, vesselBuilt: null, refYear: null });
    expect(r.pass).toBe(true);
  });
});
