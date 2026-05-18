/**
 * Tests for GET /api/extension/context
 *
 * Returns parsed cargo, top vessel matches, and draft quote text from session.
 * Requires session (auth).
 */

import { NextRequest, NextResponse } from 'next/server';

jest.mock('@/lib/session', () => ({
  requireSession: jest.fn(),
}));

import { requireSession } from '@/lib/session';
const mockRequireSession = requireSession as jest.Mock;

const mockCargo = {
  emailId: 'msg-1',
  itemIndex: 0,
  cargoDescription: 'Iron ore',
  originPort: 'Rotterdam',
  destinationPort: 'Singapore',
  cargoType: 'bulk',
  weightMt: null,
  weightMtMin: null,
  weightMtMax: null,
  volumeCbm: null,
  dimensions: null,
  containerType: null,
  quantity: null,
  incoterms: null,
  preferredDates: null,
  laycan: null,
  loadingRate: null,
  dischargeRate: null,
  commissionPercent: null,
  commissionTerms: null,
  specialRequirements: null,
  stowageFactor: null,
  missingInfo: [],
  originCountry: null,
  destinationCountry: null,
};

const mockVessel = {
  emailId: 'vessel-1',
  itemIndex: 0,
  vesselName: 'MV Test',
  imo: null,
  flag: null,
  built: null,
  classSociety: null,
  pandi: null,
  dwtSummer: null,
  dwcc: null,
  draftMax: null,
  loa: null,
  beam: null,
  grt: null,
};

const mockMatch = {
  cargoEmailId: 'msg-1',
  cargoItemIndex: 0,
  vesselEmailId: 'vessel-1',
  vesselItemIndex: 0,
  score: 85,
  matchLevel: 'good' as const,
  matchReasons: [],
  issues: [],
};

describe('GET /api/extension/context', () => {
  beforeEach(() => {
    // Default: valid session with data
    mockRequireSession.mockReturnValue({
      sessionId: 'test-sid',
      session: {
        parsedCargos: [mockCargo],
        parsedVessels: [mockVessel],
        matches: [mockMatch],
      },
    });
  });

  it('returns 401 when requireSession returns a 401 NextResponse', async () => {
    mockRequireSession.mockReturnValue(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    );
    const { GET } = await import('@/app/api/extension/context/route');
    const req = new NextRequest('http://localhost/api/extension/context');
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('returns 200 with nulls for empty session (no cargo)', async () => {
    mockRequireSession.mockReturnValue({
      sessionId: 'test-sid',
      session: {
        parsedCargos: [],
        parsedVessels: [],
        matches: [],
      },
    });
    const { GET } = await import('@/app/api/extension/context/route');
    const req = new NextRequest('http://localhost/api/extension/context');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.parsedCargo).toBeNull();
    expect(json.topMatches).toEqual([]);
    expect(json.draftQuoteText).toBeNull();
  });

  it('returns 200 with parsedCargo and topMatches when session has cargo, vessel, and match', async () => {
    const { GET } = await import('@/app/api/extension/context/route');
    const req = new NextRequest('http://localhost/api/extension/context');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.parsedCargo).toBeDefined();
    expect(json.parsedCargo.emailId).toBe('msg-1');
    expect(Array.isArray(json.topMatches)).toBe(true);
    expect(json.topMatches.length).toBeGreaterThan(0);
    expect(json.topMatches[0].score).toBe(85);
    expect(typeof json.draftQuoteText).toBe('string');
  });

  it('returns 200 with cargo matching messageId query param', async () => {
    const cargo2 = { ...mockCargo, emailId: 'msg-2', cargoDescription: 'Coal' };
    mockRequireSession.mockReturnValue({
      sessionId: 'test-sid',
      session: {
        parsedCargos: [mockCargo, cargo2],
        parsedVessels: [mockVessel],
        matches: [mockMatch, { ...mockMatch, cargoEmailId: 'msg-2' }],
      },
    });
    const { GET } = await import('@/app/api/extension/context/route');
    const req = new NextRequest('http://localhost/api/extension/context?messageId=msg-1');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.parsedCargo.emailId).toBe('msg-1');
  });
});
