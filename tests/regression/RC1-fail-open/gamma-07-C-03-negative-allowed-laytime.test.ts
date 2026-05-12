// Regression Lock: QA adversarial 2026-05-12
// Class: C (Negative in positive domain) | Severity: MEDIUM
// Finding: C-03 — API should reject negative allowedLaytimeDays
// Spec: gamma-07-demurrage-despatch (API validation)
// DO NOT DELETE — see references/regression_lock_workflow.md

import { POST } from '@/app/api/laytime/calculate/route';
import { NextRequest } from 'next/server';

// Mock CSRF validation
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

describe('regression gamma-07-C-03: negative allowedLaytimeDays rejection', () => {
  beforeEach(() => {
    process.env.LAYTIME_ENGINE_ENABLED = 'true';
  });

  it('API must reject allowedLaytimeDays: -5 with HTTP 400', async () => {
    const request = createRequest({
      allowedLaytimeDays: -5,
      mode: 'SHEX',
      commencedAt: '2026-05-01T08:00:00Z',
      completedAt: '2026-05-06T08:00:00Z',
      demurrageRateUsdPerDay: 8000,
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('allowedLaytimeDays must be greater than 0');
    // NOTE: API route.ts:53-57 has guard — confirming it works
  });
});
