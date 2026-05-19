/**
 * Regression test — DELETE /api/matches/bulk with empty ids (M-4 hardening).
 *
 * Current behaviour is correct (400) but had no explicit test guarding it.
 * A future refactor must not regress this to a 200 / 500 / no-op.
 */

import Database from 'better-sqlite3';
import { NextRequest, NextResponse } from 'next/server';
import migration032 from '@/lib/migrations/032-matches';
import { requireSession } from '@/lib/session';
import { requireAdmin } from '@/lib/auth/admin';

let testDb: Database.Database;

jest.mock('@/lib/session-store', () => ({
  getStore: jest.fn(() => ({ getDatabase: () => testDb })),
}));

jest.mock('@/lib/session', () => ({
  requireSession: jest.fn(),
}));

jest.mock('@/lib/auth/admin', () => ({
  requireAdmin: jest.fn(),
}));

const mockRequireSession = requireSession as jest.Mock;
const mockRequireAdmin = requireAdmin as jest.Mock;

const AUTHENTICATED_SESSION = {
  session: { id: 'sess-1', parsedCargos: [], parsedVessels: [] },
  sessionId: 'test-sid',
};

function migration033Up(db: Database.Database): void {
  db.exec(`
    ALTER TABLE matches ADD COLUMN reason_structured TEXT;
    ALTER TABLE matches ADD COLUMN cargo_type TEXT;
    ALTER TABLE matches ADD COLUMN load_port TEXT;
    ALTER TABLE matches ADD COLUMN discharge_port TEXT;
    ALTER TABLE matches ADD COLUMN laycan_start INTEGER;
    ALTER TABLE matches ADD COLUMN laycan_end INTEGER;
    ALTER TABLE matches ADD COLUMN vessel_dwt INTEGER;
  `);
}

beforeEach(() => {
  mockRequireSession.mockReturnValue(AUTHENTICATED_SESSION);
  mockRequireAdmin.mockReturnValue(undefined);
});

describe('bulk endpoints — empty ids array regression', () => {
  let db: Database.Database;
  const originalEnv = process.env.MATCHES_ENABLED;

  beforeEach(() => {
    db = new Database(':memory:');
    migration032.up(db);
    migration033Up(db);
    testDb = db;
    process.env.MATCHES_ENABLED = 'true';
  });

  afterEach(() => {
    db.close();
    process.env.MATCHES_ENABLED = originalEnv;
  });

  it('DELETE /api/matches/bulk with ids:[] → 400', async () => {
    const { DELETE } = await import('@/app/api/matches/bulk/route');
    const res = await DELETE(
      new NextRequest('http://localhost/api/matches/bulk', {
        method: 'DELETE',
        body: JSON.stringify({ ids: [] }),
      })
    );

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/non-empty/i);
  });

  it('PATCH /api/matches/bulk with ids:[] → 400 (parity)', async () => {
    const { PATCH } = await import('@/app/api/matches/bulk/route');
    const res = await PATCH(
      new NextRequest('http://localhost/api/matches/bulk', {
        method: 'PATCH',
        body: JSON.stringify({ ids: [], status: 'saved' }),
      })
    );

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/non-empty/i);
  });
});
