import { NextRequest } from 'next/server';
import { POST } from '../route';
import type { LaytimeInput } from '@/lib/types';

jest.mock('@/lib/csrf', () => ({
  validateCsrf: jest.fn(() => true),
}));

function makeRequest(body?: unknown): NextRequest {
  return new NextRequest('http://localhost/api/laytime/calculate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      origin: 'http://localhost:3000',
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

describe('POST /api/laytime/calculate', () => {
  const originalEnv = process.env.LAYTIME_ENGINE_ENABLED;

  afterEach(() => {
    process.env.LAYTIME_ENGINE_ENABLED = originalEnv;
  });

  // Input Contract: Feature flag disabled
  test('returns 503 when LAYTIME_ENGINE_ENABLED is not true', async () => {
    process.env.LAYTIME_ENGINE_ENABLED = 'false';
    const validInput: LaytimeInput = {
      allowedLaytimeDays: 5,
      mode: 'SHINC',
      commencedAt: '2026-05-12T00:00:00Z',
      completedAt: '2026-05-17T00:00:00Z',
    };
    const req = makeRequest(validInput);
    const res = await POST(req);
    expect(res.status).toBe(503);
  });

  test('returns 503 when LAYTIME_ENGINE_ENABLED is undefined', async () => {
    delete process.env.LAYTIME_ENGINE_ENABLED;
    const validInput: LaytimeInput = {
      allowedLaytimeDays: 5,
      mode: 'SHINC',
      commencedAt: '2026-05-12T00:00:00Z',
      completedAt: '2026-05-17T00:00:00Z',
    };
    const req = makeRequest(validInput);
    const res = await POST(req);
    expect(res.status).toBe(503);
  });

  // Input Contract: Invalid JSON body
  test('returns 400 on malformed JSON', async () => {
    process.env.LAYTIME_ENGINE_ENABLED = 'true';
    const req = new NextRequest('http://localhost/api/laytime/calculate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        origin: 'http://localhost:3000',
      },
      body: 'not valid json{',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('Invalid JSON');
  });

  // Input Contract: Missing required fields
  test('returns 400 when body is empty object', async () => {
    process.env.LAYTIME_ENGINE_ENABLED = 'true';
    const req = makeRequest({});
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBeDefined();
  });

  test('returns 400 when allowedLaytimeDays is missing', async () => {
    process.env.LAYTIME_ENGINE_ENABLED = 'true';
    const req = makeRequest({
      mode: 'SHINC',
      commencedAt: '2026-05-12T00:00:00Z',
      completedAt: '2026-05-17T00:00:00Z',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  test('returns 400 when mode is missing', async () => {
    process.env.LAYTIME_ENGINE_ENABLED = 'true';
    const req = makeRequest({
      allowedLaytimeDays: 5,
      commencedAt: '2026-05-12T00:00:00Z',
      completedAt: '2026-05-17T00:00:00Z',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  test('returns 400 when commencedAt is missing', async () => {
    process.env.LAYTIME_ENGINE_ENABLED = 'true';
    const req = makeRequest({
      allowedLaytimeDays: 5,
      mode: 'SHINC',
      completedAt: '2026-05-17T00:00:00Z',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  test('returns 400 when completedAt is missing', async () => {
    process.env.LAYTIME_ENGINE_ENABLED = 'true';
    const req = makeRequest({
      allowedLaytimeDays: 5,
      mode: 'SHINC',
      commencedAt: '2026-05-12T00:00:00Z',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  // Input Contract: allowedLaytimeDays <= 0
  test('returns 400 when allowedLaytimeDays is 0', async () => {
    process.env.LAYTIME_ENGINE_ENABLED = 'true';
    const req = makeRequest({
      allowedLaytimeDays: 0,
      mode: 'SHINC',
      commencedAt: '2026-05-12T00:00:00Z',
      completedAt: '2026-05-17T00:00:00Z',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  test('returns 400 when allowedLaytimeDays is negative', async () => {
    process.env.LAYTIME_ENGINE_ENABLED = 'true';
    const req = makeRequest({
      allowedLaytimeDays: -1,
      mode: 'SHINC',
      commencedAt: '2026-05-12T00:00:00Z',
      completedAt: '2026-05-17T00:00:00Z',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  // Input Contract: Invalid date formats
  test('returns 400 when commencedAt is invalid', async () => {
    process.env.LAYTIME_ENGINE_ENABLED = 'true';
    const req = makeRequest({
      allowedLaytimeDays: 5,
      mode: 'SHINC',
      commencedAt: 'not-a-date',
      completedAt: '2026-05-17T00:00:00Z',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  test('returns 400 when completedAt is invalid', async () => {
    process.env.LAYTIME_ENGINE_ENABLED = 'true';
    const req = makeRequest({
      allowedLaytimeDays: 5,
      mode: 'SHINC',
      commencedAt: '2026-05-12T00:00:00Z',
      completedAt: 'garbage',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  // Input Contract: Time ordering violation
  test('returns 400 when commencedAt > completedAt', async () => {
    process.env.LAYTIME_ENGINE_ENABLED = 'true';
    const req = makeRequest({
      allowedLaytimeDays: 5,
      mode: 'SHINC',
      commencedAt: '2026-05-17T00:00:00Z',
      completedAt: '2026-05-12T00:00:00Z',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  // Valid request
  test('returns 200 with LaytimeResult for valid SHINC request', async () => {
    process.env.LAYTIME_ENGINE_ENABLED = 'true';
    const validInput: LaytimeInput = {
      allowedLaytimeDays: 5,
      mode: 'SHINC',
      commencedAt: '2026-05-12T00:00:00Z',
      completedAt: '2026-05-17T00:00:00Z',
    };
    const req = makeRequest(validInput);
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.allowedLaytimeHours).toBe(120);
    expect(json.usedLaytimeHours).toBeGreaterThanOrEqual(0);
    expect(json.usedLaytimeHours).toBeLessThanOrEqual(200);
    expect(json.demurrageOrDespatch).toMatch(/^(demurrage|despatch|balanced)$/);
    expect(json.netHours).toBeDefined();
    expect(Array.isArray(json.breakdown)).toBe(true);
  });

  test('returns 200 with LaytimeResult for valid SHEX request with holidays', async () => {
    process.env.LAYTIME_ENGINE_ENABLED = 'true';
    const validInput: LaytimeInput = {
      allowedLaytimeDays: 5,
      mode: 'SHEX',
      commencedAt: '2026-05-12T00:00:00Z',
      completedAt: '2026-05-17T00:00:00Z',
      portHolidays: ['2026-05-13'],
    };
    const req = makeRequest(validInput);
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.allowedLaytimeHours).toBe(120);
    expect(Array.isArray(json.breakdown)).toBe(true);
    expect(json.breakdown.length).toBeGreaterThan(0);
  });

  test('returns 200 with LaytimeResult when weatherDelayHours is provided', async () => {
    process.env.LAYTIME_ENGINE_ENABLED = 'true';
    const validInput: LaytimeInput = {
      allowedLaytimeDays: 5,
      mode: 'SHINC',
      commencedAt: '2026-05-12T00:00:00Z',
      completedAt: '2026-05-17T00:00:00Z',
      weatherDelayHours: 10,
    };
    const req = makeRequest(validInput);
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.usedLaytimeHours).toBeLessThan(120);
  });

  // Expected Output Ranges
  test('usedLaytimeHours is non-negative in response', async () => {
    process.env.LAYTIME_ENGINE_ENABLED = 'true';
    const validInput: LaytimeInput = {
      allowedLaytimeDays: 5,
      mode: 'SHINC',
      commencedAt: '2026-05-12T00:00:00Z',
      completedAt: '2026-05-17T00:00:00Z',
    };
    const req = makeRequest(validInput);
    const res = await POST(req);
    const json = await res.json();
    expect(json.usedLaytimeHours).toBeGreaterThanOrEqual(0);
  });

  test('allowedLaytimeHours is positive in response', async () => {
    process.env.LAYTIME_ENGINE_ENABLED = 'true';
    const validInput: LaytimeInput = {
      allowedLaytimeDays: 5,
      mode: 'SHINC',
      commencedAt: '2026-05-12T00:00:00Z',
      completedAt: '2026-05-17T00:00:00Z',
    };
    const req = makeRequest(validInput);
    const res = await POST(req);
    const json = await res.json();
    expect(json.allowedLaytimeHours).toBeGreaterThan(0);
  });
});
