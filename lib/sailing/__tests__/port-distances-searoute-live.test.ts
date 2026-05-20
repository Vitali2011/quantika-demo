import {
  getPortDistance,
  _setSearouteJsonForTest,
  _setLiveSearouteForTest,
} from '../port-distances';
import {
  computeSearouteCached,
  _clearCacheForTest,
  _setSeaRouteLibForTest,
} from '../searoute-client';

afterEach(() => {
  _setSearouteJsonForTest(null);
  _setLiveSearouteForTest(null);
  delete process.env.DISTANCE_USE_SEAROUTE_LIVE;
  _clearCacheForTest();
  _setSeaRouteLibForTest(null);
});

describe('getPortDistance — tier 3 (on-the-fly searoute)', () => {
  it('returns exact:true when pair is not in matrix or JSON but searoute computes', () => {
    // Rotterdam|Durban is not in tier-1 matrix; empty map disables tier 2
    _setSearouteJsonForTest(new Map());
    _setLiveSearouteForTest(() => ({ nm: 9123 }));
    expect(getPortDistance('Rotterdam', 'Durban')).toEqual({ nm: 9123, exact: true });
  });

  it('lookup is order-independent (reverse input order)', () => {
    _setSearouteJsonForTest(new Map());
    _setLiveSearouteForTest(() => ({ nm: 9123 }));
    expect(getPortDistance('Durban', 'Rotterdam')).toEqual({ nm: 9123, exact: true });
  });

  it('tier 1 still wins over tier 3 for matrix pairs', () => {
    // Istanbul|Karasu is 95 nm in tier-1; tier 3 must not override it
    _setLiveSearouteForTest(() => ({ nm: 9999 }));
    expect(getPortDistance('Istanbul', 'Karasu')).toEqual({ nm: 95, exact: true });
  });

  it('tier 2 JSON still wins over tier 3', () => {
    // Inject tier 2 JSON hit; tier 3 must not be reached
    _setSearouteJsonForTest(new Map([['Durban|Rotterdam', 8888]]));
    const mock = jest.fn(() => ({ nm: 9999 }));
    _setLiveSearouteForTest(mock);
    expect(getPortDistance('Rotterdam', 'Durban')).toEqual({ nm: 8888, exact: true });
    expect(mock).not.toHaveBeenCalled();
  });

  it('falls through to haversine (exact:false) when tier 3 searoute returns null', () => {
    _setSearouteJsonForTest(new Map());
    _setLiveSearouteForTest(() => null);
    // Rotterdam and Durban have port-master coords → haversine produces a result
    const result = getPortDistance('Rotterdam', 'Durban');
    expect(result).not.toBeNull();
    expect(result!.exact).toBe(false);
    expect(result!.nm).toBeGreaterThan(5000);
  });

  it('DISTANCE_USE_SEAROUTE_LIVE=false skips tier 3 entirely', () => {
    process.env.DISTANCE_USE_SEAROUTE_LIVE = 'false';
    _setSearouteJsonForTest(new Map());
    const mock = jest.fn(() => ({ nm: 9999 }));
    _setLiveSearouteForTest(mock);
    const result = getPortDistance('Rotterdam', 'Durban');
    expect(mock).not.toHaveBeenCalled();
    expect(result).not.toBeNull();
    expect(result!.exact).toBe(false);
  });

  it('returns null when port has no port-master coords (tier 3 and haversine both skip)', () => {
    _setSearouteJsonForTest(new Map());
    // UnknownPortXYZ won't normalize
    expect(getPortDistance('UnknownPortXYZ', 'Rotterdam')).toBeNull();
  });
});

describe('computeSearouteCached — LRU cache', () => {
  it('calls seaRoute only once for the same port-pair', () => {
    const mockRoute = {
      type: 'Feature' as const,
      geometry: { type: 'LineString' as const, coordinates: [] },
      properties: {
        length: 9123,
        units: 'nauticalmiles' as const,
        bbox: [0, 0, 0, 0] as [number, number, number, number],
        greatCircleLength: 8000,
        detourRatio: 1.14,
        originSnapKm: 1,
        destinationSnapKm: 1,
      },
    };
    const mockFn = jest.fn().mockReturnValue(mockRoute);
    _setSeaRouteLibForTest(mockFn as never);

    const coordA = { lat: 51.9, lon: 4.5 };  // Rotterdam approx
    const coordB = { lat: -29.8, lon: 31.0 }; // Durban approx

    const r1 = computeSearouteCached(coordA, coordB);
    const r2 = computeSearouteCached(coordA, coordB);

    expect(mockFn).toHaveBeenCalledTimes(1);
    expect(r1).toEqual({ nm: 9123 });
    expect(r2).toEqual(r1);
  });

  it('treats reversed coordinate order as the same pair (cache hit)', () => {
    const mockRoute = {
      type: 'Feature' as const,
      geometry: { type: 'LineString' as const, coordinates: [] },
      properties: {
        length: 7000,
        units: 'nauticalmiles' as const,
        bbox: [0, 0, 0, 0] as [number, number, number, number],
        greatCircleLength: 6500,
        detourRatio: 1.08,
        originSnapKm: 1,
        destinationSnapKm: 1,
      },
    };
    const mockFn = jest.fn().mockReturnValue(mockRoute);
    _setSeaRouteLibForTest(mockFn as never);

    const coordA = { lat: 51.9, lon: 4.5 };
    const coordB = { lat: -29.8, lon: 31.0 };

    computeSearouteCached(coordA, coordB);
    computeSearouteCached(coordB, coordA);

    expect(mockFn).toHaveBeenCalledTimes(1);
  });

  it('returns null and caches it when seaRoute throws', () => {
    const mockFn = jest.fn().mockImplementation(() => {
      throw new Error('SnapFailedError: no coast nearby');
    });
    _setSeaRouteLibForTest(mockFn as never);

    const coordA = { lat: 10, lon: 10 };
    const coordB = { lat: 20, lon: 20 };

    const r1 = computeSearouteCached(coordA, coordB);
    const r2 = computeSearouteCached(coordA, coordB);

    expect(r1).toBeNull();
    expect(r2).toBeNull();
    expect(mockFn).toHaveBeenCalledTimes(1); // error result is also cached
  });
});
