/**
 * Great-circle distance between two points on Earth, in nautical miles.
 *
 * Used as a fallback for `getPortDistance()` when the requested pair is not
 * in the hardcoded sea-route distance matrix. Note: this is the "as the crow
 * flies" distance — it cuts across land. For ports separated by a peninsula
 * or continent (e.g. Singapore → Rotterdam via Suez vs. via Cape of Good
 * Hope) this can underestimate the real sea route by 30%+.
 *
 * UI must mark haversine-derived distances as approximate ("~1487 NM") to
 * avoid misleading brokers — see `getPortDistance()` for the wrapper.
 *
 * Reference: https://en.wikipedia.org/wiki/Haversine_formula
 */

/** Mean Earth radius in nautical miles (1 NM = 1852 m, R_earth = 6371 km). */
const EARTH_RADIUS_NM = 3440.065;

const DEG_TO_RAD = Math.PI / 180;

export function haversineDistanceNm(
  lat1: number, lon1: number,
  lat2: number, lon2: number,
): number {
  const φ1 = lat1 * DEG_TO_RAD;
  const φ2 = lat2 * DEG_TO_RAD;
  const dφ = (lat2 - lat1) * DEG_TO_RAD;
  const dλ = (lon2 - lon1) * DEG_TO_RAD;

  const sinDφ2 = Math.sin(dφ / 2);
  const sinDλ2 = Math.sin(dλ / 2);
  const a = sinDφ2 * sinDφ2 + Math.cos(φ1) * Math.cos(φ2) * sinDλ2 * sinDλ2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(EARTH_RADIUS_NM * c);
}
