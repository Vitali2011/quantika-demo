/**
 * Tests for GET and POST /api/audit
 *
 * Auth: requireSession for both verbs.
 * CSRF: POST uses checkCsrfRequest (double-submit cookie pattern).
 * DB: uses getStore().getDatabase(), migration_002 for audit_events table.
 */

import Database from 'better-sqlite3';
import { NextRequest, NextResponse } from 'next/server';
import migration002 from '@/lib/migrations/002-audit-events';

let testDb: Database.Database;

jest.mock('@/lib/session-store', () => ({
  getStore: jest.fn(() => ({
    getDatabase: () => testDb,
  })),
}));

jest.mock('@/lib/session', () => ({
  requireSession: jest.fn(),
}));

jest.mock('@/lib/csrf', () => ({
  checkCsrfRequest: jest.fn(() => true),
}));

import { requireSession } from '@/lib/session';
import { checkCsrfRequest } from '@/lib/csrf';
const mockRequireSession = requireSession as jest.Mock;
const mockCheckCsrf = checkCsrfRequest as jest.Mock;

const OWN_SESSION_ID = 'test-sid-123';

// Import route once at the top level (no jest.resetModules needed — no feature-flag cache here)
import { GET, POST } from '@/app/api/audit/route';

describe('GET /api/audit', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    migration002.up(db);
    testDb = db;

    // Default: valid session
    mockRequireSession.mockReturnValue({ session: {}, sessionId: OWN_SESSION_ID });
    mockCheckCsrf.mockReturnValue(true);
  });

  afterEach(() => {
    db.close();
  });

  it('returns 401 when no session cookie', async () => {
    mockRequireSession.mockReturnValue(NextResponse.json({ error: 'No session' }, { status: 401 }));
    const req = new NextRequest('http://localhost/api/audit');
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('returns 400 when both inquiryId and sessionId params are missing', async () => {
    const req = new NextRequest('http://localhost/api/audit');
    const res = await GET(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/inquiryId or sessionId/i);
  });

  it('returns 403 when sessionId param does not match own sessionId', async () => {
    const req = new NextRequest('http://localhost/api/audit?sessionId=other-session-id');
    const res = await GET(req);
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe('Forbidden');
  });
});

describe('POST /api/audit', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    migration002.up(db);
    testDb = db;

    mockRequireSession.mockReturnValue({ session: {}, sessionId: OWN_SESSION_ID });
    mockCheckCsrf.mockReturnValue(true);
  });

  afterEach(() => {
    db.close();
  });

  it('returns 403 when CSRF check fails', async () => {
    mockCheckCsrf.mockReturnValue(false);
    const req = new NextRequest('http://localhost/api/audit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actor: 'user', action: 'confirmed' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe('CSRF validation failed');
  });

  it('returns 201 with id and timestamp for valid body', async () => {
    const req = new NextRequest('http://localhost/api/audit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actor: 'user', action: 'confirmed', inquiryId: 'inq-001' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(typeof json.id).toBe('string');
    expect(json.id.length).toBeGreaterThan(0);
    expect(typeof json.timestamp).toBe('string');
  });
});
