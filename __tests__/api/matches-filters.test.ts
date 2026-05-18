// @ts-nocheck — RED phase: route doesn't support M3 filters yet; impl agent adds them
/**
 * RED tests — GET /api/matches — M3 advanced filter query params
 *
 * Covers (Class 9 — E2E behavioral via real NextRequest/NextResponse route import):
 *   - ?cargo_type=grain → filters by single cargo_type
 *   - ?cargo_type=grain&cargo_type=coal → multi-value OR filter
 *   - ?route=NLRTM → load_port OR discharge_port substring match
 *   - ?laycan_from=2026-06-01&laycan_to=2026-06-30 → range overlap filter
 *   - ?score_min=70 → only score >= 70 returned
 *   - ?dwt_min=30000&dwt_max=80000 → DWT range filter
 *   - Unknown cargo_type → empty list, not 400
 *   - Invalid score_min (NaN string) → ignored, no filter applied
 *   - Empty filter params → returns all (no filter)
 *   - POST with new optional body fields → fields persisted and returned in response
 */

import Database from 'better-sqlite3';
import { NextRequest, NextResponse } from 'next/server';
import migration032 from '@/lib/migrations/032-matches';
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

const AUTHENTICATED_SESSION = {
  session: { id: 'sess-1', parsedCargos: [], parsedVessels: [] },
  sessionId: 'test-sid',
};

// ──────────────────────────────────────────────────────────────────────────────
// Migration 033 helper
// ──────────────────────────────────────────────────────────────────────────────

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

type SeedFields = Partial<{
  cargo_type: string | null;
  load_port: string | null;
  discharge_port: string | null;
  laycan_start: number | null;
  laycan_end: number | null;
  vessel_dwt: number | null;
  score: number;
  cargo_id: string;
}>;

