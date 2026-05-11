/**
 * TDD: IGC RAG integration into match endpoint.
 *
 * Requirements (T09 from SUMMARY.md):
 * - M1: When RAG enabled + cargo contains grain/gas description →
 *       IGC retrieve() called with { vectorTable:'igc_vec', ftsTable:'igc_fts' }
 * - M2: Retrieved IGC chunks injected into MATCH system prompt
 *       (via buildMatchPromptWithIgc) before LLM call
 * - M3: retrieve() failure → 200 with match count (graceful degrade)
 * - M4: RAG disabled → retrieve() NOT called
 * - M5: Match response shape unchanged: { count, blockedCount } — no citation fields
 *
 * PI2 compliance: assert on retrieve() call args + response structure,
 * NOT on string content of prompt.
 */

import { NextRequest } from 'next/dist/server/web/spec-extension/request';

// ── Core mocks ────────────────────────────────────────────────────────────────

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

jest.mock('@/lib/ai-provider', () => ({
  callAiJson: jest.fn(),
  getProvider: jest.fn().mockReturnValue('openai'),
}));

// pair-analyzer mock — controls the AI scoring path
const mockAnalyzePairs = jest.fn();
jest.mock('@/lib/matching/pair-analyzer', () => ({
  analyzePairs: (...args: unknown[]) => mockAnalyzePairs(...args),
}));

const mockRetrieve = jest.fn().mockResolvedValue([]);
jest.mock('@/lib/knowledge/embeddings/retriever', () => ({
  retrieve: (...args: unknown[]) => mockRetrieve(...args),
}));

const mockIsRagEnabled = jest.fn().mockReturnValue(false);
jest.mock('@/lib/knowledge/flags', () => ({
  isRagEnabled: () => mockIsRagEnabled(),
  ftsTableForSource: (slug: string) => `${slug}_fts`,
  vecTableForSource: (slug: string) => `${slug}_vec`,
}));

jest.mock('@/lib/db', () => ({
  getDb: jest.fn().mockReturnValue({}),
}));

jest.mock('@/lib/session-store', () => ({
  getStore: jest.fn(() => ({
    getDatabase: jest.fn(() => ({
      prepare: jest.fn(() => ({ run: jest.fn() })),
    })),
  })),
}));

// ── Imports after mocks ───────────────────────────────────────────────────────

import { POST } from '@/app/api/ai/match/route';
import { getSession, updateSession } from '@/lib/session';

const mockGetSession = getSession as jest.MockedFunction<typeof getSession>;
const mockUpdateSession = updateSession as jest.MockedFunction<typeof updateSession>;

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeGrainSession() {
  return {
    id: 'sess-match-grain',
    accessToken: 'tok',
    createdAt: new Date('2025-09-01'),
    emails: [],
    classifications: [],
    processedEmails: [],
    parsedCargos: [
      {
        emailId: 'email-grain-1',
        itemIndex: 0,
        cargoType: 'BULK',
        cargoDescription: { value: 'grain wheat moisture content 12%', confidence: 'confirmed', source_text: 'grain wheat moisture content 12%' },
        weightMt: { value: 25000, confidence: 'confirmed', source_text: '25,000 MT' },
        originPort: { value: 'Odessa', confidence: 'confirmed', source_text: 'Odessa' },
        destinationPort: { value: 'Casablanca', confidence: 'confirmed', source_text: 'Casablanca' },
        missingInfo: [],
      },
    ],
    parsedVessels: [
      {
        emailId: 'email-vessel-1',
        itemIndex: 0,
        vesselName: 'MV GRAIN STAR',
        dwt: 28000,
        cargoType: 'BULK',
        openPort: 'Constanta',
        openDate: { value: '2025-08-25', confidence: 'confirmed', source_text: '25 Aug' },
        missingInfo: [],
      },
    ],
    parsedFixtureRecaps: [],
    matches: [],
    recaps: [],
    commissionSummary: null,
    counterparties: [],
  };
}

