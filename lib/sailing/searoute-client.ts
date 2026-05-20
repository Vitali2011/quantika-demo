import { seaRoute as seaRouteLib } from 'searoute-ts';

export interface PortCoords { lat: number; lon: number }

type SeaRouteFn = typeof seaRouteLib;

const CACHE_MAX = 10_000;
const _cache = new Map<string, { nm: number } | null>();
let _seaRouteLibOverride: SeaRouteFn | null = null;

function cacheKey(a: PortCoords, b: PortCoords): string {
  const ak = `${a.lat},${a.lon}`;
  const bk = `${b.lat},${b.lon}`;
  return ak <= bk ? `${ak}|${bk}` : `${bk}|${ak}`;
}

/**
 * Compute the shortest sea route between two port coordinates.
 * Results are cached (LRU, up to 10 000 entries) to avoid recomputation.
 * Returns null on any routing failure (landlocked coords, isolated network, etc.).
 */
export function computeSearouteCached(a: PortCoords, b: PortCoords): { nm: number } | null {
  const key = cacheKey(a, b);
  if (_cache.has(key)) return _cache.get(key) ?? null;

  const routeFn = _seaRouteLibOverride ?? seaRouteLib;
  let result: { nm: number } | null = null;
  try {
    const route = routeFn([a.lon, a.lat], [b.lon, b.lat], { units: 'nauticalmiles' });
    const nm = route.properties.length;
    if (nm > 0) result = { nm: Math.round(nm) };
  } catch {
    result = null;
  }

  if (_cache.size >= CACHE_MAX) {
    const firstKey = _cache.keys().next().value;
    if (firstKey !== undefined) _cache.delete(firstKey);
  }
  _cache.set(key, result);
  return result;
}

export function _clearCacheForTest(): void {
  _cache.clear();
}

export function _setSeaRouteLibForTest(fn: SeaRouteFn | null): void {
  _seaRouteLibOverride = fn;
}
