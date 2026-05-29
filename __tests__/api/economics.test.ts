/**
 * Tests for POST /api/economics
 *
 * No auth. Uses CSRF (validateCsrf). Calls computeEconomics (mocked).
 * Has in-process cache — reset modules between tests to avoid state leaking.
 * Uses jest.doMock after jest.resetModules so mocks survive module re-import.
 */

import { NextRequest } from 'next/server';

const validBody = {
  route: { fromPort: 'Rotterdam', toPort: 'Singapore' },
  vessel: { dwt: 50000, vesselType: 'bulker' },
  cargo: { description: 'Iron ore', quantity: 40000 },
};

describe('POST /api/economics', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('returns 403 when CSRF check fails', async () => {
    jest.doMock('@/lib/csrf', () => ({ validateCsrf: jest.fn(() => false) }));
    jest.doMock('@/lib/economics/index', () => ({ computeEconomics: jest.fn() }));
    const { POST } = await import('@/app/api/economics/route');
    const req = new NextRequest('http://localhost/api/economics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validBody),
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe('Forbidden');
  });

  it('returns 400 when route.fromPort is missing', async () => {
    jest.doMock('@/lib/csrf', () => ({ validateCsrf: jest.fn(() => true) }));
    jest.doMock('@/lib/economics/index', () => ({ computeEconomics: jest.fn() }));
    const { POST } = await import('@/app/api/economics/route');
    const req = new NextRequest('http://localhost/api/economics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        route: { toPort: 'Singapore' },
        vessel: {},
        cargo: {},
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/route\.fromPort/);
  });

  it('returns 500 when computeEconomics throws', async () => {
    jest.doMock('@/lib/csrf', () => ({ validateCsrf: jest.fn(() => true) }));
    jest.doMock('@/lib/economics/index', () => ({
      computeEconomics: jest.fn().mockRejectedValue(new Error('external API failure')),
    }));
    const { POST } = await import('@/app/api/economics/route');
    const req = new NextRequest('http://localhost/api/economics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validBody),
    });
    const res = await POST(req);
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toMatch(/Economics calculation failed/i);
    // L-8: the raw internal error message must NOT be reflected to the client.
    expect(json.detail).toBeUndefined();
    expect(JSON.stringify(json)).not.toMatch(/external API failure/i);
  });

  it('returns 200 with mocked result on happy path', async () => {
    const mockedResult = { tce: 18000, voyageDays: 25, totalRevenue: 450000 };
    jest.doMock('@/lib/csrf', () => ({ validateCsrf: jest.fn(() => true) }));
    jest.doMock('@/lib/economics/index', () => ({
      computeEconomics: jest.fn().mockResolvedValue(mockedResult),
    }));
    const { POST } = await import('@/app/api/economics/route');
    const req = new NextRequest('http://localhost/api/economics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validBody),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.tce).toBe(18000);
    expect(json.voyageDays).toBe(25);
  });
});
