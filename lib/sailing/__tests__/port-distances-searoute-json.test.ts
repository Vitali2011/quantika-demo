import { getPortDistance, _setSearouteJsonForTest } from '../port-distances';

afterEach(() => {
  // Reset injected map and env flag after each test
  _setSearouteJsonForTest(null);
  delete process.env.DISTANCE_USE_SEAROUTE_JSON;
});

describe('getPortDistance — tier 2 (searoute JSON)', () => {
  it('returns exact:true from JSON when pair is present', () => {
    // Durban|Rotterdam is not in the hand-curated matrix — tier 2 will be reached
    _setSearouteJsonForTest(new Map([['Durban|Rotterdam', 8888]]));
    const result = getPortDistance('Rotterdam', 'Durban');
    expect(result).toEqual({ nm: 8888, exact: true });
  });

  it('pair lookup is order-independent (reverse input order)', () => {
    _setSearouteJsonForTest(new Map([['Durban|Rotterdam', 8888]]));
    const result = getPortDistance('Durban', 'Rotterdam');
    expect(result).toEqual({ nm: 8888, exact: true });
  });

  it('tier 1 (DISTANCES_NM matrix) wins over tier 2 for known pairs', () => {
    // Istanbul|Karasu is in the hand-curated matrix at 95 nm.
    // Inject a different value in tier 2 — tier 1 must still win.
    _setSearouteJsonForTest(new Map([['Istanbul|Karasu', 9999]]));
    const result = getPortDistance('Istanbul', 'Karasu');
    // Matrix value is 95, not the injected 9999
    expect(result).toEqual({ nm: 95, exact: true });
  });

  it('tier 2 hit when pair is only in JSON (not in hand-curated matrix)', () => {
    // "Testville" is not a real port — it won't be in the matrix.
    // We inject it via the test hook to verify tier 2 is reached.
    // Use two known real ports that have no matrix entry between them.
    // Rotterdam→Durban is NOT in DISTANCES_NM (only Rotterdam→Hamburg etc.).
    // So tier 2 should be reached if we inject it.
    _setSearouteJsonForTest(new Map([['Durban|Rotterdam', 9500]]));
    const result = getPortDistance('Rotterdam', 'Durban');
    expect(result).toEqual({ nm: 9500, exact: true });
  });

  it('falls through to haversine when pair is not in JSON', () => {
    // Inject an empty map — no tier 2 hits
    _setSearouteJsonForTest(new Map());
    // Rotterdam→Hamburg is in DISTANCES_NM at 470 nm, so it won't reach haversine.
    // Use a pair with no matrix entry and no JSON entry → haversine fallback (exact: false).
    const result = getPortDistance('Rotterdam', 'Durban');
    // Haversine Rotterdam→Durban ≈ 6700 nm great-circle (not exact)
    expect(result).not.toBeNull();
    expect(result!.exact).toBe(false);
    expect(result!.nm).toBeGreaterThan(5000);
  });

  it('DISTANCE_USE_SEAROUTE_JSON=false skips tier 2 entirely', () => {
    process.env.DISTANCE_USE_SEAROUTE_JSON = 'false';
    _setSearouteJsonForTest(new Map([['Durban|Rotterdam', 9500]]));
    // Tier 2 disabled → haversine fallback (exact: false)
    const result = getPortDistance('Rotterdam', 'Durban');
    expect(result).not.toBeNull();
    expect(result!.exact).toBe(false);
  });

  it('returns null when both tier 1 and tier 2 miss and port not in port-master', () => {
    _setSearouteJsonForTest(new Map());
    // "UnknownPortXYZ" will not resolve via normalizePortName
    const result = getPortDistance('UnknownPortXYZ', 'Rotterdam');
    expect(result).toBeNull();
  });
});
