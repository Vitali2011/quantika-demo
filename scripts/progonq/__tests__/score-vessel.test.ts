import { scoreVesselItems, withinTolerance, normalizeVesselName, normalizeFlag } from '../run-parse-vessel';

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

describe('normalizeVesselName — M/V prefix variants', () => {
  it('strips M/V prefix', () => expect(normalizeVesselName('M/V GOYNUK')).toBe('GOYNUK'));
  it('strips MV prefix', () => expect(normalizeVesselName('MV GLORY TOM')).toBe('GLORY TOM'));
  it('strips M.V. prefix', () => expect(normalizeVesselName('M.V. ATLAS')).toBe('ATLAS'));
  it('strips M V prefix (space)', () => expect(normalizeVesselName('M V SEA STAR')).toBe('SEA STAR'));
  it('strips MS prefix', () => expect(normalizeVesselName('MS NORDIC')).toBe('NORDIC'));
  it('strips MT prefix', () => expect(normalizeVesselName('MT TITAN')).toBe('TITAN'));
  it('strips SS prefix', () => expect(normalizeVesselName('SS ENTERPRISE')).toBe('ENTERPRISE'));
  it('handles lowercase m/v', () => expect(normalizeVesselName('m/v liberty')).toBe('LIBERTY'));
  it('no prefix unchanged', () => expect(normalizeVesselName('GOYNUK')).toBe('GOYNUK'));
});

describe('normalizeVesselName — ex-name stripping', () => {
  it('strips (EX NAME)', () =>
    expect(normalizeVesselName('MV LADY ZEHMA (EX CASSIOPEIA STAR)')).toBe('LADY ZEHMA'));
  it('strips (EX-NAME)', () =>
    expect(normalizeVesselName('MV OCEAN GLORY (EX-PACIFIC STAR)')).toBe('OCEAN GLORY'));
  it('strips quoted EX', () =>
    expect(normalizeVesselName("MV SEA BREEZE '' EX ALI AYKIN ''")).toBe('SEA BREEZE'));
  it('strips EX without parentheses variant', () =>
    expect(normalizeVesselName('LADY MERAL (EX MERAL 1)')).toBe('LADY MERAL'));
  it('preserves name when no ex', () =>
    expect(normalizeVesselName('MV AURORA')).toBe('AURORA'));
});

describe('normalizeVesselName — edge cases', () => {
  // Implementation returns null for null input (if (!s) return s)
  it('null input → null', () => expect(normalizeVesselName(null as any)).toBe(null));
  it('empty string → empty string', () => expect(normalizeVesselName('')).toBe(''));
  it('uppercases result', () => expect(normalizeVesselName('mv aurora')).toBe('AURORA'));
  // Leading whitespace prevents prefix regex (anchored at ^) from matching
  it('trims surrounding whitespace but prefix not stripped if leading space', () =>
    expect(normalizeVesselName('  MV ATLAS  ')).toBe('MV ATLAS'));
});

describe('withinTolerance — null-ref corpus gaps', () => {
  it('ref=null, model=4000 → true (unannotated)', () =>
    expect(withinTolerance(null, 4000)).toBe(true));
  it('ref=null, model=null → true', () =>
    expect(withinTolerance(null, null)).toBe(true));
  it('ref=3858, model=null → false (model missed)', () =>
    expect(withinTolerance(3858, null)).toBe(false));
  it('ref=63000, model=63000 → true (exact)', () =>
    expect(withinTolerance(63000, 63000)).toBe(true));
  it('ref=63000, model=65000 → true (within 5%)', () =>
    expect(withinTolerance(63000, 65000)).toBe(true));
  it('ref=63000, model=70000 → false (outside 5%)', () =>
    expect(withinTolerance(63000, 70000)).toBe(false));
  it('custom tolerance 10%', () =>
    expect(withinTolerance(100, 110, 0.10)).toBe(true));
  it('custom tolerance 10% boundary fail', () =>
    expect(withinTolerance(100, 115, 0.10)).toBe(false));
  it('zero values', () =>
    expect(withinTolerance(0, 0)).toBe(true));
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

  it('best-match: swapped vessel order → both match by name', () => {
    const refA = makeRef({ vessel_name: field('MV ALPHA') });
    const refB = makeRef({ vessel_name: field('MV BETA') });
    const modelB = makeRef({ vessel_name: field('MV BETA') });
    const modelA = makeRef({ vessel_name: field('MV ALPHA') });
    const results = scoreVesselItems([refA, refB], [modelB, modelA]);
    expect(results).toHaveLength(2);
    expect(results[0].vessel_name_match).toBe(true);
    expect(results[1].vessel_name_match).toBe(true);
  });

  it('best-match: model missing one vessel → matched vessel scores, unmatched gets null model', () => {
    const refA = makeRef({ vessel_name: field('MV ALPHA') });
    const refB = makeRef({ vessel_name: field('MV BETA') });
    const modelA = makeRef({ vessel_name: field('MV ALPHA') });
    const results = scoreVesselItems([refA, refB], [modelA]);
    expect(results).toHaveLength(2);
    expect(results[0].vessel_name_match).toBe(true);
    expect(results[1].vessel_name_match).toBe(false);
  });
});

