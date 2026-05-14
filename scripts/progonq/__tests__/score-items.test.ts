import { scoreItems, normalizePort } from '../run-parse-cargo';

function makeItem(
  origin: string | null,
  dest: string | null,
  weight: number | null = null,
  commodity: string | null = null,
  extras: Record<string, unknown> = {}
) {
  return {
    origin_port: origin ? { value: origin, confidence: 'confirmed' } : null,
    destination_port: dest ? { value: dest, confidence: 'confirmed' } : null,
    weight_mt: weight !== null ? { value: weight, confidence: 'confirmed' } : null,
    cargo_description: commodity ? { value: commodity, confidence: 'confirmed' } : null,
    ...extras,
  };
}

describe('normalizePort', () => {
  it('returns null for null/empty', () => {
    expect(normalizePort(null)).toBeNull();
    expect(normalizePort('')).toBeNull();
    expect(normalizePort(undefined)).toBeNull();
  });

  it('strips diacritics', () => {
    expect(normalizePort('Constanța')).toBe('constanta');
  });

  it('strips port prefix but not port of call', () => {
    expect(normalizePort('Port Sousse')).toBe('sousse');
    expect(normalizePort('Port of Call')).toBe('port of call');
  });

  it('folds special base letters (dotless i, slashed o, stroked l)', () => {
    expect(normalizePort('BANDIRMA')).toBe(normalizePort('Bandırma'));
    expect(normalizePort('Bandırma')).toBe('bandirma');
    expect(normalizePort('Gdańsk')).toBe('gdansk');
    expect(normalizePort('Bjørnafjorden')).toBe('bjornafjorden');
    expect(normalizePort('Świnoujście')).toBe('swinoujscie');
  });

  it('does NOT fuzzy-match genuine typos', () => {
    expect(normalizePort('Alexandroupolis')).not.toBe(normalizePort('Aleaxandroupolis'));
    expect(normalizePort('Douala')).not.toBe(normalizePort('Duala'));
  });
});

describe('scoreItems — backward compat (single port)', () => {
  it('matches when both sides have same origin and destination', () => {
    const ref = [makeItem('Hamburg', 'Rotterdam', 10000, 'steel')];
    const model = [makeItem('Hamburg', 'Rotterdam', 10000, 'steel')];
    const [r] = scoreItems(ref, model);
    expect(r.route_match).toBe(true);
    expect(r.weight_match).toBe(true);
  });

  it('does not match when destinations differ', () => {
    const ref = [makeItem('Hamburg', 'Rotterdam')];
    const model = [makeItem('Hamburg', 'Antwerp')];
    const [r] = scoreItems(ref, model);
    expect(r.route_match).toBe(false);
  });

  it('handles item count mismatch (ref has more)', () => {
    const ref = [makeItem('A', 'B'), makeItem('C', 'D')];
    const model = [makeItem('A', 'B')];
    const results = scoreItems(ref, model);
    expect(results).toHaveLength(2);
    expect(results[0].route_match).toBe(true);
    expect(results[1].route_match).toBe(false);
  });
});

describe('scoreItems — alternatives set comparison', () => {
  it('matches when alternatives sets are equal regardless of which is primary', () => {
    const ref = [makeItem('El Arish', 'Port of Call', 16000, 'salt', {
      origin_port_alternatives: ['El Dekheila'],
    })];
    const model = [makeItem('El Arish', 'Port of Call', 16000, 'salt', {
      origin_port_alternatives: ['El Dekheila'],
    })];
    const [r] = scoreItems(ref, model);
    expect(r.route_match).toBe(true);
    expect(r.origin_alts_match).toBe(true);
  });

  it('matches when model swaps primary and alternative (same universe)', () => {
    const ref = [makeItem('El Arish', 'Port of Call', null, 'salt', {
      origin_port_alternatives: ['El Dekheila'],
    })];
    // Model names El Dekheila as primary, El Arish as alternative — same universe
    const model = [makeItem('El Dekheila', 'Port of Call', null, 'salt', {
      origin_port_alternatives: ['El Arish'],
    })];
    const [r] = scoreItems(ref, model);
    expect(r.route_match).toBe(true);
  });

  it('does not match when model alternative universe differs', () => {
    const ref = [makeItem('El Arish', 'Port of Call', null, 'salt', {
      origin_port_alternatives: ['El Dekheila'],
    })];
    const model = [makeItem('El Arish', 'Port of Call', null, 'salt', {
      origin_port_alternatives: ['Alexandria'],
    })];
    const [r] = scoreItems(ref, model);
    expect(r.route_match).toBe(false);
  });
});

describe('scoreItems — rotation set comparison', () => {
  it('matches when rotation sets are equal', () => {
    const ref = [makeItem('Kandla', 'Banjul', 40000, 'rice', {
      destination_port_rotation: ['Banjul', 'Dakar'],
      weight_per_port: [10000, 30000],
    })];
    const model = [makeItem('Kandla', 'Banjul', 40000, 'rice', {
      destination_port_rotation: ['Banjul', 'Dakar'],
      weight_per_port: [10000, 30000],
    })];
    const [r] = scoreItems(ref, model);
    expect(r.route_match).toBe(true);
    expect(r.dest_rotation_match).toBe(true);
    expect(r.weight_per_port_match).toBe(true);
  });

  it('does not match when rotation sets differ', () => {
    const ref = [makeItem('Kandla', 'Banjul', null, 'rice', {
      destination_port_rotation: ['Banjul', 'Dakar'],
    })];
    const model = [makeItem('Kandla', 'Banjul', null, 'rice', {
      destination_port_rotation: ['Banjul', 'Lagos'],
    })];
    const [r] = scoreItems(ref, model);
    expect(r.route_match).toBe(false);
    expect(r.dest_rotation_match).toBe(false);
  });

  it('matches weight_per_port under canonical (port-sorted) ordering', () => {
    // ref: Banjul→10k, Dakar→30k
    const ref = [makeItem('Kandla', 'Banjul', 40000, 'rice', {
      destination_port_rotation: ['Banjul', 'Dakar'],
      weight_per_port: [10000, 30000],
    })];
    // model: Dakar→30k, Banjul→10k (reversed order — same canonical pairs)
    const model = [makeItem('Kandla', 'Dakar', 40000, 'rice', {
      destination_port_rotation: ['Dakar', 'Banjul'],
      weight_per_port: [30000, 10000],
    })];
    const [r] = scoreItems(ref, model);
    expect(r.dest_rotation_match).toBe(true);
    expect(r.weight_per_port_match).toBe(true);
    expect(r.route_match).toBe(true);
  });
});

describe('scoreItems — raw-values fields', () => {
  it('stores raw (un-normalized) strings for ref and model', () => {
    const ref = [makeItem('Port of Call, Ukraine', 'Hereke', null, 'steel')];
    const model = [makeItem('Ukraine port (unspecified)', 'Hereke', null, 'steel')];
    const [r] = scoreItems(ref, model);
    // Raw strings are preserved
    expect(r.ref_origin_raw).toBe('Port of Call, Ukraine');
    expect(r.model_origin_raw).toBe('Ukraine port (unspecified)');
    // Normalized differ → route_match=false at string level (judge handles equivalence)
    expect(r.route_match).toBe(false);
  });
});
