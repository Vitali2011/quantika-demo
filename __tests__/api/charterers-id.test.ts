import Database from 'better-sqlite3';
import { NextRequest, NextResponse } from 'next/server';
import migration026 from '@/lib/migrations/026-charterers';
import { upsertCharterer } from '@/lib/market/charterers-repository';
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

beforeEach(() => {
  mockRequireSession.mockReturnValue({ session: { id: 'test' }, sessionId: 'test-sid' });
});

/**
 * Input Contract:
 * - Feature flag OFF → 503 with {error: "feature disabled"}
 * - GET: returns charterer by id or 404
 * - PUT: updates charterer or 404
 * - DELETE: deletes charterer or 404
 * - Empty id → 404 or routing error
 */

describe('GET /api/charterers/[id]', () => {
  let db: Database.Database;
  const originalEnv = process.env.CHARTERER_CREDIT_ENABLED;

  beforeEach(() => {
    db = new Database(':memory:');
    migration026.up(db);
    testDb = db;
  });

  afterEach(() => {
    db.close();
    process.env.CHARTERER_CREDIT_ENABLED = originalEnv;
  });

  // RED test: feature flag OFF returns 503
  it('returns 503 when feature flag is disabled', async () => {
    process.env.CHARTERER_CREDIT_ENABLED = 'false';

    const { GET } = await import('@/app/api/charterers/[id]/route');
    const res = await GET(
      new NextRequest('http://localhost/api/charterers/c1'),
      { params: Promise.resolve({ id: 'c1' }) }
    );

    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.error).toMatch(/feature disabled/i);
  });

  // RED test: returns charterer when found
  it('returns 200 with charterer when found', async () => {
    process.env.CHARTERER_CREDIT_ENABLED = 'true';

    upsertCharterer(db, {
      id: 'c1',
      name: 'Cargill',
      tier: 'blue-chip',
      payment_history: '[]',
      require_lc: 0,
      notes: 'Top tier',
    });

    const { GET } = await import('@/app/api/charterers/[id]/route');
    const res = await GET(
      new NextRequest('http://localhost/api/charterers/c1'),
      { params: Promise.resolve({ id: 'c1' }) }
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.name).toBe('Cargill');
    expect(json.tier).toBe('blue-chip');
  });

  // RED test: returns 404 when not found (boundary: non-existent id)
  it('returns 404 when charterer not found', async () => {
    process.env.CHARTERER_CREDIT_ENABLED = 'true';

    const { GET } = await import('@/app/api/charterers/[id]/route');
    const res = await GET(
      new NextRequest('http://localhost/api/charterers/unknown'),
      { params: Promise.resolve({ id: 'unknown' }) }
    );

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBeDefined();
  });
});

describe('PUT /api/charterers/[id]', () => {
  let db: Database.Database;
  const originalEnv = process.env.CHARTERER_CREDIT_ENABLED;

  beforeEach(() => {
    db = new Database(':memory:');
    migration026.up(db);
    testDb = db;
  });

  afterEach(() => {
    db.close();
    process.env.CHARTERER_CREDIT_ENABLED = originalEnv;
  });

  // RED test: feature flag OFF returns 503
  it('returns 503 when feature flag is disabled', async () => {
    process.env.CHARTERER_CREDIT_ENABLED = 'false';

    const { PUT } = await import('@/app/api/charterers/[id]/route');
    const req = new NextRequest('http://localhost/api/charterers/c1', {
      method: 'PUT',
      body: JSON.stringify({
        name: 'Updated Name',
        tier: 'second',
      }),
    });

    const res = await PUT(req, { params: Promise.resolve({ id: 'c1' }) });

    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.error).toMatch(/feature disabled/i);
  });

  // RED test: updates charterer
  it('updates charterer and returns 200', async () => {
    process.env.CHARTERER_CREDIT_ENABLED = 'true';

    upsertCharterer(db, {
      id: 'c1',
      name: 'Cargill',
      tier: 'blue-chip',
      payment_history: '[]',
      require_lc: 0,
      notes: null,
    });

    const { PUT } = await import('@/app/api/charterers/[id]/route');
    const req = new NextRequest('http://localhost/api/charterers/c1', {
      method: 'PUT',
      body: JSON.stringify({
        name: 'Cargill Updated',
        tier: 'second',
        require_lc: 1,
        notes: 'Updated notes',
      }),
    });

    const res = await PUT(req, { params: Promise.resolve({ id: 'c1' }) });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.name).toBe('Cargill Updated');
    expect(json.tier).toBe('second');
    expect(json.require_lc).toBe(1);
  });

  // RED test: returns 404 when charterer not found (boundary: non-existent id)
  it('returns 404 when charterer not found', async () => {
    process.env.CHARTERER_CREDIT_ENABLED = 'true';

    const { PUT } = await import('@/app/api/charterers/[id]/route');
    const req = new NextRequest('http://localhost/api/charterers/unknown', {
      method: 'PUT',
      body: JSON.stringify({
        name: 'Test',
        tier: 'blue-chip',
      }),
    });

    const res = await PUT(req, { params: Promise.resolve({ id: 'unknown' }) });

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBeDefined();
  });
});

