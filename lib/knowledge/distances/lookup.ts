/**
 * Cache-first distance lookup
 *
 * Flow:
 * 1. Check port_distances table for cached distance
 * 2. On cache miss: resolve LOCODE → coords via lib/ports/resolve
 * 3. Calculate distance via searoute service (lib/knowledge/distances/client)
 * 4. Store result in port_distances table
 * 5. Return { distanceNm, source }
 *
 * Input contract:
 * - origin: string, non-empty, valid 5-char UN/LOCODE format
 * - dest: string, non-empty, valid 5-char UN/LOCODE format
 * - routeVia: optional, enum ['direct', 'suez', 'cape'], defaults to 'direct'
 *
 * Boundary handling:
 * - Empty/null/undefined origin or dest → throws Error "Invalid LOCODE"
 * - Invalid LOCODE format (not 5 chars) → throws Error "Invalid LOCODE format"
 * - LOCODE that cannot be resolved to coordinates → throws Error "Cannot resolve LOCODE"
 * - Same origin and dest → returns { distanceNm: 0, source: 'cache' }
 * - Out-of-range routeVia → defaults to 'direct'
 */

import type Database from 'better-sqlite3';
import { resolvePortStrict, PortNotFoundError } from '@/lib/ports/resolve';
import { calculateDistance, type RouteVia } from './client';

export interface GetDistanceResult {
  distanceNm: number;
  source: 'cache' | 'computed';
}

// Valid LOCODE pattern: 5 characters (2-letter country code + 3-char port code)
const LOCODE_PATTERN = /^[A-Z]{2}[A-Z0-9]{3}$/i;

/**
 * Validates and normalizes LOCODE input
 */
function validateLocode(input: string | null | undefined, label: string): string {
  if (input == null || input === '') {
    throw new Error(`Invalid LOCODE: ${label} is empty or null`);
  }

  const normalized = input.trim().toUpperCase();

  if (!LOCODE_PATTERN.test(normalized)) {
    throw new Error(`Invalid LOCODE format: ${label} must be 5 characters (e.g., SGSIN), got "${input}"`);
  }

  return normalized;
}

/**
 * Normalizes routeVia to valid enum value, defaults to 'direct'
 */
function normalizeRouteVia(routeVia?: string): RouteVia {
  if (!routeVia) return 'direct';
  const lower = routeVia.toLowerCase();
  if (lower === 'suez' || lower === 'cape' || lower === 'panama') {
    return lower as RouteVia;
  }
  return 'direct';
}

/**
 * Looks up cached distance from port_distances table.
 * Handles symmetric pairs: (A→B) and (B→A) are equivalent.
 */
function getCachedDistance(
  db: Database.Database,
  origin: string,
  dest: string,
  routeVia: RouteVia
): number | null {
  const row = db
    .prepare(
      `
      SELECT distance_nm
      FROM port_distances
      WHERE ((origin = ? AND dest = ?) OR (origin = ? AND dest = ?))
        AND route_via = ?
      LIMIT 1
    `
    )
    .get(origin, dest, dest, origin, routeVia) as { distance_nm: number } | undefined;

  return row ? row.distance_nm : null;
}

/**
 * Stores computed distance in port_distances table
 */
function cacheDistance(
  db: Database.Database,
  origin: string,
  dest: string,
  routeVia: RouteVia,
  distanceNm: number
): void {
  db.prepare(
    `
    INSERT INTO port_distances (origin, dest, route_via, distance_nm, created_at)
    VALUES (?, ?, ?, ?, datetime('now'))
  `
  ).run(origin, dest, routeVia, distanceNm);
}

/**
 * Get sea distance between two ports (cache-first).
 *
 * Resolution order:
 * 1. Same port → return 0 (cached)
 * 2. Check cache (port_distances table) → return if hit
 * 3. Resolve LOCODE → coordinates via lib/ports/resolve
 * 4. Calculate distance via searoute service
 * 5. Store in cache
 * 6. Return result
 *
 * @param db - SQLite database instance
 * @param origin - Origin port UN/LOCODE (5 chars, e.g., "SGSIN")
 * @param dest - Destination port UN/LOCODE (5 chars, e.g., "NLRTM")
 * @param routeVia - Route preference: 'direct' | 'suez' | 'cape' | 'panama' (default: 'direct')
 * @returns Promise resolving to { distanceNm, source }
 * @throws Error if LOCODE is invalid or cannot be resolved
 */
export async function getDistance(
  db: Database.Database,
  origin: string | null | undefined,
  dest: string | null | undefined,
  routeVia?: string
): Promise<GetDistanceResult> {
  // Input validation
  const originNorm = validateLocode(origin, 'origin');
  const destNorm = validateLocode(dest, 'dest');
  const routeViaNorm = normalizeRouteVia(routeVia);

  // Same port → distance is 0
  if (originNorm === destNorm) {
    return { distanceNm: 0, source: 'cache' };
  }

  // Check cache
  const cached = getCachedDistance(db, originNorm, destNorm, routeViaNorm);
  if (cached !== null) {
    return { distanceNm: cached, source: 'cache' };
  }

  // Cache miss — resolve LOCODEs to coordinates
  let originPort;
  let destPort;

  try {
    originPort = resolvePortStrict(originNorm);
  } catch (err) {
    if (err instanceof PortNotFoundError) {
      throw new Error(`Cannot resolve LOCODE: origin "${originNorm}" not found in port master`);
    }
    throw err;
  }

  try {
    destPort = resolvePortStrict(destNorm);
  } catch (err) {
    if (err instanceof PortNotFoundError) {
      throw new Error(`Cannot resolve LOCODE: dest "${destNorm}" not found in port master`);
    }
    throw err;
  }

  // Validate coordinates exist
  if (
    originPort.lat == null ||
    originPort.lon == null ||
    destPort.lat == null ||
    destPort.lon == null
  ) {
    throw new Error(
      `Cannot resolve LOCODE: missing coordinates for ${originNorm} or ${destNorm}`
    );
  }

  // Calculate distance via searoute service
  const result = await calculateDistance({
    origin: { lat: originPort.lat, lon: originPort.lon },
    dest: { lat: destPort.lat, lon: destPort.lon },
    routeVia: routeViaNorm,
  });

  // Store in cache
  cacheDistance(db, originNorm, destNorm, routeViaNorm, result.distanceNm);

  return { distanceNm: result.distanceNm, source: 'computed' };
}
