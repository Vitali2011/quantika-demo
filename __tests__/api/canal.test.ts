/**
 * Tests for GET /api/canal/[canal_code]
 *
 * Canal toll estimation. Uses pure quoteCanal function — no external calls.
 * No auth required.
 */

import { NextRequest } from 'next/server';

describe('GET /api/canal/[canal_code]', () => {
  it('returns 404 for unknown canal_code', async () => {
    const { GET } = await import('@/app/api/canal/[canal_code]/route');
    const req = new NextRequest('http://localhost/api/canal/wrongcanal?vessel_dwt=50000&vessel_type=bulker');
    const res = await GET(req, { params: Promise.resolve({ canal_code: 'wrongcanal' }) });
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toMatch(/Unknown canal code/i);
  });

  it('returns 400 when vessel_dwt is missing', async () => {
    const { GET } = await import('@/app/api/canal/[canal_code]/route');
    const req = new NextRequest('http://localhost/api/canal/panama?vessel_type=bulker');
    const res = await GET(req, { params: Promise.resolve({ canal_code: 'panama' }) });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/vessel_dwt/i);
  });

  it('returns 400 for invalid vessel_type', async () => {
    const { GET } = await import('@/app/api/canal/[canal_code]/route');
    const req = new NextRequest('http://localhost/api/canal/panama?vessel_dwt=50000&vessel_type=submarine');
    const res = await GET(req, { params: Promise.resolve({ canal_code: 'panama' }) });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/vessel_type/i);
  });

  it('returns 400 for suez without vessel_nt', async () => {
    const { GET } = await import('@/app/api/canal/[canal_code]/route');
    const req = new NextRequest('http://localhost/api/canal/suez?vessel_dwt=50000&vessel_type=tanker');
    const res = await GET(req, { params: Promise.resolve({ canal_code: 'suez' }) });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/vessel_nt/i);
  });

  it('returns 200 with numeric quote fields for Panama happy path', async () => {
    const { GET } = await import('@/app/api/canal/[canal_code]/route');
    const req = new NextRequest('http://localhost/api/canal/panama?vessel_dwt=50000&vessel_type=bulker');
    const res = await GET(req, { params: Promise.resolve({ canal_code: 'panama' }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    // CanalQuote must have at least a toll or dues field
    expect(typeof json).toBe('object');
    expect(json).not.toBeNull();
    // Verify at least one numeric field is present
    const numericValues = Object.values(json).filter(v => typeof v === 'number');
    expect(numericValues.length).toBeGreaterThan(0);
  });
});
