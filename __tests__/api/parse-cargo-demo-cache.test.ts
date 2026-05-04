/**
 * wave-γ-3-demo: integration tests for demo pre-parse cache.
 *
 * Cycle 3: /api/sample seeds parsedCargos when isSampleData=true (unit-level verify)
 * Cycle 4: /api/ai/parse-cargo early-returns for demo session (no LLM call)
 * Cycle 5: /api/ai/parse-cargo still hits LLM for non-demo session (regression guard)
 */

import { NextRequest } from 'next/dist/server/web/spec-extension/request';
import type { SessionData } from '@/lib/types';
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
  LLMTimeoutError: class LLMTimeoutError extends Error {},
}));

import { requireSession, updateSession } from '@/lib/session';
import { callAiJson } from '@/lib/openai';
const mockRequireSession = requireSession as jest.MockedFunction<typeof RequireSessionFn>;
const mockUpdateSession = updateSession as jest.Mock;
const mockCallAiJson = callAiJson as jest.Mock;

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
    classifications: [],
    isSampleData: false,
    createdAt: new Date().toISOString(),
    ...overrides,
  } as unknown as SessionData;
}

// ── Cycle 3: /api/sample seeds parsedCargos ────────────────────────────────

describe('Cycle 3: /api/sample seeds parsedCargos via resolveDemoParsedCargoes', () => {
  it('resolveDemoParsedCargoes returns 5 ParsedCargo records seeded correctly', async () => {
    // Verify the loader produces the right shape for what sample/route.ts would call
    const { resolveDemoParsedCargoes } = await import('@/lib/sample-data/demo-parsed-cargoes');
    const today = new Date('2026-05-10T00:00:00.000Z');
    const cargoes = resolveDemoParsedCargoes(today);

    expect(cargoes).toHaveLength(5);
    expect(cargoes[0].emailId).toBe('sample-01');
    expect(cargoes[0].laycan).toMatch(/^\d{4}-\d{2}-\d{2} \.\. \d{4}-\d{2}-\d{2}$/);
    // Verify laycan start is after seed date
    const [startStr] = cargoes[0].laycan!.split(' .. ');
    expect(new Date(startStr).getTime()).toBeGreaterThan(today.getTime());
  });

  it('/api/sample calls updateSession with parsedCargos when isSampleData=true', async () => {
    mockUpdateSession.mockReturnValue(true);
    // Import after mocks are set
    const { POST } = await import('@/app/api/sample/route');
    const req = new NextRequest('http://localhost/api/sample', {
      method: 'POST',
      headers: { cookie: 'csrf_token=mock-csrf', 'x-csrf-token': 'mock-csrf' },
    });
    await POST(req);

    // updateSession must have been called with parsedCargos
    expect(mockUpdateSession).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        isSampleData: true,
        parsedCargos: expect.arrayContaining([
          expect.objectContaining({ emailId: 'sample-01', itemIndex: 0 }),
        ]),
      })
    );

    // parsedCargos in the call should have 5 items
    const callArgs = mockUpdateSession.mock.calls[mockUpdateSession.mock.calls.length - 1];
    const payload = callArgs[1] as Partial<SessionData>;
    expect(payload.parsedCargos).toHaveLength(5);
    // laycan should be resolved (absolute date, not +Nd)
    const firstLaycan = payload.parsedCargos![0].laycan;
    expect(firstLaycan).toMatch(/^\d{4}-\d{2}-\d{2} \.\. \d{4}-\d{2}-\d{2}$/);
  });
});

// ── Cycle 4: /api/ai/parse-cargo early-return for demo session ────────────

describe('Cycle 4: /api/ai/parse-cargo — demo guard early-return', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns {count, cached:true} without LLM call when isSampleData=true + parsedCargos pre-seeded', async () => {
    const { resolveDemoParsedCargoes } = await import('@/lib/sample-data/demo-parsed-cargoes');
    const cargoes = resolveDemoParsedCargoes(new Date());

    mockRequireSession.mockReturnValue({
      session: makeSession({ isSampleData: true, parsedCargos: cargoes }),
      sessionId: 'mock-session-id',
    });

    const { POST } = await import('@/app/api/ai/parse-cargo/route');
    const req = makeRequest('/api/ai/parse-cargo');
    const res = await POST(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.cached).toBe(true);
    expect(json.count).toBe(5);
    expect(mockCallAiJson).not.toHaveBeenCalled();
  });

  it('does NOT early-return when isSampleData=true but parsedCargos=[] (falls through)', async () => {
    mockRequireSession.mockReturnValue({
      session: makeSession({ isSampleData: true, parsedCargos: [], classifications: [] }),
      sessionId: 'mock-session-id',
    });

    mockCallAiJson.mockResolvedValue({ cargoes: [] });

    const { POST } = await import('@/app/api/ai/parse-cargo/route');
    const req = makeRequest('/api/ai/parse-cargo');
    const res = await POST(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.cached).toBeUndefined();
  });
});

