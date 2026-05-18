/**
 * Tests for GET /api/health
 *
 * Returns system health status with session count, uptime, and version.
 * No auth required.
 */

import { NextResponse } from 'next/server';

const mockGetSessionCount = jest.fn(() => 3);

jest.mock('@/lib/session-store', () => ({
  getStore: jest.fn(() => ({
    getSessionCount: () => mockGetSessionCount(),
  })),
}));

describe('GET /api/health', () => {
  beforeEach(() => {
    mockGetSessionCount.mockReturnValue(3);
    jest.resetModules();
  });

  it('returns 200 with status ok, sessions count, uptime, and version', async () => {
    const { GET } = await import('@/app/api/health/route');
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe('ok');
    expect(json.sessions).toBe(3);
    expect(typeof json.uptime).toBe('number');
    expect(json.version).toBeDefined();
  });

  it('version is 0.1.0', async () => {
    const { GET } = await import('@/app/api/health/route');
    const res = await GET();
    const json = await res.json();
    expect(json.version).toBe('0.1.0');
  });

  it('returns 500 with status error when getSessionCount throws', async () => {
    // Override to throw
    jest.doMock('@/lib/session-store', () => ({
      getStore: jest.fn(() => ({
        getSessionCount: () => { throw new Error('db error'); },
      })),
    }));
    const { GET } = await import('@/app/api/health/route');
    const res = await GET();
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.status).toBe('error');
  });
});