function seedMatch(db: Database.Database, fields: SeedFields = {}): void {
  db.prepare(
    `INSERT INTO matches
      (cargo_id, vessel_id, score, reason, status, user_id, created_at, updated_at,
       cargo_type, load_port, discharge_port, laycan_start, laycan_end, vessel_dwt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    fields.cargo_id ?? 'cargo-1',
    'vessel-1',
    fields.score ?? 75,
    '{}',
    'shortlist',
    null,
    Date.now(),
    Date.now(),
    fields.cargo_type ?? null,
    fields.load_port ?? null,
    fields.discharge_port ?? null,
    fields.laycan_start ?? null,
    fields.laycan_end ?? null,
    fields.vessel_dwt ?? null
  );
}

beforeEach(() => {
  mockRequireSession.mockReturnValue(AUTHENTICATED_SESSION);
});

// ──────────────────────────────────────────────────────────────────────────────
// GET — cargo_type filter
// ──────────────────────────────────────────────────────────────────────────────

describe('GET /api/matches — ?cargo_type filter', () => {
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

  it('?cargo_type=grain returns only grain matches', async () => {
    seedMatch(db, { cargo_type: 'grain', cargo_id: 'c-grain' });
    seedMatch(db, { cargo_type: 'coal', cargo_id: 'c-coal' });

    const { GET } = await import('@/app/api/matches/route');
    const res = await GET(
      new NextRequest('http://localhost/api/matches?cargo_type=grain')
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.matches).toHaveLength(1);
    expect(json.matches[0].cargo_type).toBe('grain');
  });

  it('multiple ?cargo_type params apply OR filter', async () => {
    seedMatch(db, { cargo_type: 'grain', cargo_id: 'c1' });
    seedMatch(db, { cargo_type: 'coal', cargo_id: 'c2' });
    seedMatch(db, { cargo_type: 'cement', cargo_id: 'c3' });

    const { GET } = await import('@/app/api/matches/route');
    const res = await GET(
      new NextRequest('http://localhost/api/matches?cargo_type=grain&cargo_type=coal')
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.matches).toHaveLength(2);
    const types = json.matches.map((m: { cargo_type: string }) => m.cargo_type);
    expect(types).toContain('grain');
    expect(types).toContain('coal');
    expect(types).not.toContain('cement');
  });

  it('unknown cargo_type returns empty list (not 400)', async () => {
    seedMatch(db, { cargo_type: 'grain', cargo_id: 'c1' });

    const { GET } = await import('@/app/api/matches/route');
    const res = await GET(
      new NextRequest('http://localhost/api/matches?cargo_type=__unknown__type__')
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.matches).toHaveLength(0);
  });

  it('empty filter params (no cargo_type) returns all matches', async () => {
    seedMatch(db, { cargo_type: 'grain', cargo_id: 'c1' });
    seedMatch(db, { cargo_type: null, cargo_id: 'c2' });

    const { GET } = await import('@/app/api/matches/route');
    const res = await GET(new NextRequest('http://localhost/api/matches'));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.matches).toHaveLength(2);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// GET — route filter
// ──────────────────────────────────────────────────────────────────────────────

describe('GET /api/matches — ?route filter', () => {
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

  it('?route=NLRTM finds match with load_port containing NLRTM', async () => {
    seedMatch(db, { load_port: 'NLRTM', discharge_port: 'USNYC', cargo_id: 'c1' });
    seedMatch(db, { load_port: 'GBAMS', discharge_port: 'DEBRV', cargo_id: 'c2' });

    const { GET } = await import('@/app/api/matches/route');
    const res = await GET(
      new NextRequest('http://localhost/api/matches?route=NLRTM')
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.matches).toHaveLength(1);
    expect(json.matches[0].load_port).toBe('NLRTM');
  });

  it('?route=DEBRV finds match with discharge_port containing DEBRV', async () => {
    seedMatch(db, { load_port: 'NLRTM', discharge_port: 'USNYC', cargo_id: 'c1' });
    seedMatch(db, { load_port: 'GBAMS', discharge_port: 'DEBRV', cargo_id: 'c2' });

    const { GET } = await import('@/app/api/matches/route');
    const res = await GET(
      new NextRequest('http://localhost/api/matches?route=DEBRV')
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.matches).toHaveLength(1);
    expect(json.matches[0].discharge_port).toBe('DEBRV');
  });

  it('?route search is case-insensitive', async () => {
    seedMatch(db, { load_port: 'NLRTM', discharge_port: 'USNYC', cargo_id: 'c1' });

    const { GET } = await import('@/app/api/matches/route');
    const resLower = await GET(
      new NextRequest('http://localhost/api/matches?route=nlrtm')
    );

    expect(resLower.status).toBe(200);
    const json = await resLower.json();
    expect(json.matches).toHaveLength(1);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// GET — laycan filter
// ──────────────────────────────────────────────────────────────────────────────

describe('GET /api/matches — ?laycan_from / ?laycan_to filter', () => {
  let db: Database.Database;
  const originalEnv = process.env.MATCHES_ENABLED;

  const JUNE1_ISO = '2026-06-01';
  const JUNE30_ISO = '2026-06-30';
  const JUNE1_MS = new Date(JUNE1_ISO).getTime();
  const JUNE15_MS = new Date('2026-06-15').getTime();
  const JUNE30_MS = new Date(JUNE30_ISO).getTime();
  const MAY31_MS = new Date('2026-05-31').getTime();
  const JULY1_MS = new Date('2026-07-01').getTime();

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

  it('?laycan_from&laycan_to returns matches in overlapping window', async () => {
    // June 1-15 — overlaps with query June 1-30
    seedMatch(db, { laycan_start: JUNE1_MS, laycan_end: JUNE15_MS, cargo_id: 'c1' });
    // May — entirely before query range
    seedMatch(db, { laycan_start: MAY31_MS - 86400000, laycan_end: MAY31_MS, cargo_id: 'c2' });
    // July — entirely after query range
    seedMatch(db, { laycan_start: JULY1_MS, laycan_end: JULY1_MS + 86400000, cargo_id: 'c3' });

    const { GET } = await import('@/app/api/matches/route');
    const res = await GET(
      new NextRequest(
        `http://localhost/api/matches?laycan_from=${JUNE1_ISO}&laycan_to=${JUNE30_ISO}`
      )
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    const ids = json.matches.map((m: { cargo_id: string }) => m.cargo_id);
    expect(ids).toContain('c1');
    expect(ids).not.toContain('c2');
    expect(ids).not.toContain('c3');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// GET — score_min filter
// ──────────────────────────────────────────────────────────────────────────────

describe('GET /api/matches — ?score_min filter', () => {
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

  it('?score_min=70 returns only matches with score >= 70', async () => {
    seedMatch(db, { score: 80, cargo_id: 'c1' });
    seedMatch(db, { score: 70, cargo_id: 'c2' });
    seedMatch(db, { score: 50, cargo_id: 'c3' });

    const { GET } = await import('@/app/api/matches/route');
    const res = await GET(
      new NextRequest('http://localhost/api/matches?score_min=70')
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    const ids = json.matches.map((m: { cargo_id: string }) => m.cargo_id);
    expect(ids).toContain('c1');
    expect(ids).toContain('c2');
    expect(ids).not.toContain('c3');
  });

  it('?score_min=NaN (invalid) is ignored — returns all matches', async () => {
    seedMatch(db, { score: 80, cargo_id: 'c1' });
    seedMatch(db, { score: 20, cargo_id: 'c2' });

    const { GET } = await import('@/app/api/matches/route');
    const res = await GET(
      new NextRequest('http://localhost/api/matches?score_min=notanumber')
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    // Invalid score_min is silently ignored → all rows returned
    expect(json.matches).toHaveLength(2);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// GET — dwt filter
// ──────────────────────────────────────────────────────────────────────────────

describe('GET /api/matches — ?dwt_min / ?dwt_max filter', () => {
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

  it('?dwt_min=30000&dwt_max=80000 returns matches in DWT range', async () => {
    seedMatch(db, { vessel_dwt: 50000, cargo_id: 'c1' });
    seedMatch(db, { vessel_dwt: 10000, cargo_id: 'c2' });
    seedMatch(db, { vessel_dwt: 90000, cargo_id: 'c3' });

    const { GET } = await import('@/app/api/matches/route');
    const res = await GET(
      new NextRequest('http://localhost/api/matches?dwt_min=30000&dwt_max=80000')
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    const ids = json.matches.map((m: { cargo_id: string }) => m.cargo_id);
    expect(ids).toContain('c1');
    expect(ids).not.toContain('c2');
    expect(ids).not.toContain('c3');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// POST — new optional body fields
// ──────────────────────────────────────────────────────────────────────────────

describe('POST /api/matches — M3 new optional fields', () => {
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

  it('POST with new optional fields stores and returns them in response', async () => {
    const { POST } = await import('@/app/api/matches/route');
    const body = {
      cargo_id: 'CARGO-M3',
      vessel_id: 'VESSEL-M3',
      cargo_type: 'grain',
      load_port: 'NLRTM',
      discharge_port: 'USMIA',
      laycan_start: new Date('2026-06-01').getTime(),
      laycan_end: new Date('2026-06-30').getTime(),
      vessel_dwt: 55000,
      reason_structured: JSON.stringify({ route: 40, cargo: 35 }),
    };
    const req = new NextRequest('http://localhost/api/matches', {
      method: 'POST',
      body: JSON.stringify(body),
    });

    const res = await POST(req);

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.cargo_type).toBe('grain');
    expect(json.load_port).toBe('NLRTM');
    expect(json.discharge_port).toBe('USMIA');
    expect(json.laycan_start).toBe(body.laycan_start);
    expect(json.laycan_end).toBe(body.laycan_end);
    expect(json.vessel_dwt).toBe(55000);
    expect(json.reason_structured).toBe(body.reason_structured);
  });

  it('POST without new fields returns null for all new optional fields', async () => {
    const { POST } = await import('@/app/api/matches/route');
    const req = new NextRequest('http://localhost/api/matches', {
      method: 'POST',
      body: JSON.stringify({ cargo_id: 'C1', vessel_id: 'V1' }),
    });

    const res = await POST(req);

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.reason_structured).toBeNull();
    expect(json.cargo_type).toBeNull();
    expect(json.load_port).toBeNull();
    expect(json.discharge_port).toBeNull();
    expect(json.laycan_start).toBeNull();
    expect(json.laycan_end).toBeNull();
    expect(json.vessel_dwt).toBeNull();
  });
});