// ── Cycle 4b: /api/sample seeds all 4 session fields (wave-γ-1.5-A) ──────────

describe('Cycle 4b: /api/sample — full cache seed (classifications + parsedVessels + processedEmails)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdateSession.mockReturnValue(true);
  });

  it('updateSession payload includes classifications with 32 entries', async () => {
    const { POST } = await import('@/app/api/sample/route');
    const req = new NextRequest('http://localhost/api/sample', {
      method: 'POST',
      headers: { cookie: 'csrf_token=mock-csrf', 'x-csrf-token': 'mock-csrf' },
    });
    await POST(req);

    const callArgs = mockUpdateSession.mock.calls[mockUpdateSession.mock.calls.length - 1];
    const payload = callArgs[1] as Partial<SessionData>;
    expect(payload.classifications).toHaveLength(32);
  });

  it('updateSession payload includes parsedVessels with 9 entries', async () => {
    const { POST } = await import('@/app/api/sample/route');
    const req = new NextRequest('http://localhost/api/sample', {
      method: 'POST',
      headers: { cookie: 'csrf_token=mock-csrf', 'x-csrf-token': 'mock-csrf' },
    });
    await POST(req);

    const callArgs = mockUpdateSession.mock.calls[mockUpdateSession.mock.calls.length - 1];
    const payload = callArgs[1] as Partial<SessionData>;
    expect(payload.parsedVessels).toHaveLength(9);
  });

  it('updateSession payload includes processedEmails with 32 entries', async () => {
    const { POST } = await import('@/app/api/sample/route');
    const req = new NextRequest('http://localhost/api/sample', {
      method: 'POST',
      headers: { cookie: 'csrf_token=mock-csrf', 'x-csrf-token': 'mock-csrf' },
    });
    await POST(req);

    const callArgs = mockUpdateSession.mock.calls[mockUpdateSession.mock.calls.length - 1];
    const payload = callArgs[1] as Partial<SessionData>;
    expect(payload.processedEmails).toHaveLength(32);
  });

  it('classifications include sample-01 as CARGO_INQUIRY', async () => {
    const { POST } = await import('@/app/api/sample/route');
    const req = new NextRequest('http://localhost/api/sample', {
      method: 'POST',
      headers: { cookie: 'csrf_token=mock-csrf', 'x-csrf-token': 'mock-csrf' },
    });
    await POST(req);

    const callArgs = mockUpdateSession.mock.calls[mockUpdateSession.mock.calls.length - 1];
    const payload = callArgs[1] as Partial<SessionData>;
    const cls = payload.classifications!.find(c => c.emailId === 'sample-01');
    expect(cls).toBeDefined();
    expect(cls!.category).toBe('CARGO_INQUIRY');
  });
});

// ── Cycle 5: regression — non-demo session still hits LLM ─────────────────

describe('Cycle 5: /api/ai/parse-cargo — non-demo session bypasses guard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCallAiJson.mockResolvedValue({ cargoes: [] });
  });

  it('non-demo session (isSampleData=false) does NOT return cached:true', async () => {
    mockRequireSession.mockReturnValue({
      session: makeSession({ isSampleData: false, parsedCargos: [], classifications: [] }),
      sessionId: 'mock-session-id',
    });

    const { POST } = await import('@/app/api/ai/parse-cargo/route');
    const req = makeRequest('/api/ai/parse-cargo');
    const res = await POST(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.cached).toBeUndefined();
    expect(json.count).toBe(0);
  });

  it('session without isSampleData (undefined) also bypasses the demo guard', async () => {
    mockRequireSession.mockReturnValue({
      session: makeSession({ isSampleData: undefined as unknown as boolean, parsedCargos: [], classifications: [] }),
      sessionId: 'mock-session-id',
    });

    const { POST } = await import('@/app/api/ai/parse-cargo/route');
    const req = makeRequest('/api/ai/parse-cargo');
    const res = await POST(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.cached).toBeUndefined();
  });
});
