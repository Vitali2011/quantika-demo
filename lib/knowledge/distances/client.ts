/**
 * Node.js client for searoute Python microservice
 *
 * Provides calculateDistance function with:
 * - Input validation (finite lat/lon in valid range)
 * - Retry logic for 5xx errors
 * - Timeout handling via AbortController
 * - RoutingError for 422 responses
 */

const SEAROUTE_URL = process.env.SEAROUTE_SERVICE_URL ?? "http://127.0.0.1:8200";

export class RoutingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RoutingError";
  }
}

export type RouteVia = "suez" | "cape" | "panama" | "direct";

export interface CalculateDistanceInput {
  origin: { lat: number; lon: number };
  dest: { lat: number; lon: number };
  routeVia: RouteVia;
}

export interface CalculateDistanceOptions {
  timeoutMs?: number;
  retries?: number;
}

export interface CalculateDistanceResult {
  distanceNm: number;
  calculatorVersion: string;
}

/**
 * Validates coordinate is finite and in valid range
 */
function validateCoordinate(lat: number, lon: number, label: string): void {
  if (!Number.isFinite(lat)) {
    throw new RangeError(`${label} latitude must be finite, got ${lat}`);
  }
  if (!Number.isFinite(lon)) {
    throw new RangeError(`${label} longitude must be finite, got ${lon}`);
  }
  if (lat < -90 || lat > 90) {
    throw new RangeError(`${label} latitude must be in range [-90, 90], got ${lat}`);
  }
  if (lon < -180 || lon > 180) {
    throw new RangeError(`${label} longitude must be in range [-180, 180], got ${lon}`);
  }
}

/**
 * Validates options
 */
function validateOptions(opts: CalculateDistanceOptions): void {
  if (opts.timeoutMs !== undefined) {
    if (!Number.isFinite(opts.timeoutMs) || opts.timeoutMs < 0) {
      throw new RangeError(`timeoutMs must be >= 0, got ${opts.timeoutMs}`);
    }
  }
  if (opts.retries !== undefined) {
    if (!Number.isInteger(opts.retries) || opts.retries < 0) {
      throw new RangeError(`retries must be integer >= 0, got ${opts.retries}`);
    }
  }
}

/**
 * Calculate sea distance between two points using searoute microservice
 *
 * Input contract:
 * - origin.lat, dest.lat: must be finite numbers in [-90, 90]
 * - origin.lon, dest.lon: must be finite numbers in [-180, 180]
 * - routeVia: must be 'suez' | 'cape' | 'panama' | 'direct'
 * - timeoutMs (optional): must be >= 0, defaults to 15000
 * - retries (optional): must be >= 0, defaults to 2
 *
 * Error handling:
 * - 422 response → throws RoutingError (no path found)
 * - 5xx response → retries up to maxRetries times with exponential backoff
 * - Timeout → throws Error (via AbortController)
 * - Invalid inputs → throws RangeError
 *
 * @param input - Origin, destination coordinates and route preference
 * @param opts - Optional timeout and retry configuration
 * @returns Distance in nautical miles and calculator version
 * @throws {RangeError} Invalid coordinate or option values
 * @throws {RoutingError} Service could not find a valid route (422)
 * @throws {Error} Network error, timeout, or service unavailable after retries
 */
export async function calculateDistance(
  input: CalculateDistanceInput,
  opts: CalculateDistanceOptions = {}
): Promise<CalculateDistanceResult> {
  // Input validation
  validateCoordinate(input.origin.lat, input.origin.lon, "origin");
  validateCoordinate(input.dest.lat, input.dest.lon, "dest");
  validateOptions(opts);

  const timeoutMs = opts.timeoutMs ?? 15_000;
  const maxRetries = opts.retries ?? 2;

  // Retry loop
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);

    try {
      const res = await fetch(`${SEAROUTE_URL}/distance`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          origin_lat: input.origin.lat,
          origin_lon: input.origin.lon,
          dest_lat: input.dest.lat,
          dest_lon: input.dest.lon,
          route_via: input.routeVia,
        }),
        signal: ctrl.signal,
      });

      // 422 = routing failed (no valid path) - don't retry
      if (res.status === 422) {
        const errorText = await res.text();
        throw new RoutingError(errorText);
      }

      // Other non-ok responses
      if (!res.ok) {
        throw new Error(`searoute ${res.status}`);
      }

      // Success
      const json = await res.json();
      return {
        distanceNm: json.distance_nm,
        calculatorVersion: json.calculator_version,
      };
    } catch (err) {
      clearTimeout(timer);

      // Don't retry RoutingError (422)
      if (err instanceof RoutingError) {
        throw err;
      }

      // Last attempt - rethrow
      if (attempt === maxRetries) {
        throw err;
      }

      // Exponential backoff before retry
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    } finally {
      clearTimeout(timer);
    }
  }

  // Should never reach here
  throw new Error("unreachable");
}
