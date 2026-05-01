/**
 * TDD integration tests for GET /api/canal/[canal_code]
 *
 * Input Contract (HTTP level):
 *   missing vessel_dwt        → 400
 *   non-numeric vessel_dwt    → 400
 *   negative vessel_dwt       → 400
 *   invalid vessel_type       → 400
 *   unknown canal_code        → 404
 *   valid all params          → 200 + CanalQuote JSON
 */

import { NextRequest } from 'next/server';
import Database from 'better-sqlite3';
import { _setCanalDb } from '@/lib/economics/canals/db';
import { GET } from '@/app/api/canal/[canal_code]/route';
import { makeTestDb } from '../../helpers/canal-db';

let db: Database.Database;

beforeAll(() => {
  db = makeTestDb();
  _setCanalDb(db);
});

afterAll(() => {
  _setCanalDb(null);
  db.close();
});

function makeRequest(canalCode: string, params: Record<string, string>): NextRequest {
  const url = new URL(`http://localhost/api/canal/${canalCode}`);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return new NextRequest(url.toString());
}

function makeCtx(canalCode: string) {
  return { params: Promise.resolve({ canal_code: canalCode }) };
}

// ── Happy paths ──────────────────────────────────────────────────────────────

describe('GET /api/canal happy paths', () => {
  it('suez: valid params → 200 with totalUsd and source', async () => {
    const req = makeRequest('suez', {
      vessel_dwt: '70000', vessel_nt: '35000', vessel_type: 'bulker', laden: 'true',
    });
    const res = await GET(req, makeCtx('suez'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.totalUsd).toBe('number');
    expect(body.totalUsd).toBeGreaterThan(0);
    expect(typeof body.source).toBe('string');
  });

  it('panama: valid params → 200', async () => {
    const req = makeRequest('panama', {
      vessel_dwt: '50000', vessel_nt: '30000', vessel_type: 'bulker',
    });
    const res = await GET(req, makeCtx('panama'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.totalUsd).toBeGreaterThan(0);
  });

  it('kiel: valid params → 200', async () => {
    const req = makeRequest('kiel', {
      vessel_dwt: '10000', vessel_nt: '5000', vessel_type: 'bulker',
    });
    const res = await GET(req, makeCtx('kiel'));
    expect(res.status).toBe(200);
  });

  it('bosporus: valid params → 200', async () => {
    const req = makeRequest('bosporus', {
      vessel_dwt: '10000', vessel_nt: '5000', vessel_type: 'bulker',
    });
    const res = await GET(req, makeCtx('bosporus'));
    expect(res.status).toBe(200);
  });
});

// ── Validation errors → 400 ──────────────────────────────────────────────────

describe('GET /api/canal/suez validation', () => {
  it('missing vessel_dwt → 400', async () => {
    const req = makeRequest('suez', { vessel_nt: '35000', vessel_type: 'bulker', laden: 'true' });
    const res = await GET(req, makeCtx('suez'));
    expect(res.status).toBe(400);
  });

  it('non-numeric vessel_dwt → 400', async () => {
    const req = makeRequest('suez', {
      vessel_dwt: 'abc', vessel_nt: '35000', vessel_type: 'bulker', laden: 'true',
    });
    const res = await GET(req, makeCtx('suez'));
    expect(res.status).toBe(400);
  });

  it('negative vessel_dwt → 400', async () => {
    const req = makeRequest('suez', {
      vessel_dwt: '-1', vessel_nt: '35000', vessel_type: 'bulker', laden: 'true',
    });
    const res = await GET(req, makeCtx('suez'));
    expect(res.status).toBe(400);
  });

  it('missing vessel_nt for suez → 400', async () => {
    const req = makeRequest('suez', { vessel_dwt: '70000', vessel_type: 'bulker', laden: 'true' });
    const res = await GET(req, makeCtx('suez'));
    expect(res.status).toBe(400);
  });

  it('invalid vessel_type → 400', async () => {
    const req = makeRequest('suez', {
      vessel_dwt: '70000', vessel_nt: '35000', vessel_type: 'chemical', laden: 'true',
    });
    const res = await GET(req, makeCtx('suez'));
    expect(res.status).toBe(400);
  });
});

// ── Unknown canal → 404 ──────────────────────────────────────────────────────

describe('GET /api/canal/unknown', () => {
  it('unknown canal_code → 404', async () => {
    const req = makeRequest('xyz', { vessel_dwt: '70000', vessel_nt: '35000', vessel_type: 'bulker' });
    const res = await GET(req, makeCtx('xyz'));
    expect(res.status).toBe(404);
  });
});
