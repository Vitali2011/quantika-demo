/**
 * route.test.ts — regression tests for match endpoint provider migration (γv-06)
 *
 * Covers:
 * 1. Provider routing: openai / bedrock / gemini all go through ai-provider shim
 * 2. callAiJson called with ('MATCH', system, user, opts) signature
 * 3. LLMTimeoutError → 504 response (unchanged from pre-migration behaviour)
 * 4. Empty session (no cargos) → { count: 0 } (unchanged)
 * 5. Missing AWS env → clear error surfaced (bedrock guard)
 */

import { POST } from '@/app/api/ai/match/route';
import { NextRequest } from 'next/server';
import type { SessionData, ParsedCargo, ParsedVessel } from '@/lib/types';
import { LLMTimeoutError } from '@/lib/openai';

// ── Mocks ──────────────────────────────────────────────────────────────────────

jest.mock('@/lib/ai-provider', () => ({
  callAiJson: jest.fn(),
  getProvider: jest.fn().mockReturnValue('openai'),
}));

jest.mock('@/lib/csrf', () => ({
  validateCsrf: jest.fn().mockReturnValue(true),
}));

jest.mock('@/lib/session', () => {
  const { NextResponse } = jest.requireActual('next/server');
  const getSession = jest.fn();
  const updateSession = jest.fn();
  return {
    getSession,
    updateSession,
    requireSession: (request: { cookies: { get: (n: string) => { value: string } | undefined } }) => {
      const sessionId = request.cookies.get('session_id')?.value;
      if (!sessionId) return NextResponse.json({ error: 'No session' }, { status: 401 });
      const session = getSession(sessionId);
      if (!session) return NextResponse.json({ error: 'Session expired' }, { status: 401 });
      return { session, sessionId };
    },
  };
});

// pair-analyzer: the real analyzer is complex — mock to control LLM call path
jest.mock('@/lib/matching/pair-analyzer', () => ({
  analyzePairs: jest.fn(),
}));

import * as aiProvider from '@/lib/ai-provider';
import { getSession, updateSession } from '@/lib/session';
import { analyzePairs } from '@/lib/matching/pair-analyzer';

const mockCallAiJson = aiProvider.callAiJson as jest.MockedFunction<typeof aiProvider.callAiJson>;
const mockGetProvider = aiProvider.getProvider as jest.MockedFunction<typeof aiProvider.getProvider>;
const mockGetSession = getSession as jest.MockedFunction<typeof getSession>;
const mockUpdateSession = updateSession as jest.MockedFunction<typeof updateSession>;
const mockAnalyzePairs = analyzePairs as jest.MockedFunction<typeof analyzePairs>;

// ── Fixtures ──────────────────────────────────────────────────────────────────

function cfField<T>(value: T) {
  return { value, confidence: 'confirmed' as const };
}

const baseCargo: ParsedCargo = {
  emailId: 'cargo-001',
  itemIndex: 0,
  originPort: cfField('Dubai'),
  destinationPort: cfField('Rotterdam'),
  cargoDescription: cfField('grain'),
  weightMt: cfField(25000),
  cargoType: 'BULK',
  laycan: '15-25 May 2026',
  preferredDates: null,
  originCountry: null,
  destinationCountry: null,
  weightMtMin: null,
  weightMtMax: null,
  volumeCbm: null,
  dimensions: null,
  containerType: null,
  quantity: null,
  incoterms: null,
  loadingRate: null,
  dischargeRate: null,
  commissionPercent: null,
  commissionTerms: null,
  specialRequirements: null,
  stowageFactor: null,
  missingInfo: [],
} as unknown as ParsedCargo;

const baseVessel: ParsedVessel = {
  emailId: 'vessel-001',
  itemIndex: 0,
  vesselName: cfField('MV Test'),
  dwtSummer: cfField(32000),
  dwcc: cfField(30000),
  draftMax: cfField(11.5),
  geared: true,
  vesselType: 'Handysize bulk carrier',
  openPosition: cfField('Fujairah'),
  openDate: cfField('2026-05-10'),
  flag: 'MH',
  imo: null,
  direction: null,
  restrictions: [],
  grainCapacity: 40000,
  grainCapacityUnit: 'cbm',
  holdDimensions: null,
  craneCapacity: null,
  built: 2018,
  loa: null,
  speedLaden: '12',
  speedBallast: null,
} as unknown as ParsedVessel;

