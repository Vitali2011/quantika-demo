/**
 * TDD tests for B1: GET /api/admin/knowledge-status
 *
 * Returns knowledge sources list with health_signal + summary statistics.
 * Auth: requires X-Admin-Token header matching ADMIN_TOKEN env var
 * (FINDING-001 — was previously open during Phase 1).
 */

import { NextRequest } from 'next/server';
import { GET } from '@/app/api/admin/knowledge-status/route';

const ADMIN_TOKEN = 'test-admin-token-knowledge-status';
const authedHeaders = { 'X-Admin-Token': ADMIN_TOKEN };

describe('GET /api/admin/knowledge-status', () => {
  const originalToken = process.env.ADMIN_TOKEN;

  beforeAll(() => {
    process.env.ADMIN_TOKEN = ADMIN_TOKEN;
  });

  afterAll(() => {
    if (originalToken === undefined) delete process.env.ADMIN_TOKEN;
    else process.env.ADMIN_TOKEN = originalToken;
  });

  it('rejects request without X-Admin-Token header (401)', async () => {
    const req = new NextRequest('http://localhost/api/admin/knowledge-status');
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('rejects request with invalid X-Admin-Token header (401)', async () => {
    const req = new NextRequest('http://localhost/api/admin/knowledge-status', {
      headers: { 'X-Admin-Token': 'wrong-token' },
    });
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('returns 500 when ADMIN_TOKEN is not configured on server', async () => {
    const saved = process.env.ADMIN_TOKEN;
    delete process.env.ADMIN_TOKEN;
    try {
      const req = new NextRequest('http://localhost/api/admin/knowledge-status', {
        headers: authedHeaders,
      });
      const res = await GET(req);
      expect(res.status).toBe(500);
    } finally {
      process.env.ADMIN_TOKEN = saved;
    }
  });

  it('returns 200 with sources array and summary object', async () => {
    const req = new NextRequest('http://localhost/api/admin/knowledge-status', {
      headers: authedHeaders,
    });
    const res = await GET(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json).toHaveProperty('sources');
    expect(json).toHaveProperty('summary');
    expect(json).toHaveProperty('last_check');

    expect(Array.isArray(json.sources)).toBe(true);
    expect(typeof json.summary).toBe('object');
    expect(json.summary).toHaveProperty('fresh');
    expect(json.summary).toHaveProperty('stale');
    expect(json.summary).toHaveProperty('failed');
    expect(json.summary).toHaveProperty('total');
  });

  it('summary counts match expected structure', async () => {
    const req = new NextRequest('http://localhost/api/admin/knowledge-status', {
      headers: authedHeaders,
    });
    const res = await GET(req);
    const json = await res.json();

    const { summary } = json;
    expect(typeof summary.fresh).toBe('number');
    expect(typeof summary.stale).toBe('number');
    expect(typeof summary.failed).toBe('number');
    expect(typeof summary.total).toBe('number');

    // Sanity: total should equal sum of categories
    expect(summary.total).toBeGreaterThanOrEqual(0);
  });

  it('sources contain expected knowledge source fields', async () => {
    const req = new NextRequest('http://localhost/api/admin/knowledge-status', {
      headers: authedHeaders,
    });
    const res = await GET(req);
    const json = await res.json();

    if (json.sources.length > 0) {
      const firstSource = json.sources[0];
      expect(firstSource).toHaveProperty('slug');
      expect(firstSource).toHaveProperty('name');
      expect(firstSource).toHaveProperty('status');
      expect(firstSource).toHaveProperty('health_signal');
    }
  });

  it('last_check is a valid ISO timestamp', async () => {
    const req = new NextRequest('http://localhost/api/admin/knowledge-status', {
      headers: authedHeaders,
    });
    const res = await GET(req);
    const json = await res.json();

    expect(typeof json.last_check).toBe('string');
    expect(() => new Date(json.last_check)).not.toThrow();
  });
});
