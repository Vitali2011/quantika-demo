import type { EcaZone } from './parser';

interface PortCoordinates {
  lat: number;
  lon: number;
}

/**
 * Check if a port is inside any ECA zone using point-in-polygon
 *
 * Input contract:
 * - Returns false for invalid coordinates (NaN, ±Infinity, out of range)
 * - Returns false for empty zones array
 * - Coordinates must be valid: lat in [-90, 90], lon in [-180, 180]
 */
export function isPortInEca(port: PortCoordinates, zones: EcaZone[]): boolean {
  // Guard: invalid coordinates
  if (!Number.isFinite(port.lat) || !Number.isFinite(port.lon)) {
    return false;
  }

  // Guard: out-of-range coordinates
  if (port.lat < -90 || port.lat > 90 || port.lon < -180 || port.lon > 180) {
    return false;
  }

  // Guard: empty zones
  if (zones.length === 0) {
    return false;
  }

  // Check each zone
  for (const zone of zones) {
    try {
      const polygon = JSON.parse(zone.polygon_geojson);
      if (polygon.type === 'Polygon' && polygon.coordinates && polygon.coordinates.length > 0) {
        const ring = polygon.coordinates[0]; // Outer ring
        if (pointInPolygon([port.lon, port.lat], ring)) {
          return true;
        }
      }
    } catch {
      // Invalid GeoJSON, skip this zone
      continue;
    }
  }

  return false;
}

/**
 * Calculate the portion of bunker fuel consumed in ECA zones
 *
 * Phase 1 simplification:
 * - If either origin OR dest is inside any ECA → return 0.05 (5% of route)
 * - If both ports outside ECA → return 0.0
 * - If both ports inside ECA → return 0.05 (NOT 100%, documented trade-off)
 *
 * Phase 3 will use proper geospatial intersection for accurate ECA distance.
 *
 * Input contract:
 * - Throws Error for invalid coordinates (NaN, ±Infinity, out of range)
 * - Returns 0.0 for empty zones array (no ECAs defined)
 */
export function calculateEcaFuelPortion(
  origin: PortCoordinates,
  dest: PortCoordinates,
  zones: EcaZone[]
): number {
  // Guard: validate coordinates
  if (
    !Number.isFinite(origin.lat) || !Number.isFinite(origin.lon) ||
    !Number.isFinite(dest.lat) || !Number.isFinite(dest.lon)
  ) {
    throw new Error('Invalid coordinates: lat/lon must be finite numbers');
  }

  if (
    origin.lat < -90 || origin.lat > 90 || origin.lon < -180 || origin.lon > 180 ||
    dest.lat < -90 || dest.lat > 90 || dest.lon < -180 || dest.lon > 180
  ) {
    throw new Error('Invalid coordinates: lat must be in [-90, 90], lon in [-180, 180]');
  }

  // Guard: empty zones
  if (zones.length === 0) {
    return 0.0;
  }

  // Phase 1 simplification: if either port in ECA → 5%
  const originInEca = isPortInEca(origin, zones);
  const destInEca = isPortInEca(dest, zones);

  if (originInEca || destInEca) {
    // Phase 1: assume 5% of route is in ECA
    // Note: even if both ports are in ECA, we return 5% (not 100%)
    // This is a documented trade-off; Phase 3 will use proper geospatial intersection
    return 0.05;
  }

  // Neither port in ECA → open ocean only
  return 0.0;
}

/**
 * Simple point-in-polygon algorithm (ray casting)
 * Point is [lon, lat], ring is [[lon, lat], ...]
 */
function pointInPolygon(point: [number, number], ring: [number, number][]): boolean {
  const [x, y] = point;
  let inside = false;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];

    const intersect = ((yi > y) !== (yj > y)) &&
      (x < (xj - xi) * (y - yi) / (yj - yi) + xi);

    if (intersect) {
      inside = !inside;
    }
  }

  return inside;
}
