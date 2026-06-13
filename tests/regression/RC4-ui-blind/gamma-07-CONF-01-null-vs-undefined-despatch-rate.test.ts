// Regression Lock: QA adversarial 2026-05-12
// Class: 7 (Config cross-reference) | Severity: MEDIUM
// Finding: 7-02 — API should handle null vs undefined for optional despatchRateUsdPerDay
// Spec: gamma-07-demurrage-despatch
// DO NOT DELETE — see references/regression_lock_workflow.md

import { POST } from '@/app/api/laytime/calculate/route';
import { NextRequest } from 'next/server';

jest.mock('@/lib/csrf', () => ({
  validateCsrf: jest.fn(() => true),
}));

function createRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/api/laytime/calculate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('regression gamma-07-CONF-01: null vs undefined despatchRate', () => {
  beforeEach(() => {
    process.env.LAYTIME_ENGINE_ENABLED = 'true';
  });

  it('despatchRateUsdPerDay: undefined should use default (demurrageRate/2)', async () => {
    const request = createRequest({
      allowedLaytimeDays: 5,
      mode: 'SHEX',
      commencedAt: '2026-05-04T08:00:00Z',
      completedAt: '2026-05-08T08:00:00Z',
      demurrageRateUsdPerDay: 10000,
      // despatchRateUsdPerDay is omitted (undefined)
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.dd.breakdown.despatchRate).toBe(5000); // default = 10000 / 2
  });

  it('despatchRateUsdPerDay: null is rejected with explicit 400 (strict contract, not silent coercion)', async () => {
    // Finding 7-02 RESOLVED — re-pinned to the actual contract. The route validates
    // `!== undefined` values as finite numbers and rejects null with an explicit 400
    // and a clear message (app/api/laytime/calculate/route.ts:94-99). This is neither
    // of the feared failure modes (null→0 silent coercion, or an unhandled 500).
    // The sole UI caller (app/laytime/page.tsx) keeps the field as
    // `number | undefined` — undefined is dropped by JSON.stringify, so no real
    // client ever sends null. Strict rejection is the deliberate contract; this
    // test now locks it.
    const request = createRequest({
      allowedLaytimeDays: 5,
      mode: 'SHEX',
      commencedAt: '2026-05-04T08:00:00Z',
      completedAt: '2026-05-08T08:00:00Z',
      demurrageRateUsdPerDay: 10000,
      despatchRateUsdPerDay: null,
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('despatchRateUsdPerDay must be a finite number');
    expect(data).not.toHaveProperty('dd'); // no partial success payload on validation error
  });
});
