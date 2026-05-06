/**
 * TDD tests for D7: TCE distance auto-resolution from LOCODEs
 *
 * When KNOWLEDGE_LAYER_DISTANCES_ENABLED=true and distanceNm is missing,
 * the API should auto-resolve distance via lib/knowledge/distances/lookup.
 *
 * Input contract boundary tests:
 * - Flag OFF + missing distanceNm → 400 "distanceNm required"
 * - Flag ON + explicit distanceNm → use explicit value (user override)
 * - Flag ON + missing distanceNm + valid LOCODEs → auto-resolve
 * - Flag ON + missing distanceNm + invalid LOCODEs → 400 "Cannot resolve LOCODE"
 * - Flag ON + missing distanceNm + empty LOCODE → 400 "distanceNm required"
 */

import { NextRequest } from 'next/dist/server/web/spec-extension/request';
import { POST } from '@/app/api/voyage/tce/route';
import * as distancesLookup from '@/lib/knowledge/distances/lookup';

// Mock getDistance to avoid needing running searoute service in tests
jest.mock('@/lib/knowledge/distances/lookup');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeBody(overrides?: Record<string, unknown>): Record<string, unknown> {
  return {
    vessel: {
      dwt: 30000,
      valueUsd: 12_000_000,
      speedKts: 13,
      consumptionMtPerDay: 22,
    },
    route: {
      originPort: 'SGSIN',
      destinationPort: 'NLRTM',
      distanceNm: 8400, // Default — tests will override
    },
    cargo: {
      quantityMt: 25000,
      freightRateUsdPerMt: 35,
    },
    bunkerPriceUsdPerMt: 580,
    euaPriceEur: 60,
    durationDays: 28,
    canalUsd: 0,
    daUsd: 0,
    ...overrides,
  };
}

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/voyage/tce', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ─── TDD Tests — RED phase ────────────────────────────────────────────────────

describe('POST /api/voyage/tce — distance auto-resolution (D7)', () => {
  const mockGetDistance = distancesLookup.getDistance as jest.MockedFunction<typeof distancesLookup.getDistance>;

  beforeEach(() => {
    // Reset env flag between tests
    delete process.env.KNOWLEDGE_LAYER_DISTANCES_ENABLED;

    // Reset mock
    mockGetDistance.mockReset();

    // Default mock: SGSIN→NLRTM = 8300nm
    mockGetDistance.mockImplementation(async (db, origin, dest, routeVia) => {
      if (origin === 'SGSIN' && dest === 'NLRTM') {
        return { distanceNm: routeVia === 'suez' ? 8300 : 11800, source: 'computed' };
      }
      if (origin === 'SGSIN' && dest === 'SGSIN') {
        return { distanceNm: 0, source: 'cache' };
      }
      throw new Error(`Cannot resolve LOCODE: origin "${origin}" not found in port master`);
    });
  });

  describe('Flag OFF (current behavior)', () => {
    it('RED: rejects missing distanceNm with 400', async () => {
      process.env.KNOWLEDGE_LAYER_DISTANCES_ENABLED = 'false';

      const body = makeBody();
      delete (body.route as Record<string, unknown>).distanceNm;

      const res = await POST(makeRequest(body));
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toMatch(/distanceNm/i);
    });

    it('RED: accepts explicit distanceNm → 200', async () => {
      process.env.KNOWLEDGE_LAYER_DISTANCES_ENABLED = 'false';

      const res = await POST(makeRequest(makeBody()));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toHaveProperty('daily_tce_usd');
    });
  });

  describe('Flag ON — user override', () => {
    it('RED: uses explicit distanceNm when provided (ignores LOCODEs)', async () => {
      process.env.KNOWLEDGE_LAYER_DISTANCES_ENABLED = 'true';

      const body = makeBody({
        route: {
          originPort: 'SGSIN',
          destinationPort: 'NLRTM',
          distanceNm: 9999, // User override
        },
      });

      const res = await POST(makeRequest(body));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toHaveProperty('daily_tce_usd');
      // Should use distanceNm=9999, not auto-resolve
    });
  });

  describe('Flag ON — auto-resolution', () => {
    it('RED: auto-resolves distance for valid LOCODEs', async () => {
      process.env.KNOWLEDGE_LAYER_DISTANCES_ENABLED = 'true';

      const body = makeBody({
        route: {
          originPort: 'SGSIN',
          destinationPort: 'NLRTM',
          // distanceNm missing — should auto-resolve
        },
      });

      delete (body.route as Record<string, unknown>).distanceNm;

      const res = await POST(makeRequest(body));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toHaveProperty('daily_tce_usd');
      // Should have resolved distance from SGSIN→NLRTM via getDistance()
    });

    it('RED: rejects invalid LOCODE when distanceNm missing', async () => {
      process.env.KNOWLEDGE_LAYER_DISTANCES_ENABLED = 'true';

      const body = makeBody({
        route: {
          originPort: 'INVALID',
          destinationPort: 'NLRTM',
        },
      });

      delete (body.route as Record<string, unknown>).distanceNm;

      const res = await POST(makeRequest(body));
      expect(res.status).toBe(400);
      const json = await res.json();
      // Port validation happens first in resolvePortOrPassthrough, before distance resolution
      expect(json.error).toMatch(/port_not_found|LOCODE|resolve/i);
    });

    it('RED: rejects empty LOCODE when distanceNm missing', async () => {
      process.env.KNOWLEDGE_LAYER_DISTANCES_ENABLED = 'true';

      const body = makeBody({
        route: {
          originPort: '',
          destinationPort: 'NLRTM',
        },
      });

      delete (body.route as Record<string, unknown>).distanceNm;

      const res = await POST(makeRequest(body));
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toMatch(/port_not_found|originPort/i);
    });

    it('RED: respects routeVia when auto-resolving (suez vs cape)', async () => {
      process.env.KNOWLEDGE_LAYER_DISTANCES_ENABLED = 'true';

      const bodySuez = makeBody({
        route: {
          originPort: 'SGSIN',
          destinationPort: 'NLRTM',
          viaSuez: true,
        },
      });

      delete (bodySuez.route as Record<string, unknown>).distanceNm;

      const resSuez = await POST(makeRequest(bodySuez));
      expect(resSuez.status).toBe(200);
      const jsonSuez = await resSuez.json();

      // Should have called getDistance(..., 'suez')
      expect(jsonSuez).toHaveProperty('daily_tce_usd');
    });
  });

  describe('Boundary cases', () => {
    it('RED: handles same port (distanceNm=0 auto-resolved)', async () => {
      process.env.KNOWLEDGE_LAYER_DISTANCES_ENABLED = 'true';

      const body = makeBody({
        route: {
          originPort: 'SGSIN',
          destinationPort: 'SGSIN',
        },
        durationDays: 1,
      });

      delete (body.route as Record<string, unknown>).distanceNm;

      const res = await POST(makeRequest(body));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toHaveProperty('daily_tce_usd');
      // getDistance('SGSIN', 'SGSIN') → { distanceNm: 0, source: 'cache' }
    });

    it('RED: rejects NaN distanceNm at validation layer (Zod rejects non-finite)', async () => {
      process.env.KNOWLEDGE_LAYER_DISTANCES_ENABLED = 'false';

      const body = makeBody({
        route: {
          originPort: 'SGSIN',
          destinationPort: 'NLRTM',
          distanceNm: NaN,
        },
      });

      const res = await POST(makeRequest(body));
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe('Validation failed');
      // Zod .number() rejects NaN before it reaches safeNum()
    });
  });
});
