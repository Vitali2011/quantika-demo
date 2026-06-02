/**
 * TDD: checkVesselDimensions hard-filter gate.
 * Rule: block when cargoMaxBeamM != null && vesselBeam != null && vesselBeam > cargoMaxBeamM.
 *       Same for LOA. Conservative: any input null → pass.
 */

import { checkVesselDimensions } from '../match-filters';

describe('checkVesselDimensions — beam', () => {
  it('blocks when vesselBeam exceeds cargoMaxBeamM (29m vs 16m limit)', () => {
    const r = checkVesselDimensions({ vesselBeam: 29, vesselLoa: null, cargoMaxBeamM: 16, cargoMaxLoaM: null });
    expect(r.pass).toBe(false);
    expect(r.reason).toMatch(/beam/i);
    expect(r.reason).toContain('29');
    expect(r.reason).toContain('16');
  });

  it('passes when vesselBeam within limit (15m vs 16m limit)', () => {
    const r = checkVesselDimensions({ vesselBeam: 15, vesselLoa: null, cargoMaxBeamM: 16, cargoMaxLoaM: null });
    expect(r.pass).toBe(true);
  });

  it('passes at exact limit (16m vs 16m limit)', () => {
    const r = checkVesselDimensions({ vesselBeam: 16, vesselLoa: null, cargoMaxBeamM: 16, cargoMaxLoaM: null });
    expect(r.pass).toBe(true);
  });

  it('conservative: vesselBeam null → pass', () => {
    const r = checkVesselDimensions({ vesselBeam: null, vesselLoa: null, cargoMaxBeamM: 16, cargoMaxLoaM: null });
    expect(r.pass).toBe(true);
  });

  it('conservative: cargoMaxBeamM null → pass', () => {
    const r = checkVesselDimensions({ vesselBeam: 29, vesselLoa: null, cargoMaxBeamM: null, cargoMaxLoaM: null });
    expect(r.pass).toBe(true);
  });
});

describe('checkVesselDimensions — LOA', () => {
  it('blocks when vesselLoa exceeds cargoMaxLoaM (160m vs 145m limit)', () => {
    const r = checkVesselDimensions({ vesselBeam: null, vesselLoa: 160, cargoMaxBeamM: null, cargoMaxLoaM: 145 });
    expect(r.pass).toBe(false);
    expect(r.reason).toMatch(/loa|length/i);
    expect(r.reason).toContain('160');
    expect(r.reason).toContain('145');
  });

  it('passes when vesselLoa within limit (140m vs 145m limit)', () => {
    const r = checkVesselDimensions({ vesselBeam: null, vesselLoa: 140, cargoMaxBeamM: null, cargoMaxLoaM: 145 });
    expect(r.pass).toBe(true);
  });

  it('conservative: vesselLoa null → pass', () => {
    const r = checkVesselDimensions({ vesselBeam: null, vesselLoa: null, cargoMaxBeamM: null, cargoMaxLoaM: 145 });
    expect(r.pass).toBe(true);
  });

  it('conservative: cargoMaxLoaM null → pass', () => {
    const r = checkVesselDimensions({ vesselBeam: null, vesselLoa: 200, cargoMaxBeamM: null, cargoMaxLoaM: null });
    expect(r.pass).toBe(true);
  });
});

describe('checkVesselDimensions — both beam and LOA', () => {
  it('blocks on beam violation even when LOA passes', () => {
    const r = checkVesselDimensions({ vesselBeam: 29, vesselLoa: 130, cargoMaxBeamM: 16, cargoMaxLoaM: 145 });
    expect(r.pass).toBe(false);
    expect(r.reason).toMatch(/beam/i);
  });

  it('blocks on LOA violation even when beam passes', () => {
    const r = checkVesselDimensions({ vesselBeam: 14, vesselLoa: 160, cargoMaxBeamM: 16, cargoMaxLoaM: 145 });
    expect(r.pass).toBe(false);
    expect(r.reason).toMatch(/loa|length/i);
  });

  it('conservative: all null → pass', () => {
    const r = checkVesselDimensions({ vesselBeam: null, vesselLoa: null, cargoMaxBeamM: null, cargoMaxLoaM: null });
    expect(r.pass).toBe(true);
  });
});
