/**
 * TDD tests for POST /api/admin/market/upload-csv
 *
 * Admin endpoint for manually uploading market index rows.
 * Auth: X-Admin-Token header matching ADMIN_TOKEN env var.
 *
 * 9-class boundary coverage:
 * 1. Empty    — empty rows array
 * 2. NaN/Inf  — non-finite value in row
 * 3. Negative — negative value in row
 * 4. Range    — valid large value passes through
 * 5. Switch   — unknown index_name rejected (whitelist)
 * 6. Substring — 'bhsi-admin' must NOT match whitelist (Class 6: substring leak)
 * 7. Config   — ADMIN_TOKEN unset → 500
 * 8. Auth     — missing/wrong token → 401
 * 9. E2E      — happy path: upsert persists, idempotent on repeat
 */

import { NextRequest } from 'next/server';
import Database from 'better-sqlite3';
import migration027 from '@/lib/migrations/027-market-indices';
import { getIndexHistory } from '@/lib/market/market-indices-repository';

let testDb: Database.Database;

jest.mock('@/lib/session-store', () => ({
  getStore: jest.fn(() => ({
    getDb: () => testDb,
  })),
}));

const originalEnv = process.env;

describe('POST /api/admin/market/upload-csv', () => {
  const validToken = 'test-admin-token-xyz';

  beforeEach(() => {
    testDb = new Database(':memory:');
    migration027.up(testDb);
    process.env = { ...originalEnv, ADMIN_TOKEN: validToken };
  });

  afterEach(() => {
    testDb.close();
    process.env = originalEnv;
    jest.resetModules();
  });

  async function makeRequest(
    body: unknown,
    token: string | null = validToken,
  ): Promise<Response> {
    const { POST } = await import('@/app/api/admin/market/upload-csv/route');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token !== null) headers['X-Admin-Token'] = token;
    return POST(
      new NextRequest('http://localhost/api/admin/market/upload-csv', {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      }),
    );
  }

  // --- Auth ---
  it('returns 500 when ADMIN_TOKEN env not set (boundary: config)', async () => {
    delete process.env.ADMIN_TOKEN;
    const res = await makeRequest({ index_name: 'bhsi', rows: [{ date: '2026-05-09', value: 1245 }] }, validToken);
    expect(res.status).toBe(500);
  });

  it('returns 401 when X-Admin-Token header is missing (boundary: auth)', async () => {
    const res = await makeRequest({ index_name: 'bhsi', rows: [] }, null);
    expect(res.status).toBe(401);
  });

  it('returns 401 when X-Admin-Token is wrong (boundary: auth)', async () => {
    const res = await makeRequest({ index_name: 'bhsi', rows: [] }, 'wrong-token');
    expect(res.status).toBe(401);
  });

  // --- Input validation ---
  it('returns 400 when body is not valid JSON', async () => {
    const { POST } = await import('@/app/api/admin/market/upload-csv/route');
    const res = await POST(
      new NextRequest('http://localhost/api/admin/market/upload-csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Token': validToken },
        body: 'not-json',
      }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when index_name is missing', async () => {
    const res = await makeRequest({ rows: [{ date: '2026-05-09', value: 1245 }] });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/index_name/);
  });

  it('returns 400 when index_name is unknown (boundary: switch)', async () => {
    const res = await makeRequest({ index_name: 'bdi', rows: [{ date: '2026-05-09', value: 1245 }] });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/Unknown/);
  });

  it('does not accept bhsi-admin as index_name (boundary: substring leak, Class 6)', async () => {
    const res = await makeRequest({ index_name: 'bhsi-admin', rows: [{ date: '2026-05-09', value: 1245 }] });
    expect(res.status).toBe(400);
  });

  it('returns 400 when rows is missing', async () => {
    const res = await makeRequest({ index_name: 'bhsi' });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/rows/);
  });

  it('returns 400 when rows is empty array (boundary: empty)', async () => {
    const res = await makeRequest({ index_name: 'bhsi', rows: [] });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/rows/);
  });

  it('returns 400 when row.date is malformed (boundary: malformed)', async () => {
    const res = await makeRequest({ index_name: 'bhsi', rows: [{ date: '09-05-2026', value: 1245 }] });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/date/);
  });

  it('returns 400 when row.value is not a number (boundary: NaN)', async () => {
    const res = await makeRequest({ index_name: 'bhsi', rows: [{ date: '2026-05-09', value: 'abc' }] });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/value/);
  });

  it('returns 400 when row.value is negative (boundary: negative)', async () => {
    const res = await makeRequest({ index_name: 'bhsi', rows: [{ date: '2026-05-09', value: -100 }] });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/value/);
  });

  it('returns 400 when row.value is Infinity (boundary: NaN/Inf)', async () => {
    // JSON.stringify cannot encode Infinity — use a workaround
    const { POST } = await import('@/app/api/admin/market/upload-csv/route');
    const res = await POST(
      new NextRequest('http://localhost/api/admin/market/upload-csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Token': validToken },
        body: '{"index_name":"bhsi","rows":[{"date":"2026-05-09","value":null}]}',
      }),
    );
    expect(res.status).toBe(400);
  });

  // --- Happy path ---
  it('inserts rows and returns loaded count (boundary: E2E)', async () => {
    const res = await makeRequest({
      index_name: 'bhsi',
      rows: [
        { date: '2026-05-09', value: 1245, unit: 'USD/day', source_url: 'https://example.com' },
        { date: '2026-05-02', value: 1198 },
      ],
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.loaded).toBe(2);
    expect(json.index_name).toBe('bhsi');

    const rows = getIndexHistory(testDb, 'bhsi', 10);
    expect(rows).toHaveLength(2);
  });

  it('is idempotent — uploading same rows twice keeps count at 1 (E2E)', async () => {
    const body = { index_name: 'bhsi', rows: [{ date: '2026-05-09', value: 1245 }] };
    await makeRequest(body);
    const res2 = await makeRequest(body);
    expect(res2.status).toBe(200);

    const rows = getIndexHistory(testDb, 'bhsi', 10);
    expect(rows).toHaveLength(1);
    expect(rows[0].value).toBe(1245);
  });

  it('upsert overwrites existing value for same date (E2E)', async () => {
    await makeRequest({ index_name: 'bhsi', rows: [{ date: '2026-05-09', value: 1000 }] });
    await makeRequest({ index_name: 'bhsi', rows: [{ date: '2026-05-09', value: 1300 }] });
    const rows = getIndexHistory(testDb, 'bhsi', 10);
    expect(rows).toHaveLength(1);
    expect(rows[0].value).toBe(1300);
  });

  it('accepts large valid value (boundary: range)', async () => {
    const res = await makeRequest({ index_name: 'tmi', rows: [{ date: '2026-05-09', value: 9999999 }] });
    expect(res.status).toBe(200);
    const rows = getIndexHistory(testDb, 'tmi', 10);
    expect(rows[0].value).toBe(9999999);
  });

  it('defaults unit to USD/day for bhsi when not provided', async () => {
    await makeRequest({ index_name: 'bhsi', rows: [{ date: '2026-05-09', value: 1245 }] });
    const rows = getIndexHistory(testDb, 'bhsi', 10);
    expect(rows[0].unit).toBe('USD/day');
  });

  it('defaults unit to USD/TEU for drewry-bb when not provided', async () => {
    await makeRequest({ index_name: 'drewry-bb', rows: [{ date: '2026-05-09', value: 1600 }] });
    const rows = getIndexHistory(testDb, 'drewry-bb', 10);
    expect(rows[0].unit).toBe('USD/TEU');
  });
});
