/**
 * Tests for GET /api/port-da/[port_code]
 *
 * Returns port disbursement account (DA) breakdown for a given port and vessel DWT.
 * No auth required.
 */

import Database from 'better-sqlite3';
import { NextRequest } from 'next/server';
import migration010 from '@/lib/migrations/010-port-da-estimates';

let testDb: Database.Database;

jest.mock('@/lib/session-store', () => ({
  getStore: jest.fn(() => ({
    getDatabase: () => testDb,
  })),
}));

describe('GET /api/port-da/[port_code]', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    migration010.up(db);
    testDb = db;
    jest.resetModules();
  });

  afterEach(() => {
    db.close();
  });

  it('returns 400 for invalid port_code (2-char, not 5 uppercase letters)', async () => {
    const { GET } = await import('@/app/api/port-da/[port_code]/route');
    const req = new NextRequest('http://localhost/api/port-da/NL?vessel_dwt=50000');
    const res = await GET(req, { params: Promise.resolve({ port_code: 'NL' }) });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/5 uppercase letters/i);
  });

  it('returns 400 when vessel_dwt is missing', async () => {
    const { GET } = await import('@/app/api/port-da/[port_code]/route');
    const req = new NextRequest('http://localhost/api/port-da/NLRTM');
    const res = await GET(req, { params: Promise.resolve({ port_code: 'NLRTM' }) });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/vessel_dwt/i);
  });

  it('returns 200 with outOfRange=true for DWT too small (1000 < 5000 minimum)', async () => {
    const { GET } = await import('@/app/api/port-da/[port_code]/route');
    const req = new NextRequest('http://localhost/api/port-da/NLRTM?vessel_dwt=1000');
    const res = await GET(req, { params: Promise.resolve({ port_code: 'NLRTM' }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.outOfRange).toBe(true);
    expect(typeof json.message).toBe('string');
  });

  it('returns 404 when no data found for valid port/DWT combination', async () => {
    const { GET } = await import('@/app/api/port-da/[port_code]/route');
    const req = new NextRequest('http://localhost/api/port-da/NLRTM?vessel_dwt=50000');
    const res = await GET(req, { params: Promise.resolve({ port_code: 'NLRTM' }) });
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toMatch(/No port DA data/i);
  });

  it('returns 200 with breakdown shape for seeded data', async () => {
    db.prepare(
      `INSERT INTO port_da_estimates (port_code, port_name, vessel_dwt_min, vessel_dwt_max, port_dues_usd, pilotage_usd, tugs_usd, stevedoring_usd_per_mt, cargo_type, confidence, source, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run('NLRTM', 'Rotterdam', 5000, 80000, 50000, 20000, 15000, 4.5, 'general', 'estimated', 'test', Date.now());

    const { GET } = await import('@/app/api/port-da/[port_code]/route');
    const req = new NextRequest('http://localhost/api/port-da/NLRTM?vessel_dwt=50000');
    const res = await GET(req, { params: Promise.resolve({ port_code: 'NLRTM' }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.portCode).toBe('NLRTM');
    expect(json.vesselDwt).toBe(50000);
    expect(typeof json.portDuesUsd).toBe('number');
    expect(typeof json.pilotageUsd).toBe('number');
    expect(typeof json.tugsUsd).toBe('number');
    expect(typeof json.totalFixedUsd).toBe('number');
  });
});
