/**
 * wave-γ-1.5-A: integration tests for parse-vessel demo pre-parse cache.
 *
 * Cycle 1: /api/ai/parse-vessel early-returns for demo session — no LLM call
 * Cycle 2: /api/ai/parse-vessel still hits LLM when parsedVessels empty (falls through)
 * Cycle 3: regression — non-demo session bypasses guard
 */

import { NextRequest } from 'next/dist/server/web/spec-extension/request';
import type { SessionData, ParsedVessel } from '@/lib/types';
import type { requireSession as RequireSessionFn } from '@/lib/session';

// ── Shared mocks ──────────────────────────────────────────────────────────

jest.mock('@/lib/csrf', () => ({
  validateCsrf: jest.fn().mockReturnValue(true),
  generateCsrfToken: jest.fn().mockReturnValue('mock-csrf'),
}));

jest.mock('@/lib/session', () => ({
  requireSession: jest.fn(),
  updateSession: jest.fn(),
  createSession: jest.fn().mockReturnValue('mock-session-id'),
  getSession: jest.fn(),
}));

jest.mock('@/lib/openai', () => ({
  callAiJson: jest.fn(),
  callAiText: jest.fn(),
  LLMTimeoutError: class LLMTimeoutError extends Error {},
}));

// Mock Equasis validation — not relevant for demo cache path
jest.mock('@/lib/validation/equasis-client', () => ({
  lookupVesselByImo: jest.fn().mockResolvedValue(null),
  compareVesselRecord: jest.fn().mockReturnValue(null),
}));

import { requireSession, updateSession } from '@/lib/session';
import { callAiText } from '@/lib/openai';
const mockRequireSession = requireSession as jest.MockedFunction<typeof RequireSessionFn>;
const mockUpdateSession = updateSession as jest.Mock;
const mockCallAiText = callAiText as jest.Mock;

function makeRequest(path: string): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: 'session_id=mock-session-id',
    },
  });
}

function makeSession(overrides: Partial<SessionData>): SessionData {
  return {
    accessToken: 'tok',
    emails: [],
    parsedCargos: [],
    parsedVessels: [],
    parsedRecaps: [],
    classifications: [
      {
        emailId: 'sample-13',
        category: 'VESSEL_POSITION',
        isUnanswered: false,
        urgency: 'low',
        daysWithoutReply: null,
        confidence: 1.0,
        originalSender: null,
        originalSenderCompany: null,
      },
    ],
    isSampleData: false,
    createdAt: new Date().toISOString(),
    ...overrides,
  } as unknown as SessionData;
}

function makeParsedVessels(count: number): ParsedVessel[] {
  return Array.from({ length: count }, (_, i) => ({
    emailId: `sample-${String(i + 13).padStart(2, '0')}`,
    itemIndex: 0,
    vesselName: { value: `TEST VESSEL ${i}`, confidence: 'confirmed' as const },
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
    nrt: null,
    holdsCount: null,
    hatchesCount: null,
    grainCapacity: null,
    grainCapacityUnit: null,
    baleCapacity: null,
    holdDimensions: null,
    hatchDimensions: null,
    tankTopStrength: null,
    geared: null,
    craneCapacity: null,
    hatchType: null,
    vesselType: null,
    openPosition: null,
    openDate: null,
    direction: null,
    restrictions: [],
    lastCargoes: null,
    speedLaden: null,
    speedBallast: null,
    consumption: null,
    deckCapacity: null,
    specialFeatures: [],
    ciiRating: null,
    verificationWarning: null,
  }));
}

// ── Cycle 1: /api/ai/parse-vessel early-return for demo session ────────────────

describe('Cycle 1: /api/ai/parse-vessel — demo guard early-return', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns {count:9, cached:true} without LLM call when isSampleData=true + parsedVessels pre-seeded', async () => {
    const parsedVessels = makeParsedVessels(9);

    mockRequireSession.mockReturnValue({
      session: makeSession({ isSampleData: true, parsedVessels }),
      sessionId: 'mock-session-id',
    });

    const { POST } = await import('@/app/api/ai/parse-vessel/route');
    const req = makeRequest('/api/ai/parse-vessel');
    const res = await POST(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.cached).toBe(true);
    expect(json.count).toBe(9);
    expect(mockCallAiText).not.toHaveBeenCalled();
  });

  it('does NOT call updateSession when returning cached response', async () => {
    const parsedVessels = makeParsedVessels(9);

    mockRequireSession.mockReturnValue({
      session: makeSession({ isSampleData: true, parsedVessels }),
      sessionId: 'mock-session-id',
    });

    const { POST } = await import('@/app/api/ai/parse-vessel/route');
    const req = makeRequest('/api/ai/parse-vessel');
    await POST(req);

    expect(mockUpdateSession).not.toHaveBeenCalled();
  });
});

// ── Cycle 2: falls through when parsedVessels empty ──────────────────────────

describe('Cycle 2: /api/ai/parse-vessel — empty parsedVessels falls through', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCallAiText.mockResolvedValue('[]');
  });

  it('does NOT early-return when isSampleData=true but parsedVessels=[] (falls through)', async () => {
    mockRequireSession.mockReturnValue({
      session: makeSession({
        isSampleData: true,
        parsedVessels: [],
        classifications: [],
      }),
      sessionId: 'mock-session-id',
    });

    const { POST } = await import('@/app/api/ai/parse-vessel/route');
    const req = makeRequest('/api/ai/parse-vessel');
    const res = await POST(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.cached).toBeUndefined();
  });
});

// ── Cycle 3: regression — non-demo session bypasses guard ─────────────────────

describe('Cycle 3: /api/ai/parse-vessel — non-demo session bypasses guard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCallAiText.mockResolvedValue('[]');
  });

  it('non-demo session (isSampleData=false) does NOT return cached:true', async () => {
    const parsedVessels = makeParsedVessels(9);

    mockRequireSession.mockReturnValue({
      session: makeSession({
        isSampleData: false,
        parsedVessels,
        classifications: [],
      }),
      sessionId: 'mock-session-id',
    });

    const { POST } = await import('@/app/api/ai/parse-vessel/route');
    const req = makeRequest('/api/ai/parse-vessel');
    const res = await POST(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.cached).toBeUndefined();
  });

  it('session without isSampleData (undefined) also bypasses the demo guard', async () => {
    const parsedVessels = makeParsedVessels(9);

    mockRequireSession.mockReturnValue({
      session: makeSession({
        isSampleData: undefined as unknown as boolean,
        parsedVessels,
        classifications: [],
      }),
      sessionId: 'mock-session-id',
    });

    const { POST } = await import('@/app/api/ai/parse-vessel/route');
    const req = makeRequest('/api/ai/parse-vessel');
    const res = await POST(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.cached).toBeUndefined();
  });
});
