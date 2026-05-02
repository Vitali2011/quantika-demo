/**
 * βf-01 — distanceNm validation
 *
 * Bug: POST /api/voyage/tce принимал отрицательную/нулевую distanceNm и считал
 * расчёт с мусорными значениями (bunker=0, total=0). Должен быть HTTP 400.
 */

import { POST } from '../route';
import { NextRequest } from 'next/server';

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/voyage/tce', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

const validBase = {
  vessel: {
    dwt: 30000,
    valueUsd: 25_000_000,
    speedKts: 12,
    consumptionMtPerDay: 25,
  },
  route: {
    originPort: 'NLRTM',
    destinationPort: 'SGSIN',
    distanceNm: 10500,
  },
  cargo: {
    quantityMt: 28000,
    freightRateUsdPerMt: 50,
  },
  bunkerPriceUsdPerMt: 600,
  euaPriceEur: 80,
  durationDays: 40,
  canalUsd: 0,
  daUsd: 0,
};

describe('POST /api/voyage/tce — distanceNm validation (βf-01)', () => {
  it('rejects negative distanceNm with 400', async () => {
    const req = makeRequest({
      ...validBase,
      route: { ...validBase.route, distanceNm: -100 },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(JSON.stringify(body)).toMatch(/distanceNm/i);
  });

  it('rejects distanceNm=0 with 400', async () => {
    const req = makeRequest({
      ...validBase,
      route: { ...validBase.route, distanceNm: 0 },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(JSON.stringify(body)).toMatch(/distanceNm/i);
  });

  it('accepts distanceNm=10500 (valid Rotterdam → Singapore via Suez)', async () => {
    const req = makeRequest(validBase);
    const res = await POST(req);
    expect(res.status).toBe(200);
  });
});