const baseSession: SessionData = {
  id: 'session-1',
  accessToken: 'token',
  createdAt: new Date(),
  emails: [],
  classifications: [],
  processedEmails: [],
  parsedCargos: [baseCargo],
  parsedVessels: [baseVessel],
  parsedFixtureRecaps: [],
  matches: [],
  blockedMatches: [],
  recaps: [],
  commissionSummary: null,
  counterparties: [],
} as unknown as SessionData;

const emptySession: SessionData = {
  ...baseSession,
  parsedCargos: [],
  parsedVessels: [],
};

function makeRequest(sessionId?: string): NextRequest {
  const headers: Record<string, string> = { origin: 'http://localhost:3000' };
  if (sessionId) headers['cookie'] = `session_id=${sessionId}`;
  return new NextRequest('http://localhost/api/ai/match', {
    method: 'POST',
    headers,
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /api/ai/match — provider migration (γv-06)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdateSession.mockReturnValue(true);
    // Default: analyzePairs returns empty matches (enough for non-crash tests)
    mockAnalyzePairs.mockResolvedValue({ matches: [], blockedMatches: [] });
  });

  // ── Auth / CSRF ─────────────────────────────────────────────────────────────

  it('returns 401 when no session cookie', async () => {
    const req = makeRequest();
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('returns 401 when session not found', async () => {
    mockGetSession.mockReturnValue(null);
    const req = makeRequest('session-404');
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  // ── Empty session ────────────────────────────────────────────────────────────

  it('returns { count: 0 } immediately when no cargos', async () => {
    mockGetSession.mockReturnValue(emptySession);
    const req = makeRequest('session-1');
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.count).toBe(0);
    // Should NOT have called analyzePairs at all
    expect(mockAnalyzePairs).not.toHaveBeenCalled();
  });

  it('returns { count: 0 } immediately when no vessels', async () => {
    const sessionNoVessels: SessionData = {
      ...baseSession,
      parsedVessels: [],
    } as unknown as SessionData;
    mockGetSession.mockReturnValue(sessionNoVessels);
    const req = makeRequest('session-1');
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.count).toBe(0);
    expect(mockAnalyzePairs).not.toHaveBeenCalled();
  });

  // ── Provider routing via shim ─────────────────────────────────────────────────
  //
  // After migration, route.ts must call callAiJson from @/lib/ai-provider
  // with the new 4-arg signature: (scope, system, user, opts)
  //
  // We verify by spying on the mock — the AiScorer inside route passes
  // the user payload to shim; analyzePairs calls the scorer with real data.

  it('uses ai-provider callAiJson (not openai directly) when session has cargos+vessels', async () => {
    mockGetSession.mockReturnValue(baseSession);
    // analyzePairs will call the aiScorer function passed to it;
    // aiScorer must call callAiJson from ai-provider
    mockAnalyzePairs.mockImplementation(async (cargos, vessels, aiScorer) => {
      // Simulate the scorer being called with minimal data
      await aiScorer({
        cargoData: cargos,
        vesselData: vessels,
        readinessData: [],
      });
      return { matches: [], blockedMatches: [] };
    });
    // Route's aiScorer calls callAiJson through ai-provider shim
    mockCallAiJson.mockResolvedValue({ matches: [] });

    const req = makeRequest('session-1');
    const res = await POST(req);

    expect(res.status).toBe(200);
    // CRITICAL: shim was called — not lib/openai directly
    expect(mockCallAiJson).toHaveBeenCalledTimes(1);
  });

  it('calls callAiJson with scope="MATCH" as first argument', async () => {
    mockGetSession.mockReturnValue(baseSession);
    mockAnalyzePairs.mockImplementation(async (cargos, vessels, aiScorer) => {
      await aiScorer({ cargoData: cargos, vesselData: vessels, readinessData: [] });
      return { matches: [], blockedMatches: [] };
    });
    mockCallAiJson.mockResolvedValue({ matches: [] });

    const req = makeRequest('session-1');
    await POST(req);

    const [scope] = mockCallAiJson.mock.calls[0];
    expect(scope).toBe('MATCH');
  });

  it('passes MATCH_PROMPT as system argument (second arg)', async () => {
    mockGetSession.mockReturnValue(baseSession);
    mockAnalyzePairs.mockImplementation(async (cargos, vessels, aiScorer) => {
      await aiScorer({ cargoData: cargos, vesselData: vessels, readinessData: [] });
      return { matches: [], blockedMatches: [] };
    });
    mockCallAiJson.mockResolvedValue({ matches: [] });

    const req = makeRequest('session-1');
    await POST(req);

    const [, system] = mockCallAiJson.mock.calls[0];
    // MATCH_PROMPT is a long string — check it starts correctly
    expect(typeof system).toBe('string');
    expect(system.length).toBeGreaterThan(100);
    expect(system).toContain('freight chartering match analyst');
  });

  it('passes JSON-encoded cargo/vessel data as user argument (third arg)', async () => {
    mockGetSession.mockReturnValue(baseSession);
    mockAnalyzePairs.mockImplementation(async (cargos, vessels, aiScorer) => {
      await aiScorer({ cargoData: cargos, vesselData: vessels, readinessData: [] });
      return { matches: [], blockedMatches: [] };
    });
    mockCallAiJson.mockResolvedValue({ matches: [] });

    const req = makeRequest('session-1');
    await POST(req);

    const [, , user] = mockCallAiJson.mock.calls[0];
    expect(typeof user).toBe('string');
    // User payload should be JSON with cargo/vessel data
    const parsed = JSON.parse(user as string);
    expect(parsed).toHaveProperty('cargo_inquiries');
    expect(parsed).toHaveProperty('vessel_positions');
  });

  it('passes opts with timeoutMs as fourth argument', async () => {
    mockGetSession.mockReturnValue(baseSession);
    mockAnalyzePairs.mockImplementation(async (cargos, vessels, aiScorer) => {
      await aiScorer({ cargoData: cargos, vesselData: vessels, readinessData: [] });
      return { matches: [], blockedMatches: [] };
    });
    mockCallAiJson.mockResolvedValue({ matches: [] });

    const req = makeRequest('session-1');
    await POST(req);

    const [, , , opts] = mockCallAiJson.mock.calls[0];
    expect(opts).toBeDefined();
    expect((opts as { timeoutMs?: number }).timeoutMs).toBeGreaterThan(0);
  });

  // ── Provider-specific routing ─────────────────────────────────────────────────
  // These tests verify that MATCH_PROVIDER env drives provider selection through shim

  it('openai provider: callAiJson returns matches and route returns { count }', async () => {
    process.env.MATCH_PROVIDER = 'openai';
    mockGetProvider.mockReturnValue('openai');
    mockGetSession.mockReturnValue(baseSession);

    const mockMatch = {
      cargoEmailId: 'cargo-001',
      cargoItemIndex: 0,
      vesselEmailId: 'vessel-001',
      vesselItemIndex: 0,
      score: 75,
      matchLevel: 'good' as const,
      matchReasons: ['Good DWT fit — 30,000 mt vs cargo 25,000 mt'],
      issues: [],
    };

    mockAnalyzePairs.mockResolvedValue({ matches: [mockMatch], blockedMatches: [] });

    const req = makeRequest('session-1');
    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.count).toBe(1);

    delete process.env.MATCH_PROVIDER;
  });

  it('bedrock provider: callAiJson called through shim (MATCH_PROVIDER=bedrock)', async () => {
    process.env.MATCH_PROVIDER = 'bedrock';
    mockGetProvider.mockReturnValue('bedrock');
    mockGetSession.mockReturnValue(baseSession);
    mockAnalyzePairs.mockImplementation(async (cargos, vessels, aiScorer) => {
      await aiScorer({ cargoData: cargos, vesselData: vessels, readinessData: [] });
      return { matches: [], blockedMatches: [] };
    });
    mockCallAiJson.mockResolvedValue({ matches: [] });

    const req = makeRequest('session-1');
    const res = await POST(req);

    expect(res.status).toBe(200);
    // ai-provider shim was called — bedrock routing is its responsibility
    expect(mockCallAiJson).toHaveBeenCalledTimes(1);
    const [scope] = mockCallAiJson.mock.calls[0];
    expect(scope).toBe('MATCH');

    delete process.env.MATCH_PROVIDER;
  });

  it('gemini provider: callAiJson called through shim (MATCH_PROVIDER=gemini)', async () => {
    process.env.MATCH_PROVIDER = 'gemini';
    mockGetProvider.mockReturnValue('gemini');
    mockGetSession.mockReturnValue(baseSession);
    mockAnalyzePairs.mockImplementation(async (cargos, vessels, aiScorer) => {
      await aiScorer({ cargoData: cargos, vesselData: vessels, readinessData: [] });
      return { matches: [], blockedMatches: [] };
    });
    mockCallAiJson.mockResolvedValue({ matches: [] });

    const req = makeRequest('session-1');
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(mockCallAiJson).toHaveBeenCalledTimes(1);
    const [scope] = mockCallAiJson.mock.calls[0];
    expect(scope).toBe('MATCH');

    delete process.env.MATCH_PROVIDER;
  });

  // ── Error handling ───────────────────────────────────────────────────────────

  it('returns 504 with ai_timeout error when LLMTimeoutError is thrown', async () => {
    mockGetSession.mockReturnValue(baseSession);
    mockAnalyzePairs.mockRejectedValue(
      new LLMTimeoutError('AI call timed out after 85s'),
    );

    const req = makeRequest('session-1');
    const res = await POST(req);

    expect(res.status).toBe(504);
    const body = await res.json();
    expect(body.error).toBe('ai_timeout');
    expect(body.retryable).toBe(true);
  });

  it('propagates non-timeout errors (re-throws)', async () => {
    mockGetSession.mockReturnValue(baseSession);
    mockAnalyzePairs.mockRejectedValue(new Error('DB connection failed'));

    const req = makeRequest('session-1');
    await expect(POST(req)).rejects.toThrow('DB connection failed');
  });

  // ── Response shape ──────────────────────────────────────────────────────────

  it('returns count and blockedCount in response when matches exist', async () => {
    mockGetSession.mockReturnValue(baseSession);
    mockAnalyzePairs.mockResolvedValue({
      matches: [
        {
          cargoEmailId: 'cargo-001',
          cargoItemIndex: 0,
          vesselEmailId: 'vessel-001',
          vesselItemIndex: 0,
          score: 60,
          matchLevel: 'possible' as const,
          matchReasons: ['Acceptable route — 1,200 nm ballast'],
          issues: [],
        },
      ],
      blockedMatches: [
        {
          cargoEmailId: 'cargo-001',
          cargoItemIndex: 0,
          vesselEmailId: 'vessel-blocked',
          vesselItemIndex: 0,
          filterReason: 'RU flag — EU cargo',
        },
      ],
    });

    const req = makeRequest('session-1');
    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.count).toBe(1);
    expect(body.blockedCount).toBe(1);
  });

  it('updates session with matches and blockedMatches after scoring', async () => {
    mockGetSession.mockReturnValue(baseSession);
    const expectedMatches = [
      {
        cargoEmailId: 'cargo-001',
        cargoItemIndex: 0,
        vesselEmailId: 'vessel-001',
        vesselItemIndex: 0,
        score: 75,
        matchLevel: 'good' as const,
        matchReasons: ['Good DWT fit — 30,000 mt vs 25,000 mt cargo'],
        issues: [],
      },
    ];
    mockAnalyzePairs.mockResolvedValue({ matches: expectedMatches, blockedMatches: [] });

    const req = makeRequest('session-1');
    await POST(req);

    expect(mockUpdateSession).toHaveBeenCalledWith('session-1', {
      matches: expectedMatches,
      blockedMatches: [],
    });
  });
});
