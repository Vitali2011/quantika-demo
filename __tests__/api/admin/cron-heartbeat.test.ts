/**
 * TDD tests for C7: POST /api/admin/cron-heartbeat
 *
 * Heartbeat endpoint for cron jobs to report successful execution.
 * Stores (cron_name, last_seen_at) in knowledge_sources.metadata for
 * cron_name='sanctions-daily'.
 *
 * Auth: requires X-Cron-Secret header matching CRON_SECRET env var.
 */

import { NextRequest } from 'next/server';
import { POST } from '@/app/api/admin/cron-heartbeat/route';
import { getStore } from '@/lib/session-store';

describe('POST /api/admin/cron-heartbeat', () => {
  const validSecret = process.env.CRON_SECRET || 'test-cron-secret-12345';
  const validCronName = 'sanctions-daily';

  beforeAll(() => {
    // Ensure CRON_SECRET is set for tests
    process.env.CRON_SECRET = validSecret;
  });

  it('rejects request without X-Cron-Secret header (401)', async () => {
    const req = new NextRequest('http://localhost/api/admin/cron-heartbeat', {
      method: 'POST',
      body: JSON.stringify({ cron_name: validCronName }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('rejects request with invalid X-Cron-Secret header (401)', async () => {
    const req = new NextRequest('http://localhost/api/admin/cron-heartbeat', {
      method: 'POST',
      headers: { 'X-Cron-Secret': 'wrong-secret' },
      body: JSON.stringify({ cron_name: validCronName }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('rejects request with empty cron_name (400)', async () => {
    const req = new NextRequest('http://localhost/api/admin/cron-heartbeat', {
      method: 'POST',
      headers: { 'X-Cron-Secret': validSecret },
      body: JSON.stringify({ cron_name: '' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('rejects request with missing cron_name (400)', async () => {
    const req = new NextRequest('http://localhost/api/admin/cron-heartbeat', {
      method: 'POST',
      headers: { 'X-Cron-Secret': validSecret },
      body: JSON.stringify({}),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('rejects request with null cron_name (400)', async () => {
    const req = new NextRequest('http://localhost/api/admin/cron-heartbeat', {
      method: 'POST',
      headers: { 'X-Cron-Secret': validSecret },
      body: JSON.stringify({ cron_name: null }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('accepts valid request and stores heartbeat timestamp (200)', async () => {
    const req = new NextRequest('http://localhost/api/admin/cron-heartbeat', {
      method: 'POST',
      headers: { 'X-Cron-Secret': validSecret },
      body: JSON.stringify({ cron_name: validCronName }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json).toHaveProperty('ok', true);
    expect(json).toHaveProperty('cron_name', validCronName);
    expect(json).toHaveProperty('last_seen_at');
    expect(typeof json.last_seen_at).toBe('string');
  });

  it('updates heartbeat timestamp on duplicate calls in same minute', async () => {
    const req1 = new NextRequest('http://localhost/api/admin/cron-heartbeat', {
      method: 'POST',
      headers: { 'X-Cron-Secret': validSecret },
      body: JSON.stringify({ cron_name: 'test-cron-duplicate' }),
    });

    const res1 = await POST(req1);
    expect(res1.status).toBe(200);
    const json1 = await res1.json();
    const firstTimestamp = json1.last_seen_at;

    // Wait 10ms to ensure different timestamp
    await new Promise((resolve) => setTimeout(resolve, 10));

    const req2 = new NextRequest('http://localhost/api/admin/cron-heartbeat', {
      method: 'POST',
      headers: { 'X-Cron-Secret': validSecret },
      body: JSON.stringify({ cron_name: 'test-cron-duplicate' }),
    });

    const res2 = await POST(req2);
    expect(res2.status).toBe(200);
    const json2 = await res2.json();
    const secondTimestamp = json2.last_seen_at;

    // Second timestamp should be different (updated)
    expect(secondTimestamp).not.toBe(firstTimestamp);
  });

  // FINDING-003: unknown source slug → 404 (was silent 200 with changes=0)
  it('returns 404 when target source row does not exist (FINDING-003)', async () => {
    const db = getStore().getDb();

    // Snapshot existing 'ofac' row (bootstrap usually seeds it during test runs)
    const snapshot = db
      .prepare('SELECT * FROM knowledge_sources WHERE slug = ?')
      .get('ofac') as any | undefined;

    // Remove the canonical ofac source so UPDATE will affect 0 rows
    db.prepare('DELETE FROM knowledge_sources WHERE slug = ?').run('ofac');

    try {
      const req = new NextRequest('http://localhost/api/admin/cron-heartbeat', {
        method: 'POST',
        headers: { 'X-Cron-Secret': validSecret },
        body: JSON.stringify({ cron_name: validCronName }),
      });

      const res = await POST(req);
      expect(res.status).toBe(404);

      const json = await res.json();
      expect(json.error).toMatch(/unknown.*slug|bootstrap/i);
      expect(json.slug).toBe('ofac');
      expect(json.cron_name).toBe(validCronName);
    } finally {
      // Restore snapshot so subsequent tests / suites are not affected
      if (snapshot) {
        const cols = Object.keys(snapshot);
        const placeholders = cols.map(() => '?').join(', ');
        db.prepare(
          `INSERT INTO knowledge_sources (${cols.join(', ')}) VALUES (${placeholders})`,
        ).run(...cols.map((c) => snapshot[c]));
      }
    }
  });

  it('stores heartbeat in knowledge_sources.metadata for sanctions-daily', async () => {
    const db = getStore().getDb();

    // First, ensure the source exists (it should from bootstrap or previous specs)
    // If not, we'll just verify the heartbeat was attempted to be stored
    const req = new NextRequest('http://localhost/api/admin/cron-heartbeat', {
      method: 'POST',
      headers: { 'X-Cron-Secret': validSecret },
      body: JSON.stringify({ cron_name: validCronName }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    // Try to read from knowledge_sources metadata
    const source = db.prepare(`
      SELECT metadata FROM knowledge_sources WHERE slug = ?
    `).get('ofac') as any;

    if (source) {
      const metadata = source.metadata ? JSON.parse(source.metadata) : {};
      // The endpoint should store cron heartbeats in a structure like:
      // { cron_heartbeats: { 'sanctions-daily': '2024-01-01T00:00:00Z' } }
      expect(metadata).toHaveProperty('cron_heartbeats');
      if (metadata.cron_heartbeats) {
        expect(metadata.cron_heartbeats).toHaveProperty(validCronName);
      }
    }
  });
});
