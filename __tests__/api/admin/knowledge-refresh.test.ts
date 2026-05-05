/**
 * TDD tests for B4: POST /api/admin/knowledge/refresh
 *
 * Manual trigger endpoint for refreshing knowledge sources.
 * Validates slug against KNOWLEDGE_REGISTRY whitelist (security-critical).
 * Returns 202 Accepted immediately after spawning background refresh process.
 */

import { NextRequest } from 'next/server';
import { POST } from '@/app/api/admin/knowledge/refresh/route';
import { KNOWLEDGE_REGISTRY } from '@/lib/knowledge/bootstrap';

describe('POST /api/admin/knowledge/refresh', () => {
  // Input Contract: Empty/falsy slug
  it('returns 400 when slug is missing', async () => {
    const req = new NextRequest('http://localhost/api/admin/knowledge/refresh', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'content-type': 'application/json' },
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
      headers: { 'content-type': 'application/json' },
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
      headers: { 'content-type': 'application/json' },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  // Input Contract: Non-string slug
  it('returns 400 when slug is not a string', async () => {
    const req = new NextRequest('http://localhost/api/admin/knowledge/refresh', {
      method: 'POST',
      body: JSON.stringify({ slug: 123 }),
      headers: { 'content-type': 'application/json' },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  // Input Contract: Unknown slug (not in KNOWLEDGE_REGISTRY)
  it('returns 400 when slug is not in KNOWLEDGE_REGISTRY', async () => {
    const req = new NextRequest('http://localhost/api/admin/knowledge/refresh', {
      method: 'POST',
      body: JSON.stringify({ slug: 'unknown-source-not-in-registry' }),
      headers: { 'content-type': 'application/json' },
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
      headers: { 'content-type': 'application/json' },
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
        headers: { 'content-type': 'application/json' },
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
      headers: { 'content-type': 'application/json' },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  // Security: Shell injection attempt in slug
  it('rejects slug with shell injection pattern', async () => {
    const req = new NextRequest('http://localhost/api/admin/knowledge/refresh', {
      method: 'POST',
      body: JSON.stringify({ slug: 'ofac && rm -rf /' }),
      headers: { 'content-type': 'application/json' },
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
      headers: { 'content-type': 'application/json' },
    });
    const res = await POST(req);
    const json = await res.json();

    expect(json).toHaveProperty('message');
    expect(typeof json.message).toBe('string');
  });
});
