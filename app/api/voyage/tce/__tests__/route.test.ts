/**
 * Tests for POST /api/voyage/tce
 *
 * Combines:
 * - βf-01 — distanceNm validation: reject distanceNm <= 0 with 400.
 * - βf-05 — vessel.type enum: accept 'mpp' alongside existing types.
 */

jest.mock('@/lib/port-da/repository', () => ({
  getPortDa: jest.fn().mockReturnValue(null),
}));

jest.mock('@/lib/economics/canals/index', () => ({
  quoteCanal: jest.fn().mockReturnValue({ totalUsd: 0 }),
}));

import { POST } from '@/app/api/voyage/tce/route';
import { NextRequest } from 'next/server';

function makeReq(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/voyage/tce', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

const baseValidBody = {
  vessel: {
    dwt: 30_000,
    valueUsd: 20_000_000,
    speedKts: 13,
    consumptionMtPerDay: 25,
  },
  route: {
    originPort: 'AEJEA',
    destinationPort: 'NLRTM',
    distanceNm: 5000,
  },
  cargo: {
    quantityMt: 25_000,
    freightRateUsdPerMt: 50,
  },
  bunkerPriceUsdPerMt: 600,
  euaPriceEur: 80,
  durationDays: 20,
};

describe('POST /api/voyage/tce — distanceNm validation (βf-01)', () => {
  it('rejects negative distanceNm with 400', async () => {
    const req = makeReq({
      ...baseValidBody,
      route: { ...baseValidBody.route, distanceNm: -100 },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(JSON.stringify(body)).toMatch(/distanceNm/i);
  });

  it('rejects distanceNm=0 with 400', async () => {
    const req = makeReq({
      ...baseValidBody,
      route: { ...baseValidBody.route, distanceNm: 0 },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(JSON.stringify(body)).toMatch(/distanceNm/i);
  });

  it('accepts valid distanceNm=5000 → 200', async () => {
    const req = makeReq(baseValidBody);
    const res = await POST(req);
    expect(res.status).toBe(200);
  });
});

describe('POST /api/voyage/tce — vessel.type enum (βf-05)', () => {
  it('accepts vessel.type:"mpp" → 200', async () => {
    const req = makeReq({ ...baseValidBody, vessel: { ...baseValidBody.vessel, type: 'mpp' } });
    const res = await POST(req);
    expect(res.status).toBe(200);
  });

  it('accepts vessel.type:"general" → 200 (existing behavior preserved)', async () => {
    const req = makeReq({ ...baseValidBody, vessel: { ...baseValidBody.vessel, type: 'general' } });
    const res = await POST(req);
    expect(res.status).toBe(200);
  });

  it('accepts vessel.type:"bulker" → 200', async () => {
    const req = makeReq({ ...baseValidBody, vessel: { ...baseValidBody.vessel, type: 'bulker' } });
    const res = await POST(req);
    expect(res.status).toBe(200);
  });

  it('accepts vessel.type:"tanker" → 200', async () => {
    const req = makeReq({ ...baseValidBody, vessel: { ...baseValidBody.vessel, type: 'tanker' } });
    const res = await POST(req);
    expect(res.status).toBe(200);
  });

  it('accepts vessel.type:"container" → 200', async () => {
    const req = makeReq({ ...baseValidBody, vessel: { ...baseValidBody.vessel, type: 'container' } });
    const res = await POST(req);
    expect(res.status).toBe(200);
  });

  it('rejects vessel.type:"unknown_xyz" with validation error', async () => {
    const req = makeReq({
      ...baseValidBody,
      vessel: { ...baseValidBody.vessel, type: 'unknown_xyz' },
    });
    const res = await POST(req);
    // Route currently returns 400 on Zod failure (spec narrative mentions 422,
    // but changing the status code is out of scope for βf-05).
    expect(res.status).not.toBe(200);
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  it('accepts case-mismatched vessel.type:"MPP" (βf2-04: case-insensitive preprocess)', async () => {
    // βf2-04 changed the schema to preprocess with trim+toLowerCase,
    // so uppercase/mixed-case inputs are now normalised and accepted.
    const req = makeReq({ ...baseValidBody, vessel: { ...baseValidBody.vessel, type: 'MPP' } });
    const res = await POST(req);
    expect(res.status).toBe(200);
  });

  it('without vessel.type → 200 (defaults to bulker, existing behavior)', async () => {
    const req = makeReq(baseValidBody);
    const res = await POST(req);
    expect(res.status).toBe(200);
  });
});
