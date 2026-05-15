import { NextRequest } from 'next/server';
import { GET } from '../route';
import { _resetVesselRegistryForTests } from '@/lib/vessel/registry';

function makeReq(path: string): NextRequest {
  return new NextRequest(`http://localhost${path}`);
}

beforeEach(() => {
  _resetVesselRegistryForTests();
});

describe('GET /api/vessel/[imo]', () => {
  it('valid IMO from cii.json (9322180) → 200 + JSON with cii_rating', async () => {
    const res = await GET(makeReq('/api/vessel/9322180'), {
      params: Promise.resolve({ imo: '9322180' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.imo).toBe('9322180');
    expect(['A', 'B', 'C', 'D', 'E']).toContain(body.cii_rating);
    expect(typeof body.name).toBe('string');
  });

  it('valid IMO present in vessel-positions corpus (8605480 / MV HASKAL) → 200 + name', async () => {
    // After the ETMS-corpus migration (2026-05-14) the curated CARBON LADY
    // sample-20 entry no longer exists. 8605480 (MV HASKAL) is one of 11
    // IMOs present in the real ETMS vessel-position emails. The corpus
    // emails use looser formatting than the V2 parser was designed for, so
    // we only assert status + name presence — dwt/flag/built may be null.
    const res = await GET(makeReq('/api/vessel/8605480'), {
      params: Promise.resolve({ imo: '8605480' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.imo).toBe('8605480');
    expect(typeof body.name).toBe('string');
    expect(body.name.length).toBeGreaterThan(0);
  });

  it('CII Grade D vessel → chartering_policy_reject:true', async () => {
    // 9322180 is rated D in lib/sample-data/imo/cii.json
    const res = await GET(makeReq('/api/vessel/9322180'), {
      params: Promise.resolve({ imo: '9322180' }),
    });
    const body = await res.json();
    if (body.cii_rating === 'D' || body.cii_rating === 'E') {
      expect(body.chartering_policy_reject).toBe(true);
    } else {
      throw new Error(`Expected D/E for 9322180, got ${body.cii_rating}`);
    }
  });

  it('CII Grade A vessel → chartering_policy_reject:false', async () => {
    // 9200648 is rated A
    const res = await GET(makeReq('/api/vessel/9200648'), {
      params: Promise.resolve({ imo: '9200648' }),
    });
    const body = await res.json();
    expect(body.cii_rating).toBe('A');
    expect(body.chartering_policy_reject).toBe(false);
  });

  it('unknown IMO (not in registry) → 404', async () => {
    const res = await GET(makeReq('/api/vessel/0000001'), {
      params: Promise.resolve({ imo: '0000001' }),
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it('invalid IMO format (non-numeric) → 400', async () => {
    const res = await GET(makeReq('/api/vessel/abc'), {
      params: Promise.resolve({ imo: 'abc' }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/IMO/i);
  });

  it('invalid IMO format (6 digits) → 400', async () => {
    const res = await GET(makeReq('/api/vessel/123456'), {
      params: Promise.resolve({ imo: '123456' }),
    });
    expect(res.status).toBe(400);
  });

  it('invalid IMO format (8 digits) → 400', async () => {
    const res = await GET(makeReq('/api/vessel/12345678'), {
      params: Promise.resolve({ imo: '12345678' }),
    });
    expect(res.status).toBe(400);
  });
});
