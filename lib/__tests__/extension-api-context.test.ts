/**
 * Tests for /api/extension/context and /api/extension/draft (spec α-12).
 */
import { NextRequest } from 'next/server';
import { createSession, deleteSession, updateSession } from '@/lib/session';
import type { ParsedCargo } from '@/lib/types';

// Minimal ParsedCargo for test fixtures
function makeCargo(emailId: string): ParsedCargo {
  return {
    emailId,
    itemIndex: 0,
    originPort: { value: 'Istanbul', confidence: 'verified' },
    destinationPort: { value: 'Lagos', confidence: 'verified' },
    cargoDescription: { value: 'Steel billets', confidence: 'verified' },
    weightMt: { value: 5000, confidence: 'inferred' },
    weightMtMin: null,
    weightMtMax: null,
    volumeCbm: null,
    dimensions: null,
    cargoType: 'BULK',
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
  };
}

function makeGetRequest(url: string, sessionId?: string): NextRequest {
  return new NextRequest(url, {
    method: 'GET',
    headers: sessionId ? { cookie: `session_id=${sessionId}` } : {},
  });
}

function makePostRequest(url: string, body: unknown, sessionId?: string): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(sessionId ? { cookie: `session_id=${sessionId}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe('GET /api/extension/context', () => {
  let sessionId: string;

  beforeEach(() => {
    sessionId = createSession('test-access-token');
    updateSession(sessionId, {
      parsedCargos: [makeCargo('msg-001')],
      matches: [],
    });
  });

  afterEach(() => {
    deleteSession(sessionId);
  });

  it('returns 401 when no session cookie is present', async () => {
    const { GET } = await import('@/app/api/extension/context/route');
    const req = makeGetRequest('http://localhost/api/extension/context?messageId=msg-001');
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('returns 200 with ExtensionContextResponse shape for valid session', async () => {
    const { GET } = await import('@/app/api/extension/context/route');
    const req = makeGetRequest(
      'http://localhost/api/extension/context?messageId=msg-001',
      sessionId,
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveProperty('parsedCargo');
    expect(json).toHaveProperty('topMatches');
    expect(json).toHaveProperty('draftQuoteText');
    expect(Array.isArray(json.topMatches)).toBe(true);
  });

  it('returns parsedCargo matching messageId from session', async () => {
    const { GET } = await import('@/app/api/extension/context/route');
    const req = makeGetRequest(
      'http://localhost/api/extension/context?messageId=msg-001',
      sessionId,
    );
    const res = await GET(req);
    const json = await res.json();
    expect(json.parsedCargo).not.toBeNull();
    expect(json.parsedCargo.emailId).toBe('msg-001');
  });
});

describe('POST /api/extension/draft', () => {
  let sessionId: string;

  beforeEach(() => {
    sessionId = createSession('test-access-token');
  });

  afterEach(() => {
    deleteSession(sessionId);
  });

  it('returns 401 when no session cookie', async () => {
    const { POST } = await import('@/app/api/extension/draft/route');
    const req = makePostRequest('http://localhost/api/extension/draft', {
      parsedCargo: makeCargo('msg-001'),
      vesselId: 'v1',
      brokerName: 'Test Broker',
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('returns 400 for missing brokerName', async () => {
    const { POST } = await import('@/app/api/extension/draft/route');
    const req = makePostRequest(
      'http://localhost/api/extension/draft',
      { parsedCargo: makeCargo('msg-001'), vesselId: 'v1' },
      sessionId,
    );
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 200 with draftText string for valid request', async () => {
    const { POST } = await import('@/app/api/extension/draft/route');
    const req = makePostRequest(
      'http://localhost/api/extension/draft',
      {
        parsedCargo: makeCargo('msg-001'),
        vesselId: 'v1',
        brokerName: 'Test Broker',
      },
      sessionId,
    );
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveProperty('draftText');
    expect(typeof json.draftText).toBe('string');
    expect(json.draftText.length).toBeGreaterThan(0);
  });
});
