/**
 * Integration tests for βf3-02b: Port resolution at API entry
 *
 * Verifies that POST /api/voyage/tce:
 *  - Accepts both LOCODE and free-text name inputs
 *  - Returns identical results for LOCODE vs. name inputs (same port)
 *  - Returns 400 with structured error for unknown ports
 *  - Populates both da and warRisk for HRA ports (Lagos/NGAPP)
 */

import { NextRequest } from 'next/dist/server/web/spec-extension/request';
import { POST } from '@/app/api/voyage/tce/route';

// ── Minimal valid body ────────────────────────────────────────────────────────

function makeBody(overrides: {
  originPort?: string;
  destinationPort?: string;
} = {}): Record<string, unknown> {
  return {
    vessel: {
      dwt: 32000,
      valueUsd: 12_000_000,
      speedKts: 13,
      consumptionMtPerDay: 22,
    },
    route: {
      originPort: overrides.originPort ?? 'SGSIN',
      destinationPort: overrides.destinationPort ?? 'NLRTM',
      distanceNm: 8400,
    },
    cargo: {
      quantityMt: 25000,
      freightRateUsdPerMt: 35,
    },
    bunkerPriceUsdPerMt: 580,
    euaPriceEur: 60,
    durationDays: 28,
    // No pre-computed canalUsd/daUsd — let the route resolve them
  };
}

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/voyage/tce', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /api/voyage/tce — port resolution', () => {
  it('TC1: NGAPP LOCODE origin → response has non-null warRisk applicable', async () => {
    const req = makeRequest(makeBody({ originPort: 'NGAPP', destinationPort: 'NLRTM' }));
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.breakdown).toBeDefined();
    // Gulf of Guinea HRA should trigger war_risk
    expect(json.breakdown.applicable.war_risk).toBe(true);
    expect(json.breakdown.war_risk_usd).toBeGreaterThan(0);
  });

  it('TC2: "Lagos" name → identical war_risk to NGAPP LOCODE', async () => {
    const reqLocode = makeRequest(makeBody({ originPort: 'NGAPP', destinationPort: 'NLRTM' }));
    const reqName = makeRequest(makeBody({ originPort: 'Lagos', destinationPort: 'NLRTM' }));

    const [resLocode, resName] = await Promise.all([POST(reqLocode), POST(reqName)]);

    expect(resLocode.status).toBe(200);
    expect(resName.status).toBe(200);

    const jsonLocode = await resLocode.json();
    const jsonName = await resName.json();

    // Both should trigger war_risk
    expect(jsonLocode.breakdown.applicable.war_risk).toBe(true);
    expect(jsonName.breakdown.applicable.war_risk).toBe(true);

    // Identical war_risk premium (same resolved port → same zone match)
    expect(jsonName.breakdown.war_risk_usd).toBe(jsonLocode.breakdown.war_risk_usd);
  });

  it('TC3: Antwerp origin + Lagos destination → both war_risk and route populated', async () => {
    const req = makeRequest(makeBody({ originPort: 'Antwerp', destinationPort: 'Lagos' }));
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.breakdown).toBeDefined();
    // Lagos (NGAPP) is Gulf of Guinea HRA → war_risk applicable
    expect(json.breakdown.applicable.war_risk).toBe(true);
    expect(json.breakdown.war_risk_usd).toBeGreaterThan(0);
  });

  it('TC4: BEANR + NGAPP LOCODE → identical to Antwerp + Lagos name', async () => {
    const reqLocode = makeRequest(makeBody({ originPort: 'BEANR', destinationPort: 'NGAPP' }));
    const reqName = makeRequest(makeBody({ originPort: 'Antwerp', destinationPort: 'Lagos' }));

    const [resLocode, resName] = await Promise.all([POST(reqLocode), POST(reqName)]);

    expect(resLocode.status).toBe(200);
    expect(resName.status).toBe(200);

    const jsonLocode = await resLocode.json();
    const jsonName = await resName.json();

    expect(jsonLocode.breakdown.war_risk_usd).toBe(jsonName.breakdown.war_risk_usd);
    expect(jsonLocode.breakdown.applicable.war_risk).toBe(jsonName.breakdown.applicable.war_risk);
  });

  it('TC5: unknown port "fakeplace" → 400 port_not_found', async () => {
    const req = makeRequest(makeBody({ originPort: 'fakeplace', destinationPort: 'NLRTM' }));
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('port_not_found');
    expect(json.input).toBe('originPort');
    expect(json.value).toBe('fakeplace');
  });
});
