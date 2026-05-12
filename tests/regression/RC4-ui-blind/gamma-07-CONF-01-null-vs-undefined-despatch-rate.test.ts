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

  it('despatchRateUsdPerDay: null should be treated as undefined (fallback to default)', async () => {
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

    // EXPECTATION: null should behave like undefined → use default
    // IF this fails: API treats null as 0 or throws → finding confirmed
    expect(response.status).toBe(200);
    expect(data.dd.breakdown.despatchRate).toBe(5000);
    // NOTE: This test MAY fail if API validation rejects null — that's the bug we're looking for
  });
});
