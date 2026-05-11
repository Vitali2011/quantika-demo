/**
 * TDD: IMSBC + IGC RAG integration into draft-quote endpoint.
 *
 * Requirements (T08/T09 from SUMMARY.md):
 * - D1: Coal/bulk cargo → IMSBC retrieve() called with imsbc_vec/imsbc_fts
 * - D2: Grain/gas cargo (cargoType IGC-relevant) → IGC retrieve() called with igc_vec/igc_fts
 * - D3: Retrieved chunks injected into DRAFT_QUOTE system prompt (via prompt builder)
 * - D4: retrieve() failure → 200 response with draft (graceful degrade)
 * - D5: RAG disabled → no retrieve() calls
 * - D6: Response shape: { draft: string } — no citation fields in response
 *       (citations are server-side prompt enrichment only)
 *
 * PI2 compliance: assert on retrieve() call args, NOT on string content.
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
  callAiText: jest.fn().mockResolvedValue('Dear Client,\n\nWe confirm receipt of your inquiry.\n\nBest regards,\nQuantika'),
  getProvider: jest.fn().mockReturnValue('openai'),
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

import { POST } from '@/app/api/ai/draft-quote/route';
import { getSession } from '@/lib/session';

const mockGetSession = getSession as jest.MockedFunction<typeof getSession>;

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeCoalSession() {
  return {
    id: 'sess-coal-1',
    accessToken: 'tok',
    createdAt: new Date(),
    emails: [
      {
        id: 'email-coal-1',
        threadId: 'thread-1',
        from: 'John <john@bulk.com>',
        fromName: 'John',
        fromEmail: 'john@bulk.com',
        to: 'agent@q.com',
        subject: 'Coal inquiry',
        date: new Date().toISOString(),
        body: '50,000 MT thermal coal Richards Bay to Rotterdam',
        snippet: 'coal',
        labelIds: ['INBOX'],
      },
    ],
    classifications: [],
    processedEmails: [],
    parsedCargos: [
      {
        emailId: 'email-coal-1',
        itemIndex: 0,
        cargoType: 'BULK',
        cargoDescription: { value: 'thermal coal', confidence: 'confirmed', source_text: 'thermal coal' },
        weightMt: { value: 50000, confidence: 'confirmed', source_text: '50,000 MT' },
        originPort: { value: 'Richards Bay', confidence: 'confirmed', source_text: 'Richards Bay' },
        destinationPort: { value: 'Rotterdam', confidence: 'confirmed', source_text: 'Rotterdam' },
        missingInfo: [],
      },
    ],
    parsedVessels: [],
    parsedFixtureRecaps: [],
    matches: [],
    recaps: [],
    commissionSummary: null,
    counterparties: [],
  };
}

function makeGrainSession() {
  return {
    ...makeCoalSession(),
    id: 'sess-grain-1',
    parsedCargos: [
      {
        emailId: 'email-coal-1',
        itemIndex: 0,
        cargoType: 'BULK',
        cargoDescription: { value: 'grain wheat', confidence: 'confirmed', source_text: 'grain wheat' },
        weightMt: { value: 30000, confidence: 'confirmed', source_text: '30,000 MT' },
        originPort: { value: 'Odessa', confidence: 'confirmed', source_text: 'Odessa' },
        destinationPort: { value: 'Casablanca', confidence: 'confirmed', source_text: 'Casablanca' },
        missingInfo: [],
      },
    ],
  };
}

function makeRequest(emailId: string, sessionId: string): NextRequest {
  return new NextRequest('http://localhost/api/ai/draft-quote', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: `session_id=${sessionId}`,
    },
    body: JSON.stringify({ emailId }),
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('IMSBC + IGC RAG integration — draft-quote (T08/T09)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRetrieve.mockResolvedValue([
      {
        content: 'IMSBC: Coal must be monitored for methane emission. Stowage factor 0.83-0.96 m³/t.',
        metadata: { source: 'imsbc', section: 'Coal Group B' },
        distance: 0.1,
        chunkId: '1',
      },
    ]);
  });

  /**
   * D5: RAG disabled → no retrieve() calls at all.
   */
  it('D5: KNOWLEDGE_RAG_ENABLED=false → retrieve() not called', async () => {
    mockIsRagEnabled.mockReturnValue(false);
    mockGetSession.mockReturnValue(makeCoalSession() as unknown as ReturnType<typeof mockGetSession>);

    const res = await POST(makeRequest('email-coal-1', 'sess-coal-1'));

    expect(res.status).toBe(200);
    expect(mockRetrieve).not.toHaveBeenCalled();
  });

  /**
   * D1: Coal bulk cargo → IMSBC retrieve() called with correct tables.
   * PI2: assert call args (vectorTable/ftsTable), not prompt string.
   */
  it('D1: bulk/coal cargo + RAG enabled → retrieve() called with imsbc_vec/imsbc_fts', async () => {
    mockIsRagEnabled.mockReturnValue(true);
    mockGetSession.mockReturnValue(makeCoalSession() as unknown as ReturnType<typeof mockGetSession>);

    await POST(makeRequest('email-coal-1', 'sess-coal-1'));

    const imsbcCall = mockRetrieve.mock.calls.find(([, opts]) => opts?.vectorTable === 'imsbc_vec');
    expect(imsbcCall).toBeDefined();
    expect(imsbcCall![1].ftsTable).toBe('imsbc_fts');
    expect(imsbcCall![1].topN).toBeGreaterThan(0);
  });

  /**
   * D2: Grain cargo → IGC retrieve() called with igc_vec/igc_fts.
   * PI2: assert call args (vectorTable/ftsTable).
   */
  it('D2: grain cargo + RAG enabled → retrieve() called with igc_vec/igc_fts', async () => {
    mockIsRagEnabled.mockReturnValue(true);
    mockGetSession.mockReturnValue(makeGrainSession() as unknown as ReturnType<typeof mockGetSession>);
    mockRetrieve.mockResolvedValue([
      {
        content: 'IGC Code: grain cargo moisture requirements, Chapter 4',
        metadata: { source: 'igc', section: 'Chapter 4' },
        distance: 0.15,
        chunkId: '2',
      },
    ]);

    await POST(makeRequest('email-coal-1', 'sess-grain-1'));

    const igcCall = mockRetrieve.mock.calls.find(([, opts]) => opts?.vectorTable === 'igc_vec');
    expect(igcCall).toBeDefined();
    expect(igcCall![1].ftsTable).toBe('igc_fts');
  });

  /**
   * D4: retrieve() throws → route still returns 200 with draft.
   */
  it('D4: retrieve() error → graceful degrade, 200 with draft', async () => {
    mockIsRagEnabled.mockReturnValue(true);
    mockGetSession.mockReturnValue(makeCoalSession() as unknown as ReturnType<typeof mockGetSession>);
    mockRetrieve.mockRejectedValue(new Error('sqlite3 disk I/O error'));

    const res = await POST(makeRequest('email-coal-1', 'sess-coal-1'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(typeof json.draft).toBe('string');
  });

  /**
   * D6: Response shape is { draft: string } — no citation fields in response body.
   */
  it('D6: response shape is { draft: string } — no server-internal citation fields exposed', async () => {
    mockIsRagEnabled.mockReturnValue(true);
    mockGetSession.mockReturnValue(makeCoalSession() as unknown as ReturnType<typeof mockGetSession>);

    const res = await POST(makeRequest('email-coal-1', 'sess-coal-1'));
    const json = await res.json();

    expect(json).toHaveProperty('draft');
    expect(typeof json.draft).toBe('string');
    // Citations are server-side prompt enrichment — NOT in response body
    expect(json.imsbcCitations).toBeUndefined();
    expect(json.igcCitations).toBeUndefined();
  });
});
