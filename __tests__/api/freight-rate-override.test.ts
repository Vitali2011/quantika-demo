/**
 * PI2 behavioral tests — PATCH /api/matches/[id] freight rate override.
 *
 * Covers:
 *   - PATCH with valid freight_rate_usd_per_mt recalculates TCE and stores it
 *   - PATCH with invalid rate (0, negative, non-numeric) returns 400
 *   - PATCH returns 404 for non-existent match id
 *   - PATCH returns 404 when match belongs to a different session (isolation)
 *   - PATCH returns 401 when unauthenticated
 *   - PATCH returns 503 when feature disabled
 *   - Manual override sets freight_rate_source='manual'
 *   - Recalculated tce_usd_per_day is a finite number
 */

import Database from 'better-sqlite3';
import { NextRequest, NextResponse } from 'next/server';
import migration032 from '@/lib/migrations/032-matches';
import migration033 from '@/lib/migrations/033-matches-score-breakdown';
import migration034 from '@/lib/migrations/034-matches-unique-constraint';
import migration035 from '@/lib/migrations/035-matches-tce-distance';
import migration036 from '@/lib/migrations/036-matches-freight-rate';
import migration037 from '@/lib/migrations/037-add-user-preferred-mode';
import migration038 from '@/lib/migrations/038-jobs-progress';
import migration039 from '@/lib/migrations/039-demo-seed-meta';
import migration040 from '@/lib/migrations/040-counter-offers';
import migration041 from '@/lib/migrations/041-matches-vessel-name';
import migration042 from '@/lib/migrations/042-matches-fit';
import { createMatch } from '@/lib/matching/matches-repository';
import { patchEconomicsComponent } from '@/lib/matching/persist-session-matches';
import type { FitBreakdown } from '@/lib/types';
import { requireSession } from '@/lib/session';

let testDb: Database.Database;

jest.mock('@/lib/session-store', () => ({
  getStore: jest.fn(() => ({
    getDatabase: () => testDb,
  })),
}));

jest.mock('@/lib/session', () => ({
  requireSession: jest.fn(),
}));

const mockRequireSession = requireSession as jest.Mock;

const SESSION_ID = 'test-session-freight';
const OTHER_SESSION_ID = 'other-session';

function freshDb(): Database.Database {
  const db = new Database(':memory:');
  migration032.up(db);
  migration033.up(db);
  migration034.up(db);
  migration035.up(db);
  migration036.up(db);
  migration037.up(db);
  migration038.up(db);
  migration039.up(db);
  migration040.up(db);
  migration041.up(db);
  migration042.up(db);
  return db;
}

function seedMatch(db: Database.Database, sessionId = SESSION_ID, extra: Record<string, unknown> = {}) {
  return createMatch(db, {
    cargo_id: 'cargo-test',
    vessel_id: 'vessel-test',
    score: 80,
    reason: 'test match',
    user_id: sessionId,
    distance_nm: 3000,
    vessel_dwt: 50000,
    cargo_type: 'BULK',
    ...extra,
  });
}

beforeEach(() => {
  testDb = freshDb();
  process.env.MATCHES_ENABLED = 'true';
  mockRequireSession.mockReturnValue({
    session: { id: SESSION_ID },
    sessionId: SESSION_ID,
  });
});

afterEach(() => {
  testDb.close();
});

