/**
 * API Tests for /api/laytime/calculate
 * Spec: gamma-05 (laytime engine), gamma-07 (demurrage/despatch)
 */

import { POST } from '@/app/api/laytime/calculate/route';
import { NextRequest } from 'next/server';

// Mock CSRF validation
jest.mock('@/lib/csrf', () => ({
  validateCsrf: jest.fn(() => true),
}));

function createRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/api/laytime/calculate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

describe('POST /api/laytime/calculate', () => {
  const originalEnv = process.env.LAYTIME_ENGINE_ENABLED;

  beforeEach(() => {
    process.env.LAYTIME_ENGINE_ENABLED = 'true';
  });

  afterEach(() => {
    process.env.LAYTIME_ENGINE_ENABLED = originalEnv;
  });

  describe('laytime calculation (γ-05 baseline)', () => {
    test('returns laytime result without D/D when demurrageRate not provided', async () => {
      const request = createRequest({
        allowedLaytimeDays: 5,
        mode: 'SHEX',
        commencedAt: '2026-05-01T08:00:00Z',
        completedAt: '2026-05-06T08:00:00Z',
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.allowedLaytimeHours).toBe(120);
      expect(data.usedLaytimeHours).toBeDefined();
      expect(data.netHours).toBeDefined();
      expect(data.demurrageOrDespatch).toBeDefined();
      expect(data.dd).toBeUndefined(); // No D/D calculated
    });
  });

  describe('demurrage/despatch calculation (γ-07)', () => {
    test('returns D/D result when demurrageRate is provided', async () => {
      // 2026-05-04 Mon 08:00 → 2026-05-09 Sat 20:00 = 5d 12h = 132h (no Sundays)
      // allowed = 5d = 120h → demurrage = 12h
      const request = createRequest({
        allowedLaytimeDays: 5,
        mode: 'SHEX',
        commencedAt: '2026-05-04T08:00:00Z',
        completedAt: '2026-05-09T20:00:00Z',
        demurrageRateUsdPerDay: 8000,
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.dd).toBeDefined();
      expect(data.dd.status).toBe('demurrage');
      expect(data.dd.demurrageAmount).toBeGreaterThan(0);
      expect(data.dd.despatchAmount).toBe(0);
      expect(data.dd.netAmount).toBeGreaterThan(0);
      expect(data.dd.breakdown.demurrageRate).toBe(8000);
      expect(data.dd.breakdown.despatchRate).toBe(4000); // default = half
    });

    test('calculates despatch when completed early', async () => {
      // 2026-05-04 Mon 08:00 → 2026-05-08 Fri 08:00 = 4d = 96h (no Sundays)
      // allowed = 5d = 120h → despatch = 24h
      const request = createRequest({
        allowedLaytimeDays: 5,
        mode: 'SHEX',
        commencedAt: '2026-05-04T08:00:00Z',
        completedAt: '2026-05-08T08:00:00Z',
        demurrageRateUsdPerDay: 10000,
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.dd).toBeDefined();
      expect(data.dd.status).toBe('despatch');
      expect(data.dd.demurrageAmount).toBe(0);
      expect(data.dd.despatchAmount).toBeGreaterThan(0);
      expect(data.dd.netAmount).toBeLessThan(0); // negative = you earn
    });

    test('accepts custom despatchRate', async () => {
      const request = createRequest({
        allowedLaytimeDays: 5,
        mode: 'SHEX',
        commencedAt: '2026-05-04T08:00:00Z',
        completedAt: '2026-05-08T08:00:00Z',
        demurrageRateUsdPerDay: 10000,
        despatchRateUsdPerDay: 7000,
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.dd.breakdown.despatchRate).toBe(7000);
    });
  });

  describe('validation - demurrageRate boundary checks', () => {
    test('rejects NaN demurrageRate', async () => {
      const request = createRequest({
        allowedLaytimeDays: 5,
        mode: 'SHEX',
        commencedAt: '2026-05-01T08:00:00Z',
        completedAt: '2026-05-06T08:00:00Z',
        demurrageRateUsdPerDay: NaN,
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('demurrageRateUsdPerDay must be a finite number');
    });

    test('rejects Infinity demurrageRate', async () => {
      const request = createRequest({
        allowedLaytimeDays: 5,
        mode: 'SHEX',
        commencedAt: '2026-05-01T08:00:00Z',
        completedAt: '2026-05-06T08:00:00Z',
        demurrageRateUsdPerDay: Infinity,
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('demurrageRateUsdPerDay must be a finite number');
    });

    test('rejects NaN despatchRate', async () => {
      const request = createRequest({
        allowedLaytimeDays: 5,
        mode: 'SHEX',
        commencedAt: '2026-05-01T08:00:00Z',
        completedAt: '2026-05-06T08:00:00Z',
        demurrageRateUsdPerDay: 8000,
        despatchRateUsdPerDay: NaN,
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('despatchRateUsdPerDay must be a finite number');
    });
  });

  describe('feature flag gate', () => {
    test('returns 503 when LAYTIME_ENGINE_ENABLED is false', async () => {
      process.env.LAYTIME_ENGINE_ENABLED = 'false';

      const request = createRequest({
        allowedLaytimeDays: 5,
        mode: 'SHEX',
        commencedAt: '2026-05-01T08:00:00Z',
        completedAt: '2026-05-06T08:00:00Z',
        demurrageRateUsdPerDay: 8000,
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(data.error).toBe('Laytime Engine is not enabled');
    });
  });
});
