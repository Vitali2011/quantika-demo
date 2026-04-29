/**
 * Integration tests for GET /api/port-da/[port_code]
 *
 * Strategy: mock getPortDa at module level so we test the route handler
 * isolation (validation, HTTP status, cache headers) without a real DB.
 */
jest.mock('@/lib/port-da/repository', () => ({
  getPortDa: jest.fn(),
}));

import { getPortDa } from '@/lib/port-da/repository';
import { GET } from '@/app/api/port-da/[port_code]/route';

const mockGetPortDa = getPortDa as jest.MockedFunction<typeof getPortDa>;

const FAKE_BREAKDOWN = {
  portCode: 'AEJEA',
  vesselDwt: 55000,
  portDuesUsd: 18000,
  pilotageUsd: 4000,
  tugsUsd: 3500,
  stevedoringUsdPerMt: 5.5,
  totalFixedUsd: 25500,
  confidence: 'estimated' as const,
  source: 'manual',
};

function makeRequest(url: string): Request {
  return new Request(url);
}

function makeParams(portCode: string): { params: Promise<{ port_code: string }> } {
  return { params: Promise.resolve({ port_code: portCode }) };
}

describe('GET /api/port-da/[port_code] — 200 happy path', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetPortDa.mockReturnValue(FAKE_BREAKDOWN);
  });

  it('returns 200 with breakdown JSON for valid params', async () => {
    const req = makeRequest('http://localhost/api/port-da/AEJEA?vessel_dwt=55000');
    const res = await GET(req as never, makeParams('AEJEA'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.portCode).toBe('AEJEA');
    expect(body.confidence).toBe('estimated');
    expect(body.source).toBe('manual');
    expect(body.portDuesUsd).toBeGreaterThan(0);
    expect(body.pilotageUsd).toBeGreaterThan(0);
    expect(body.tugsUsd).toBeGreaterThan(0);
    expect(body.totalFixedUsd).toBeGreaterThan(0);
  });

  it('sets Cache-Control: public, max-age=86400', async () => {
    const req = makeRequest('http://localhost/api/port-da/AEJEA?vessel_dwt=55000');
    const res = await GET(req as never, makeParams('AEJEA'));
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=86400');
  });

  it('passes cargo_type to getPortDa when provided', async () => {
    const req = makeRequest('http://localhost/api/port-da/AEJEA?vessel_dwt=55000&cargo_type=bulk');
    await GET(req as never, makeParams('AEJEA'));
    expect(mockGetPortDa).toHaveBeenCalledWith(
      expect.objectContaining({ portCode: 'AEJEA', vesselDwt: 55000, cargoType: 'bulk' }),
    );
  });
});

describe('GET /api/port-da/[port_code] — 400 invalid params', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it('returns 400 for invalid port_code (too short)', async () => {
    const req = makeRequest('http://localhost/api/port-da/AEJ?vessel_dwt=55000');
    const res = await GET(req as never, makeParams('AEJ'));
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid port_code (lowercase)', async () => {
    const req = makeRequest('http://localhost/api/port-da/aejea?vessel_dwt=55000');
    const res = await GET(req as never, makeParams('aejea'));
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid port_code (with digit)', async () => {
    const req = makeRequest('http://localhost/api/port-da/AEJE1?vessel_dwt=55000');
    const res = await GET(req as never, makeParams('AEJE1'));
    expect(res.status).toBe(400);
  });

  it('returns 400 when vessel_dwt is missing', async () => {
    const req = makeRequest('http://localhost/api/port-da/AEJEA');
    const res = await GET(req as never, makeParams('AEJEA'));
    expect(res.status).toBe(400);
  });

  it('returns 400 when vessel_dwt is zero', async () => {
    const req = makeRequest('http://localhost/api/port-da/AEJEA?vessel_dwt=0');
    const res = await GET(req as never, makeParams('AEJEA'));
    expect(res.status).toBe(400);
  });

  it('returns 400 when vessel_dwt is negative', async () => {
    const req = makeRequest('http://localhost/api/port-da/AEJEA?vessel_dwt=-1000');
    const res = await GET(req as never, makeParams('AEJEA'));
    expect(res.status).toBe(400);
  });

  it('returns 400 when vessel_dwt is non-numeric', async () => {
    const req = makeRequest('http://localhost/api/port-da/AEJEA?vessel_dwt=abc');
    const res = await GET(req as never, makeParams('AEJEA'));
    expect(res.status).toBe(400);
  });

  it('returns 400 when vessel_dwt is a float', async () => {
    const req = makeRequest('http://localhost/api/port-da/AEJEA?vessel_dwt=55000.5');
    const res = await GET(req as never, makeParams('AEJEA'));
    expect(res.status).toBe(400);
  });
});

describe('GET /api/port-da/[port_code] — 404 no data', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetPortDa.mockReturnValue(null);
  });

  it('returns 404 when port has no DA data', async () => {
    const req = makeRequest('http://localhost/api/port-da/ZZZZZ?vessel_dwt=10000');
    const res = await GET(req as never, makeParams('ZZZZZ'));
    expect(res.status).toBe(404);
  });
});