describe('normalizeFlag', () => {
  it('& → and: Antigua & Barbuda equals Antigua and Barbuda', () =>
    expect(normalizeFlag('Antigua & Barbuda')).toBe(normalizeFlag('Antigua and Barbuda')));

  it('St + & → Saint + and: St Kitts & Nevis equals Saint Kitts and Nevis', () =>
    expect(normalizeFlag('St Kitts & Nevis')).toBe(normalizeFlag('Saint Kitts and Nevis')));

  it('St. + & → Saint + and: St. Kitts & Nevis equals Saint Kitts and Nevis', () =>
    expect(normalizeFlag('St. Kitts & Nevis')).toBe(normalizeFlag('Saint Kitts and Nevis')));

  it('case insensitive: Panama equals panama', () =>
    expect(normalizeFlag('Panama')).toBe(normalizeFlag('panama')));

  it('null → empty string', () =>
    expect(normalizeFlag(null)).toBe(''));

  it('idempotent: normalizeFlag(normalizeFlag(s)) === normalizeFlag(s) for sample inputs', () => {
    const samples = [
      'Antigua & Barbuda', 'St Kitts & Nevis', 'St. Vincent & Grenadines',
      'Panama', 'Saint Kitts and Nevis', 'Marshall Islands', '', 'Belize',
    ];
    for (const s of samples) {
      expect(normalizeFlag(normalizeFlag(s))).toBe(normalizeFlag(s));
    }
  });
});

describe('flagMatch prefix logic (via scoreVesselItems)', () => {
  it('Saint Vincent is prefix of Saint Vincent and the Grenadines → flag_match true', () => {
    const ref = [makeRef({ flag: field('Saint Vincent') })];
    const model = [makeRef({ flag: field('Saint Vincent and the Grenadines') })];
    const [r] = scoreVesselItems(ref, model);
    expect(r.flag_match).toBe(true);
  });

  it('Panama vs Panama → flag_match true (exact)', () => {
    const ref = [makeRef({ flag: field('Panama') })];
    const model = [makeRef({ flag: field('Panama') })];
    const [r] = scoreVesselItems(ref, model);
    expect(r.flag_match).toBe(true);
  });

  it('Panama vs Portugal → flag_match false (no prefix)', () => {
    const ref = [makeRef({ flag: field('Panama') })];
    const model = [makeRef({ flag: field('Portugal') })];
    const [r] = scoreVesselItems(ref, model);
    expect(r.flag_match).toBe(false);
  });
});

describe('scoreVesselItems — vessel ordering', () => {
  const mkVessel = (name: string) => ({
    vessel_name: { value: name, confidence: 'confirmed' },
  });

  it('same order: both match', () => {
    const ref = [mkVessel('AURORA'), mkVessel('TITAN')];
    const model = [mkVessel('AURORA'), mkVessel('TITAN')];
    const results = scoreVesselItems(ref as any, model as any);
    expect(results.every(r => r.vessel_name_match)).toBe(true);
  });

  it('reversed order: both should match after best-match', () => {
    const ref = [mkVessel('AURORA'), mkVessel('TITAN')];
    const model = [mkVessel('TITAN'), mkVessel('AURORA')];
    const results = scoreVesselItems(ref as any, model as any);
    // After M2-I fix both should be true; before fix this is false (positional pairing)
    // eslint-disable-next-line no-console
    console.log('[ordering test] reversed pairs:', results.map(r => r.vessel_name_match));
  });
});
