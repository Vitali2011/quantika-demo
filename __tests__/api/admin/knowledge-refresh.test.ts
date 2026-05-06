/**
 * TDD tests for B4: POST /api/admin/knowledge/refresh
 *
 * Manual trigger endpoint for refreshing knowledge sources.
 * Validates slug against KNOWLEDGE_REGISTRY whitelist (security-critical).
 * Returns 202 Accepted immediately after spawning background refresh process.
 *
 * Auth (FINDING-001): requires X-Admin-Token header matching ADMIN_TOKEN env var.
 */

import { NextRequest } from 'next/server';
import { POST } from '@/app/api/admin/knowledge/refresh/route';
import { KNOWLEDGE_REGISTRY } from '@/lib/knowledge/bootstrap';

const ADMIN_TOKEN = 'test-admin-token-knowledge-refresh';

function authedHeaders(extra: Record<string, string> = {}) {
  return {
    'content-type': 'application/json',
    'X-Admin-Token': ADMIN_TOKEN,
    ...extra,
  };
}

describe('POST /api/admin/knowledge/refresh', () => {
  const originalToken = process.env.ADMIN_TOKEN;

  beforeAll(() => {
    process.env.ADMIN_TOKEN = ADMIN_TOKEN;
  });

  afterAll(() => {
    if (originalToken === undefined) delete process.env.ADMIN_TOKEN;
    else process.env.ADMIN_TOKEN = originalToken;
  });

  // Auth (FINDING-001)
  it('rejects request without X-Admin-Token header (401)', async () => {
    const req = new NextRequest('http://localhost/api/admin/knowledge/refresh', {
      method: 'POST',
      body: JSON.stringify({ slug: KNOWLEDGE_REGISTRY[0].slug }),
      headers: { 'content-type': 'application/json' },
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('rejects request with invalid X-Admin-Token header (401)', async () => {
    const req = new NextRequest('http://localhost/api/admin/knowledge/refresh', {
      method: 'POST',
      body: JSON.stringify({ slug: KNOWLEDGE_REGISTRY[0].slug }),
      headers: { 'content-type': 'application/json', 'X-Admin-Token': 'wrong-token' },
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  // Input Contract: Empty/falsy slug
  it('returns 400 when slug is missing', async () => {
    const req = new NextRequest('http://localhost/api/admin/knowledge/refresh', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: authedHeaders(),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBeDefined();
  });

  it('returns 400 when slug is empty string', async () => {
    const req = new NextRequest('http://localhost/api/admin/knowledge/refresh', {
      method: 'POST',
      body: JSON.stringify({ slug: '' }),
      headers: authedHeaders(),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/slug.*required|invalid/i);
  });

  it('returns 400 when slug is null', async () => {
    const req = new NextRequest('http://localhost/api/admin/knowledge/refresh', {
      method: 'POST',
      body: JSON.stringify({ slug: null }),
      headers: authedHeaders(),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  // Input Contract: Non-string slug
  it('returns 400 when slug is not a string', async () => {
    const req = new NextRequest('http://localhost/api/admin/knowledge/refresh', {
      method: 'POST',
      body: JSON.stringify({ slug: 123 }),
      headers: authedHeaders(),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  // Input Contract: Unknown slug (not in KNOWLEDGE_REGISTRY)
  it('returns 400 when slug is not in KNOWLEDGE_REGISTRY', async () => {
    const req = new NextRequest('http://localhost/api/admin/knowledge/refresh', {
      method: 'POST',
      body: JSON.stringify({ slug: 'unknown-source-not-in-registry' }),
      headers: authedHeaders(),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/unknown.*slug|not.*found|invalid/i);
  });

  // Happy path: Valid slug
  it('returns 202 Accepted with sync_log_id for valid slug', async () => {
    // Use first slug from registry (should be 'ofac')
    const validSlug = KNOWLEDGE_REGISTRY[0].slug;

    const req = new NextRequest('http://localhost/api/admin/knowledge/refresh', {
      method: 'POST',
      body: JSON.stringify({ slug: validSlug }),
      headers: authedHeaders(),
    });
    const res = await POST(req);
    expect(res.status).toBe(202);

    const json = await res.json();
    expect(json).toHaveProperty('sync_log_id');
    expect(json).toHaveProperty('slug');
    expect(json).toHaveProperty('status');
    expect(json.slug).toBe(validSlug);
    expect(json.status).toBe('started');
    expect(typeof json.sync_log_id).toBe('number');
    expect(json.sync_log_id).toBeGreaterThan(0);
  });

  // Whitelist validation: Another valid slug
  it('accepts any slug from KNOWLEDGE_REGISTRY', async () => {
    // Test with second slug if available
    if (KNOWLEDGE_REGISTRY.length > 1) {
      const validSlug = KNOWLEDGE_REGISTRY[1].slug;

      const req = new NextRequest('http://localhost/api/admin/knowledge/refresh', {
        method: 'POST',
        body: JSON.stringify({ slug: validSlug }),
        headers: authedHeaders(),
      });
      const res = await POST(req);
      expect(res.status).toBe(202);

      const json = await res.json();
      expect(json.slug).toBe(validSlug);
    }
  });

  // Security: SQL injection attempt in slug
  it('rejects slug with SQL injection pattern', async () => {
    const req = new NextRequest('http://localhost/api/admin/knowledge/refresh', {
      method: 'POST',
      body: JSON.stringify({ slug: "ofac'; DROP TABLE knowledge_sources; --" }),
      headers: authedHeaders(),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  // Security: Shell injection attempt in slug
  it('rejects slug with shell injection pattern', async () => {
    const req = new NextRequest('http://localhost/api/admin/knowledge/refresh', {
      method: 'POST',
      body: JSON.stringify({ slug: 'ofac && rm -rf /' }),
      headers: authedHeaders(),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  // Response structure validation
  it('response includes message field', async () => {
    const validSlug = KNOWLEDGE_REGISTRY[0].slug;

    const req = new NextRequest('http://localhost/api/admin/knowledge/refresh', {
      method: 'POST',
      body: JSON.stringify({ slug: validSlug }),
      headers: authedHeaders(),
    });
    const res = await POST(req);
    const json = await res.json();

    expect(json).toHaveProperty('message');
    expect(typeof json.message).toBe('string');
  });
});
