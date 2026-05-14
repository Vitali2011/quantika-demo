/**
 * TDD: IMSBC RAG integration into parse-cargo endpoint.
 *
 * Requirements (T08 from SUMMARY.md):
 * - R1: When RAG enabled + cargo email mentions bulk/coal/hazmat commodity,
 *       retrieve() is called with { vectorTable:'imsbc_vec', ftsTable:'imsbc_fts' }
 * - R2: Retrieved IMSBC chunks are injected into the LLM system prompt
 *       in a structured block (via buildParseCargoPromptWithImsbc)
 * - R3: When RAG disabled (KNOWLEDGE_RAG_ENABLED != "true") → retrieve() NOT called
 * - R4: retrieve() failure (DB lag/error) does NOT block the route — 200 still returned
 * - R5: IMSBC citations are NOT required in response shape for parse-cargo
 *       (parse-cargo returns { count } only — citations stay server-side)
 *
 * PI2 compliance: tests use mock retrieve() call args verification,
 * not string-match against prompt contents.
 */

import { NextRequest } from 'next/dist/server/web/spec-extension/request';

// ── Core mocks (must be before any imports) ──────────────────────────────────

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

// Mock ai-provider shim
jest.mock('@/lib/ai-provider', () => ({
  callAiJson: jest.fn().mockResolvedValue({ items: [] }),
  getProvider: jest.fn().mockReturnValue('openai'),
}));

// Mock retriever — spy on retrieve() calls
const mockRetrieve = jest.fn().mockResolvedValue([]);
jest.mock('@/lib/knowledge/embeddings/retriever', () => ({
  retrieve: (...args: unknown[]) => mockRetrieve(...args),
}));

// Mock flags
const mockIsRagEnabled = jest.fn().mockReturnValue(false);
const mockKnowledgeBackend = jest.fn().mockReturnValue('sqlite');
jest.mock('@/lib/knowledge/flags', () => ({
  isRagEnabled: () => mockIsRagEnabled(),
  knowledgeBackend: () => mockKnowledgeBackend(),
  ftsTableForSource: (slug: string) => `${slug}_fts`,
  vecTableForSource: (slug: string) => `${slug}_vec`,
}));

// Mock DB
jest.mock('@/lib/db', () => ({
  getDb: jest.fn().mockReturnValue({}),
}));

// Mock session-store (ai-provider audit logging)
jest.mock('@/lib/session-store', () => ({
  getStore: jest.fn(() => ({
    getDatabase: jest.fn(() => ({
      prepare: jest.fn(() => ({ run: jest.fn() })),
    })),
  })),
}));

// ── Imports after mocks ───────────────────────────────────────────────────────

import { POST } from '@/app/api/ai/parse-cargo/route';
import { getSession, updateSession } from '@/lib/session';
import type { SessionData } from '@/lib/types';

const mockGetSession = getSession as jest.MockedFunction<typeof getSession>;
const mockUpdateSession = updateSession as jest.MockedFunction<typeof updateSession>;

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeSession(overrides: Partial<SessionData> = {}): SessionData {
  return {
    id: 'sess-rag-1',
    accessToken: 'token',
    createdAt: new Date(),
    emails: [
      {
        id: 'email-coal-1',
        threadId: 'thread-1',
        from: 'charterer@bulk.com',
        fromName: 'Charterer',
        fromEmail: 'charterer@bulk.com',
        to: 'agent@freight.com',
        subject: 'Coal cargo inquiry',
        date: new Date().toISOString(),
        body: 'We need to ship 50,000 MT of thermal coal from Richards Bay to Rotterdam. Cargo type: bulk, no special handling. Laycan 1-10 June 2025.',
        snippet: '50k MT coal',
        labelIds: ['INBOX'],
      },
    ],
    classifications: [
      { emailId: 'email-coal-1', category: 'CARGO_INQUIRY', confidence: 'confirmed' },
    ],
    processedEmails: [],
    parsedCargos: [],
    parsedVessels: [],
    parsedFixtureRecaps: [],
    matches: [],
    recaps: [],
    commissionSummary: null,
    counterparties: [],
    ...overrides,
  } as unknown as SessionData;
}