function makeRequest(): NextRequest {
  return new NextRequest('http://localhost/api/ai/match', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: 'session_id=sess-match-grain',
    },
    body: JSON.stringify({}),
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('IGC RAG integration — match endpoint (T09)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSession.mockReturnValue(makeGrainSession() as unknown as ReturnType<typeof mockGetSession>);
    mockAnalyzePairs.mockResolvedValue({
      matches: [
        {
          cargoEmailId: 'email-grain-1',
          cargoItemIndex: 0,
          vesselEmailId: 'email-vessel-1',
          vesselItemIndex: 0,
          score: 75,
          matchLevel: 'good',
          matchReasons: ['DWT 28000 vs cargo 25000 MT — 89% utilization'],
          issues: [],
        },
      ],
      blockedMatches: [],
    });
    mockRetrieve.mockResolvedValue([
      {
        content: 'IGC Code Chapter 4: grain moisture limit 14%, angle of repose testing required',
        metadata: { source: 'igc', section: 'Chapter 4' },
        distance: 0.09,
        chunkId: '1',
      },
    ]);
  });

  /**
   * M4: RAG disabled → no retrieve() calls.
   */
  it('M4: KNOWLEDGE_RAG_ENABLED=false → retrieve() not called', async () => {
    mockIsRagEnabled.mockReturnValue(false);

    const res = await POST(makeRequest());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toHaveProperty('count');
    expect(mockRetrieve).not.toHaveBeenCalled();
  });

  /**
   * M1: Grain cargo + RAG enabled → IGC retrieve() called with igc_vec/igc_fts.
   * PI2: assert on call args, not prompt string.
   */
  it('M1: grain cargo + RAG enabled → retrieve() called with igc_vec/igc_fts', async () => {
    mockIsRagEnabled.mockReturnValue(true);

    await POST(makeRequest());

    const igcCall = mockRetrieve.mock.calls.find(([, opts]) => opts?.vectorTable === 'igc_vec');
    expect(igcCall).toBeDefined();
    expect(igcCall![1].ftsTable).toBe('igc_fts');
    expect(igcCall![1].topN).toBeGreaterThan(0);
  });

  /**
   * M1b: Query passed to retrieve() is a non-empty string.
   */
  it('M1b: retrieve() called with non-empty query string', async () => {
    mockIsRagEnabled.mockReturnValue(true);

    await POST(makeRequest());

    const igcCall = mockRetrieve.mock.calls.find(([, opts]) => opts?.vectorTable === 'igc_vec');
    expect(igcCall).toBeDefined();
    const [query] = igcCall!;
    expect(typeof query).toBe('string');
    expect(query.length).toBeGreaterThan(0);
  });

  /**
   * M3: retrieve() throws → route still returns 200 with match count.
   */
  it('M3: retrieve() throws → graceful degrade, 200 with count', async () => {
    mockIsRagEnabled.mockReturnValue(true);
    mockRetrieve.mockRejectedValue(new Error('vec0 table not found'));

    const res = await POST(makeRequest());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toHaveProperty('count');
  });

  /**
   * M5: Response shape is { count, blockedCount } — no citation fields in response.
   */
  it('M5: response shape unchanged — { count, blockedCount }, no igcCitations in body', async () => {
    mockIsRagEnabled.mockReturnValue(true);

    const res = await POST(makeRequest());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(typeof json.count).toBe('number');
    // Citations are server-side prompt enrichment only — not in response body
    expect(json.igcCitations).toBeUndefined();
    expect(json.imsbcCitations).toBeUndefined();
  });

  /**
   * M3b: Boundary — empty retrieve() result ([]) → match proceeds normally.
   * Class 1 boundary: empty array from retriever.
   */
  it('M3b (class 1): retrieve() returns [] → match proceeds normally, 200', async () => {
    mockIsRagEnabled.mockReturnValue(true);
    mockRetrieve.mockResolvedValue([]);

    const res = await POST(makeRequest());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.count).toBe(1);
  });
});