describe('DELETE /api/charterers/[id]', () => {
  let db: Database.Database;
  const originalEnv = process.env.CHARTERER_CREDIT_ENABLED;

  beforeEach(() => {
    db = new Database(':memory:');
    migration026.up(db);
    testDb = db;
  });

  afterEach(() => {
    db.close();
    process.env.CHARTERER_CREDIT_ENABLED = originalEnv;
  });

  // RED test: feature flag OFF returns 503
  it('returns 503 when feature flag is disabled', async () => {
    process.env.CHARTERER_CREDIT_ENABLED = 'false';

    const { DELETE } = await import('@/app/api/charterers/[id]/route');
    const res = await DELETE(
      new NextRequest('http://localhost/api/charterers/c1', { method: 'DELETE' }),
      { params: Promise.resolve({ id: 'c1' }) }
    );

    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.error).toMatch(/feature disabled/i);
  });

  // RED test: deletes charterer
  it('deletes charterer and returns 204', async () => {
    process.env.CHARTERER_CREDIT_ENABLED = 'true';

    upsertCharterer(db, {
      id: 'c1',
      name: 'Cargill',
      tier: 'blue-chip',
      payment_history: '[]',
      require_lc: 0,
      notes: null,
    });

    const { DELETE } = await import('@/app/api/charterers/[id]/route');
    const res = await DELETE(
      new NextRequest('http://localhost/api/charterers/c1', { method: 'DELETE' }),
      { params: Promise.resolve({ id: 'c1' }) }
    );

    expect(res.status).toBe(204);
  });

  // RED test: returns 404 when charterer not found (boundary: non-existent id)
  it('returns 404 when charterer not found', async () => {
    process.env.CHARTERER_CREDIT_ENABLED = 'true';

    const { DELETE } = await import('@/app/api/charterers/[id]/route');
    const res = await DELETE(
      new NextRequest('http://localhost/api/charterers/unknown', { method: 'DELETE' }),
      { params: Promise.resolve({ id: 'unknown' }) }
    );

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBeDefined();
  });
});

describe('Auth contract: handler bypasses requireSession (demo flow)', () => {
  let db: Database.Database;
  const originalEnv = process.env.CHARTERER_CREDIT_ENABLED;

  beforeEach(() => {
    db = new Database(':memory:');
    migration026.up(db);
    testDb = db;
    process.env.CHARTERER_CREDIT_ENABLED = 'true';
    // Simulate "no session_id" state. If any handler called requireSession,
    // this mock would force 401 and the assertions below would fail.
    // Regression contract: re-adding requireSession to a handler breaks these tests.
    mockRequireSession.mockReturnValue(
      NextResponse.json({ error: 'No session' }, { status: 401 })
    );
  });

  afterEach(() => {
    db.close();
    process.env.CHARTERER_CREDIT_ENABLED = originalEnv;
  });

  it('GET returns 200 for existing charterer when no session_id is available', async () => {
    upsertCharterer(db, {
      id: 'c1',
      name: 'Demo Corp',
      tier: 'blue-chip',
      payment_history: '[]',
      require_lc: 0,
      notes: null,
    });

    const { GET } = await import('@/app/api/charterers/[id]/route');
    const res = await GET(
      new NextRequest('http://localhost/api/charterers/c1'),
      { params: Promise.resolve({ id: 'c1' }) }
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.name).toBe('Demo Corp');
  });

  it('GET returns 404 for missing charterer when no session_id (not 401)', async () => {
    const { GET } = await import('@/app/api/charterers/[id]/route');
    const res = await GET(
      new NextRequest('http://localhost/api/charterers/missing-id'),
      { params: Promise.resolve({ id: 'missing-id' }) }
    );
    expect(res.status).toBe(404);
  });

  it('PUT returns 200 when no session_id is available', async () => {
    upsertCharterer(db, {
      id: 'c1',
      name: 'Original',
      tier: 'blue-chip',
      payment_history: '[]',
      require_lc: 0,
      notes: null,
    });

    const { PUT } = await import('@/app/api/charterers/[id]/route');
    const res = await PUT(
      new NextRequest('http://localhost/api/charterers/c1', {
        method: 'PUT',
        body: JSON.stringify({ name: 'Updated' }),
      }),
      { params: Promise.resolve({ id: 'c1' }) }
    );
    expect(res.status).toBe(200);
  });

  it('DELETE returns 204 when no session_id is available', async () => {
    upsertCharterer(db, {
      id: 'c1',
      name: 'Demo',
      tier: 'blue-chip',
      payment_history: '[]',
      require_lc: 0,
      notes: null,
    });

    const { DELETE } = await import('@/app/api/charterers/[id]/route');
    const res = await DELETE(
      new NextRequest('http://localhost/api/charterers/c1', { method: 'DELETE' }),
      { params: Promise.resolve({ id: 'c1' }) }
    );
    expect(res.status).toBe(204);
  });
});
