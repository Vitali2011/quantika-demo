/**
 * TDD tests for βf2-04: case-insensitive vessel type in POST /api/voyage/tce
 *
 * Brokers commonly submit uppercase vessel types (MPP, BULKER). The Zod schema
 * now preprocesses the `type` field with trim+toLowerCase so these inputs are
 * accepted without changing downstream semantics.
 *
 * TDD-6 judgment: trailing spaces (e.g. '  MPP  ') are trimmed then
 * lowercased → 200. Rationale: whitespace is a common copy-paste artefact
 * in broker forms; silently normalising it is safer than rejecting a valid type.
 */

import { NextRequest } from 'next/dist/server/web/spec-extension/request';
import { POST } from '@/app/api/voyage/tce/route';

// ─── Minimal valid body ───────────────────────────────────────────────────────

function makeBody(typeOverride?: unknown): Record<string, unknown> {
  return {
    vessel: {
      dwt: 30000,
      valueUsd: 12_000_000,
      speedKts: 13,
      consumptionMtPerDay: 22,
      ...(typeOverride !== undefined ? { type: typeOverride } : {}),
    },
    route: {
      originPort: 'SGSIN',
      destinationPort: 'NLRTM',
      distanceNm: 8400,
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
  };
}

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/voyage/tce', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('POST /api/voyage/tce — vessel type case normalisation (βf2-04)', () => {
  it('TDD-1: accepts uppercase MPP → 200', async () => {
    const res = await POST(makeRequest(makeBody('MPP')));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveProperty('daily_tce_usd');
  });

  it('TDD-2: accepts mixed-case Mpp → 200', async () => {
    const res = await POST(makeRequest(makeBody('Mpp')));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveProperty('daily_tce_usd');
  });

  it('TDD-3: accepts lowercase mpp → 200 (regression)', async () => {
    const res = await POST(makeRequest(makeBody('mpp')));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveProperty('daily_tce_usd');
  });

  it('TDD-4: rejects unknown type frigate → 400', async () => {
    const res = await POST(makeRequest(makeBody('frigate')));
    expect(res.status).toBe(400);
  });

  it('TDD-5: rejects non-string type (number 123) → 400 without crash', async () => {
    const res = await POST(makeRequest(makeBody(123)));
    expect(res.status).toBe(400);
  });

  it('TDD-6: accepts type with trailing spaces "  MPP  " → 200 (trim+lowercase)', async () => {
    // Judgment: whitespace is a common copy-paste artefact in broker forms.
    // We preprocess with trim+toLowerCase so "  MPP  " → "mpp" (valid).
    const res = await POST(makeRequest(makeBody('  MPP  ')));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveProperty('daily_tce_usd');
  });
});