describe('PATCH /api/matches/[id] — freight rate override', () => {
  let PATCH: (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<NextResponse>;

  beforeAll(async () => {
    ({ PATCH } = await import('@/app/api/matches/[id]/route'));
  });

  function doPatch(id: number, body: unknown) {
    return PATCH(
      new NextRequest(`http://localhost/api/matches/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ id: String(id) }) },
    );
  }

  it('recalculates TCE and stores freight_rate_source=manual', async () => {
    const match = seedMatch(testDb);
    const res = await doPatch(match.id, { freight_rate_usd_per_mt: 25 });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.freight_rate_usd_per_mt).toBe(25);
    expect(json.freight_rate_source).toBe('manual');
    expect(Number.isFinite(json.tce_usd_per_day)).toBe(true);
  });

  it('tce_usd_per_day is a finite number after override', async () => {
    const match = seedMatch(testDb);
    const res = await doPatch(match.id, { freight_rate_usd_per_mt: 30 });
    const json = await res.json();
    expect(typeof json.tce_usd_per_day).toBe('number');
    expect(Number.isFinite(json.tce_usd_per_day)).toBe(true);
  });

  it('returns 400 for rate=0', async () => {
    const match = seedMatch(testDb);
    const res = await doPatch(match.id, { freight_rate_usd_per_mt: 0 });
    expect(res.status).toBe(400);
  });

  it('returns 400 for negative rate', async () => {
    const match = seedMatch(testDb);
    const res = await doPatch(match.id, { freight_rate_usd_per_mt: -5 });
    expect(res.status).toBe(400);
  });

  it('returns 400 for non-numeric rate', async () => {
    const match = seedMatch(testDb);
    const res = await doPatch(match.id, { freight_rate_usd_per_mt: 'abc' });
    expect(res.status).toBe(400);
  });

  it('returns 404 for non-existent match id', async () => {
    const res = await doPatch(99999, { freight_rate_usd_per_mt: 25 });
    expect(res.status).toBe(404);
  });

  it('returns 404 when match belongs to different session (isolation)', async () => {
    const match = seedMatch(testDb, OTHER_SESSION_ID);
    const res = await doPatch(match.id, { freight_rate_usd_per_mt: 25 });
    expect(res.status).toBe(404);
  });

  it('returns 401 when unauthenticated', async () => {
    const match = seedMatch(testDb);
    mockRequireSession.mockReturnValueOnce(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    );
    const res = await doPatch(match.id, { freight_rate_usd_per_mt: 25 });
    expect(res.status).toBe(401);
  });

  it('returns 503 when feature disabled', async () => {
    process.env.MATCHES_ENABLED = 'false';
    const match = seedMatch(testDb);
    const res = await doPatch(match.id, { freight_rate_usd_per_mt: 25 });
    expect(res.status).toBe(503);
  });

  it('PATCH freight override recomputes fit_percent via canonical patchEconomicsComponent', async () => {
    const db = testDb;
    const fb: FitBreakdown = {
      fitPercent: 70,
      components: [
        { factor: 'economics', score: 9, weight: 18, rationale: 'seed', tier: 'neutral' },
        { factor: 'timing', score: 20, weight: 20, rationale: 'seed', tier: 'good' },
      ],
      sanctionsPenalty: 0,
      chartererPenalty: 0,
      appliedCap: null,
    } as unknown as FitBreakdown;

    const match = createMatch(db, {
      cargo_id: 'cargo-test',
      vessel_id: 'vessel-test-fit',
      score: 80,
      reason: 'r',
      user_id: SESSION_ID,
      distance_nm: 3000,
      vessel_dwt: 50000,
      load_port: 'UAODS',
      discharge_port: 'NLRTM',
      fit_percent: 70,
      fit_breakdown: JSON.stringify(fb),
    });

    mockRequireSession.mockReturnValue({ sessionId: SESSION_ID });
    const res = await doPatch(match.id, { freight_rate_usd_per_mt: 25 });
    expect(res.status).toBe(200);

    const row = db
      .prepare('SELECT fit_percent, fit_breakdown, tce_usd_per_day FROM matches WHERE id = ?')
      .get(match.id) as { fit_percent: number; fit_breakdown: string; tce_usd_per_day: number };
    const expected = patchEconomicsComponent(fb, row.tce_usd_per_day, 50000).fitPercent;
    expect(row.fit_percent).toBeCloseTo(expected, 5);
    expect(row.fit_breakdown).not.toBeNull();
  });
});