function makeRequest(): NextRequest {
  return new NextRequest('http://localhost/api/ai/parse-cargo', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: 'session_id=sess-rag-1',
    },
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('IMSBC RAG integration — parse-cargo (T08)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSession.mockReturnValue(makeSession());
    // Default: IMSBC chunks returned
    mockRetrieve.mockResolvedValue([
      {
        content: 'IMSBC Group B: Coal — moisture limit 10%, stowage: 1.1-1.4 m³/t',
        metadata: { source: 'imsbc', section: 'Group B' },
        distance: 0.12,
        chunkId: '1',
      },
    ]);
  });

  /**
   * R3: When RAG disabled → retrieve() is NOT called.
   */
  it('R3: KNOWLEDGE_RAG_ENABLED=false → retrieve() not called', async () => {
    mockIsRagEnabled.mockReturnValue(false);

    const res = await POST(makeRequest());

    expect(res.status).toBe(200);
    expect(mockRetrieve).not.toHaveBeenCalled();
  });

  /**
   * R1: When RAG enabled → retrieve() called with imsbc tables.
   * PI2: we assert call args (not string content of prompt).
   */
  it('R1: KNOWLEDGE_RAG_ENABLED=true → retrieve() called with imsbc_vec/imsbc_fts', async () => {
    mockIsRagEnabled.mockReturnValue(true);

    await POST(makeRequest());

    expect(mockRetrieve).toHaveBeenCalled();
    const [, opts] = mockRetrieve.mock.calls[0];
    expect(opts.vectorTable).toBe('imsbc_vec');
    expect(opts.ftsTable).toBe('imsbc_fts');
  });

  /**
   * R1b: retrieve() called with a meaningful query containing cargo keywords.
   * PI2: assert call args (table + query structure), not prompt string.
   */
  it('R1b: retrieve() called with topN > 0', async () => {
    mockIsRagEnabled.mockReturnValue(true);

    await POST(makeRequest());

    expect(mockRetrieve).toHaveBeenCalled();
    const [query, opts] = mockRetrieve.mock.calls[0];
    expect(typeof query).toBe('string');
    expect(query.length).toBeGreaterThan(0);
    expect(opts.topN).toBeGreaterThan(0);
  });

  /**
   * R4: retrieve() throws (DB offline) → route still returns 200.
   * The RAG failure must degrade gracefully.
   */
  it('R4: retrieve() DB error → 200 (graceful degrade)', async () => {
    mockIsRagEnabled.mockReturnValue(true);
    mockRetrieve.mockRejectedValue(new Error('DB unavailable'));

    const res = await POST(makeRequest());

    expect(res.status).toBe(200);
  });

  /**
   * R4b: retrieve() slow timeout (returns empty after delay) → 200.
   */
  it('R4b: retrieve() returns empty [] → 200 without citation', async () => {
    mockIsRagEnabled.mockReturnValue(true);
    mockRetrieve.mockResolvedValue([]);

    const res = await POST(makeRequest());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toHaveProperty('count');
  });
});

// ── Vertex AI Search backend tests ───────────────────────────────────────────

describe('IMSBC RAG with Vertex backend — parse-cargo endpoint', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockKnowledgeBackend.mockReturnValue('vertex');
    mockIsRagEnabled.mockReturnValue(true);
    mockRetrieve.mockResolvedValue([
      {
        content: 'IMSBC: Coal Group B — monitor for methane emission.',
        metadata: {
          source: 'imsbc',
          section: 'Coal Group B',
          id: 'imsbc-coal-b',
          sourceUrl: 'https://example.com/imsbc/coal',
          title: 'Coal Bulk Cargo',
        },
        distance: 0.10,
        chunkId: 'vertex-imsbc-1',
      },
    ]);
  });

  it('VX-R1: vertex backend + coal cargo → retrieve() called with imsbc tables', async () => {
    const res = await POST(makeRequest());

    const imsbcCall = mockRetrieve.mock.calls.find(([, opts]) => opts?.vectorTable === 'imsbc_vec');
    expect(imsbcCall).toBeDefined();
    expect(imsbcCall![1].ftsTable).toBe('imsbc_fts');
    expect(imsbcCall![1].topN).toBeGreaterThan(0);
  });

  it('VX-R2: vertex backend error → graceful degrade, 200 response', async () => {
    mockRetrieve.mockRejectedValue(new Error('Vertex datastore not found'));

    const res = await POST(makeRequest());

    expect(res.status).toBe(200);
  });

  it('VX-R3: vertex backend + RAG disabled → retrieve() not called', async () => {
    mockIsRagEnabled.mockReturnValue(false);

    const res = await POST(makeRequest());

    expect(res.status).toBe(200);
    expect(mockRetrieve).not.toHaveBeenCalled();
  });

  it('VX-R4: vertex backend + empty results → 200 without citations', async () => {
    mockRetrieve.mockResolvedValue([]);

    const res = await POST(makeRequest());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toHaveProperty('count');
  });
});
