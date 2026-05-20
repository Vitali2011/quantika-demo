import { scoreVesselItems, withinTolerance, normalizeVesselName } from '../run-parse-vessel';

function field<T>(value: T | null): { value: T; confidence: string } | null {
  return value === null ? null : { value, confidence: 'confirmed' };
}

function makeRef(overrides: Record<string, unknown> = {}) {
  return {
    vessel_name: field('MV STAD'),
    imo: null,
    flag: field('Vanuatu'),
    built: field(1989),
    dwt_summer: field(3222),
    dwcc: field(3050),
    open_position: field('Teignmouth, UK'),
    open_date: field({ open: '2017-07-25', close: '2017-07-28' }),
    ...overrides,
  };
}

describe('normalizeVesselName', () => {
  it('strips M/V prefix with slash', () => expect(normalizeVesselName('M/V GOYNUK')).toBe('GOYNUK'));
  it('strips ex-name in parentheses', () => expect(normalizeVesselName('MV LADY ZEHMA (EX CASSIOPEIA STAR)')).toBe('LADY ZEHMA'));
  it('strips quoted ex-name', () => expect(normalizeVesselName("MV ALI (EX-STAR)")).toBe('ALI'));
});

describe('withinTolerance (numeric ±5%)', () => {
  it('exact match → true', () => expect(withinTolerance(3000, 3000)).toBe(true));
  it('within 5% → true', () => expect(withinTolerance(3000, 3140)).toBe(true));
  it('outside 5% → false', () => expect(withinTolerance(3000, 3200)).toBe(false));
  it('both null → true', () => expect(withinTolerance(null, null)).toBe(true));
  it('ref null (unannotated) → true', () => expect(withinTolerance(null, 4000)).toBe(true));
  it('ref has value, model null → false', () => expect(withinTolerance(3858, null)).toBe(false));
  it('model null, ref not null → false', () => expect(withinTolerance(100, null)).toBe(false));
});

describe('scoreVesselItems', () => {
  it('exact match: all deterministic fields true', () => {
    const ref = [makeRef()];
    const model = [makeRef()];
    const [r] = scoreVesselItems(ref, model);
    expect(r.imo_match).toBe(true);
    expect(r.flag_match).toBe(true);
    expect(r.built_match).toBe(true);
    expect(r.dwt_match).toBe(true);
    expect(r.dwcc_match).toBe(true);
  });

  it('dwt within 5% tolerance → match', () => {
    const ref = [makeRef({ dwt_summer: field(3000) })];
    const model = [makeRef({ dwt_summer: field(3140) })];
    const [r] = scoreVesselItems(ref, model);
    expect(r.dwt_match).toBe(true);
  });

  it('built year mismatch → false', () => {
    const ref = [makeRef({ built: field(1989) })];
    const model = [makeRef({ built: field(1990) })];
    const [r] = scoreVesselItems(ref, model);
    expect(r.built_match).toBe(false);
  });

  it('preserves raw vessel_name / open_position / open_date for judge', () => {
    const ref = [makeRef()];
    const model = [makeRef({ vessel_name: field('M.V. STAD') })];
    const [r] = scoreVesselItems(ref, model);
    expect(r.ref_vessel_name).toBe('MV STAD');
    expect(r.model_vessel_name).toBe('M.V. STAD');
    expect(r.ref_open_position).toBe('Teignmouth, UK');
  });

  it('handles item count mismatch', () => {
    const ref = [makeRef(), makeRef()];
    const model = [makeRef()];
    const results = scoreVesselItems(ref, model);
    expect(results).toHaveLength(2);
    expect(results[1].dwt_match).toBe(false);
  });

  it('both 0-items → empty list (caller handles)', () => {
    expect(scoreVesselItems([], [])).toEqual([]);
  });
});
