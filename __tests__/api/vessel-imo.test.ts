/**
 * Tests for GET /api/vessel/[imo]
 *
 * Data source: vessel registry built from lib/sample-data/vessel-positions.json
 * and lib/sample-data/imo/cii.json. Tests verify real data lookup, not hardcoded
 * responses — broker trust focus.
 */
import { NextRequest } from 'next/server';

function makeReq(imo: string): NextRequest {
  return new NextRequest(`http://localhost/api/vessel/${imo}`);
}

describe('GET /api/vessel/[imo]', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('returns 400 for non-7-digit IMO', async () => {
    const { GET } = await import('@/app/api/vessel/[imo]/route');
    const res = await GET(makeReq('123'), { params: Promise.resolve({ imo: '123' }) });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/7 digits|invalid IMO/i);
  });

  it('returns 400 for alphabetic IMO', async () => {
    const { GET } = await import('@/app/api/vessel/[imo]/route');
    const res = await GET(makeReq('ABCDEFG'), { params: Promise.resolve({ imo: 'ABCDEFG' }) });
    expect(res.status).toBe(400);
  });

  it('returns 404 for unknown 7-digit IMO', async () => {
    const { GET } = await import('@/app/api/vessel/[imo]/route');
    const res = await GET(makeReq('0000000'), { params: Promise.resolve({ imo: '0000000' }) });
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toMatch(/not found/i);
  });

  it('returns 200 with real vessel shape for known IMO from CII dataset', async () => {
    const { GET } = await import('@/app/api/vessel/[imo]/route');
    // 9200648 is in cii.json with rating A
    const imo = '9200648';
    const res = await GET(makeReq(imo), { params: Promise.resolve({ imo }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.imo).toBe(imo);
    expect(typeof json.name).toBe('string');
    expect(typeof json.chartering_policy_reject).toBe('boolean');
  });

  it('returns chartering_policy_reject=true for CII D-rated vessel', async () => {
    const { GET } = await import('@/app/api/vessel/[imo]/route');
    // 9322180 is in cii.json with rating D → must reject
    const imo = '9322180';
    const res = await GET(makeReq(imo), { params: Promise.resolve({ imo }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.cii_rating).toBe('D');
    expect(json.chartering_policy_reject).toBe(true);
  });

  it('returns chartering_policy_reject=false for CII A-rated vessel', async () => {
    const { GET } = await import('@/app/api/vessel/[imo]/route');
    // 9200648 is in cii.json with rating A → accept
    const imo = '9200648';
    const res = await GET(makeReq(imo), { params: Promise.resolve({ imo }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.cii_rating).toBe('A');
    expect(json.chartering_policy_reject).toBe(false);
  });

  it('returns chartering_policy_reject=true for CII E-rated vessel', async () => {
    const { GET } = await import('@/app/api/vessel/[imo]/route');
    // 9478999 is in cii.json with rating E → must reject
    const imo = '9478999';
    const res = await GET(makeReq(imo), { params: Promise.resolve({ imo }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.cii_rating).toBe('E');
    expect(json.chartering_policy_reject).toBe(true);
  });
});
