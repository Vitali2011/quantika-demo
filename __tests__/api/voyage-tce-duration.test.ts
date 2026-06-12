/**
 * Audit C.2: durationDays=0 silently produced HTTP 200 with tce=0, bunker=0.
 * The schema accepted any z.number() for durationDays (distanceNm next to it
 * already had .positive()) — a $0 voyage instead of a validation error.
 *
 * Hermetic: manual bunkerPriceUsdPerMt + euaPriceEur + explicit distanceNm
 * mean no DB lookups; getPortDa mocked to null like neighbouring suites.
 */

import { POST } from '@/app/api/voyage/tce/route';
import { NextRequest } from 'next/server';

jest.mock('@/lib/session-store', () => ({
  getStore: jest.fn(() => ({
    getDb: () => {
      throw new Error('unexpected DB access in hermetic test');
    },
  })),
}));

jest.mock('@/lib/port-da/repository', () => ({
  getPortDa: jest.fn().mockReturnValue(null),
}));

function makeReq(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/voyage/tce', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

const BASE = {
  vessel: { dwt: 55000, valueUsd: 18_000_000, speedKts: 13, consumptionMtPerDay: 28 },
  route: { originPort: 'Rotterdam', destinationPort: 'Hamburg', distanceNm: 280 },
  cargo: { quantityMt: 50000, freightRateUsdPerMt: 20 },
  bunkerPriceUsdPerMt: 600,
  euaPriceEur: 0, // manual → skips EUA DB lookup (EU↔EU route would otherwise trigger it)
};

describe('POST /api/voyage/tce durationDays validation (audit C.2)', () => {
  it('rejects durationDays = 0 with 400', async () => {
    const res = await POST(makeReq({ ...BASE, durationDays: 0 }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(JSON.stringify(json.issues)).toContain('durationDays');
  });

  it('rejects negative durationDays with 400', async () => {
    const res = await POST(makeReq({ ...BASE, durationDays: -3 }));
    expect(res.status).toBe(400);
  });

  it('rejects Infinity durationDays with 400 — JSON 1e999 parses to Infinity (QA F4)', async () => {
    const res = await POST(makeReq({ ...BASE, durationDays: 1e999 }));
    expect(res.status).toBe(400);
  });

  it('accepts positive durationDays', async () => {
    const res = await POST(makeReq({ ...BASE, durationDays: 12 }));
    expect(res.status).toBe(200);
  });
});
