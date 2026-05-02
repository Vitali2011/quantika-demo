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

  it('valid IMO from vessel-positions (CARBON LADY 9456783) → 200 + name parsed', async () => {
    const res = await GET(makeReq('/api/vessel/9456783'), {
      params: Promise.resolve({ imo: '9456783' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.imo).toBe('9456783');
    expect(typeof body.name).toBe('string');
    expect(body.name).toMatch(/CARBON LADY/i);
    expect(body.dwt).toBe(17500);
    expect(body.flag).toBe('Marshall Islands');
    expect(body.built_year).toBe(2001);
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
      // Defensive — dataset rating drift would fail loudly.
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
