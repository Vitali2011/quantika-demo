import Database from 'better-sqlite3';
import { NextRequest } from 'next/server';
import migration026 from '@/lib/migrations/026-charterers';
import { upsertCharterer } from '@/lib/market/charterers-repository';

let testDb: Database.Database;

jest.mock('@/lib/session-store', () => ({
  getStore: jest.fn(() => ({
    getDatabase: () => testDb,
  })),
}));

/**
 * Input Contract:
 * - Feature flag OFF → 503 with {error: "feature disabled"}
 * - GET: list charterers, optional ?tier= filter
 * - POST: create charterer (body: {name, tier, require_lc?, notes?})
 * - POST: missing name/tier → 400 validation error
 * - POST: invalid tier → 400 validation error
 * - POST: empty name → 400 validation error
 */

describe('GET /api/charterers', () => {
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

    const { GET } = await import('@/app/api/charterers/route');
    const res = await GET();

    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.error).toMatch(/feature disabled/i);
  });

  // RED test: feature flag ON returns 200 with list
  it('returns 200 with charterers list when feature enabled', async () => {
    process.env.CHARTERER_CREDIT_ENABLED = 'true';

    upsertCharterer(db, {
      id: 'c1',
      name: 'Cargill',
      tier: 'blue-chip',
      payment_history: '[]',
      require_lc: 0,
      notes: null,
    });

    const { GET } = await import('@/app/api/charterers/route');
    const res = await GET();

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.charterers).toHaveLength(1);
    expect(json.charterers[0].name).toBe('Cargill');
  });

  // RED test: GET with ?tier= filter
  it('filters charterers by tier query param', async () => {
    process.env.CHARTERER_CREDIT_ENABLED = 'true';

    upsertCharterer(db, {
      id: 'c1',
      name: 'Cargill',
      tier: 'blue-chip',
      payment_history: '[]',
      require_lc: 0,
      notes: null,
    });

    upsertCharterer(db, {
      id: 'c2',
      name: 'Second Corp',
      tier: 'second',
      payment_history: '[]',
      require_lc: 0,
      notes: null,
    });

    const { GET } = await import('@/app/api/charterers/route');
    const req = new NextRequest('http://localhost/api/charterers?tier=blue-chip');
    const res = await GET(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.charterers).toHaveLength(1);
    expect(json.charterers[0].tier).toBe('blue-chip');
  });
});

describe('POST /api/charterers', () => {
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

    const { POST } = await import('@/app/api/charterers/route');
    const req = new NextRequest('http://localhost/api/charterers', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Test Corp',
        tier: 'blue-chip',
      }),
    });

    const res = await POST(req);

    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.error).toMatch(/feature disabled/i);
  });

  // RED test: creates charterer when flag enabled
  it('creates charterer and returns 201 when feature enabled', async () => {
    process.env.CHARTERER_CREDIT_ENABLED = 'true';

    const { POST } = await import('@/app/api/charterers/route');
    const req = new NextRequest('http://localhost/api/charterers', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Cargill',
        tier: 'blue-chip',
        require_lc: 0,
        notes: 'Top tier',
      }),
    });

    const res = await POST(req);

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.id).toBeDefined();
    expect(json.name).toBe('Cargill');
  });

  // RED test: missing name returns 400 (boundary: missing field)
  it('returns 400 when name is missing', async () => {
    process.env.CHARTERER_CREDIT_ENABLED = 'true';

    const { POST } = await import('@/app/api/charterers/route');
    const req = new NextRequest('http://localhost/api/charterers', {
      method: 'POST',
      body: JSON.stringify({
        tier: 'blue-chip',
      }),
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBeDefined();
  });

  // RED test: empty name returns 400 (boundary: empty string)
  it('returns 400 when name is empty', async () => {
    process.env.CHARTERER_CREDIT_ENABLED = 'true';

    const { POST } = await import('@/app/api/charterers/route');
    const req = new NextRequest('http://localhost/api/charterers', {
      method: 'POST',
      body: JSON.stringify({
        name: '',
        tier: 'blue-chip',
      }),
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBeDefined();
  });

  // RED test: missing tier returns 400 (boundary: missing field)
  it('returns 400 when tier is missing', async () => {
    process.env.CHARTERER_CREDIT_ENABLED = 'true';

    const { POST } = await import('@/app/api/charterers/route');
    const req = new NextRequest('http://localhost/api/charterers', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Test Corp',
      }),
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBeDefined();
  });

  // RED test: invalid tier returns 400 (boundary: invalid enum value)
  it('returns 400 when tier is invalid', async () => {
    process.env.CHARTERER_CREDIT_ENABLED = 'true';

    const { POST } = await import('@/app/api/charterers/route');
    const req = new NextRequest('http://localhost/api/charterers', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Test Corp',
        tier: 'invalid-tier',
      }),
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBeDefined();
  });

  // RED test: require_lc defaults to 0 if not provided
  it('defaults require_lc to 0 if not provided', async () => {
    process.env.CHARTERER_CREDIT_ENABLED = 'true';

    const { POST } = await import('@/app/api/charterers/route');
    const req = new NextRequest('http://localhost/api/charterers', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Test Corp',
        tier: 'blue-chip',
      }),
    });

    const res = await POST(req);

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.require_lc).toBe(0);
  });
});
