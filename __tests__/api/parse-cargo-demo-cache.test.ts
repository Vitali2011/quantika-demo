/**
 * Demo pre-parse cache integration tests.
 *
 * Cycle 3: /api/sample seeds parsedCargos when isSampleData=true.
 * Cycle 4: /api/ai/parse-cargo early-returns for demo session (no LLM call).
 * Cycle 4b: /api/sample seeds all four session fields.
 * Cycle 5: /api/ai/parse-cargo still hits the parse path for non-demo sessions.
 *
 * After the ETMS-corpus migration (2026-05-14) hardcoded counts (13 cargoes,
 * 10 vessels, 32 classifications) and 'sample-NN' IDs are replaced with values
 * derived from the committed fixtures.
 */

import { NextRequest } from 'next/dist/server/web/spec-extension/request';
import type { SessionData } from '@/lib/types';
import type { requireSession as RequireSessionFn } from '@/lib/session';
import cargoInquiries from '@/lib/sample-data/cargo-inquiries.json';

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

const FIRST_CARGO_EMAIL_ID = (cargoInquiries as Array<{ id: string }>)[0].id;

// ── Cycle 3: /api/sample seeds parsedCargos ────────────────────────────────

describe('Cycle 3: /api/sample seeds parsedCargos via resolveDemoParsedCargoes', () => {
  it('resolveDemoParsedCargoes returns a non-empty array with absolute laycan strings', async () => {
    const { resolveDemoParsedCargoes } = await import('@/lib/sample-data/demo-parsed-cargoes');
    const today = new Date('2026-05-10T00:00:00.000Z');
    const cargoes = resolveDemoParsedCargoes(today);
    expect(cargoes.length).toBeGreaterThan(0);
    // Synthetic record is appended by the resolver — its laycan is always absolute future.
    const synthetic = cargoes.find((c) => c.emailId === 'demo-cargo-economics');
    expect(synthetic).toBeDefined();
    expect(synthetic!.laycan).toMatch(/^\d{4}-\d{2}-\d{2} \.\. \d{4}-\d{2}-\d{2}$/);
    const [startStr] = synthetic!.laycan!.split(' .. ');
    expect(new Date(startStr).getTime()).toBeGreaterThan(today.getTime());
  });

  it('/api/sample calls updateSession with parsedCargos when isSampleData=true', async () => {
    mockUpdateSession.mockReturnValue(true);
    const { POST } = await import('@/app/api/sample/route');
    const req = new NextRequest('http://localhost/api/sample', {
      method: 'POST',
      headers: { cookie: 'csrf_token=mock-csrf', 'x-csrf-token': 'mock-csrf' },
    });
    await POST(req);

    const { resolveDemoParsedCargoes } = await import('@/lib/sample-data/demo-parsed-cargoes');
    const expectedCount = resolveDemoParsedCargoes(new Date()).length;

    expect(mockUpdateSession).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ isSampleData: true }),
    );

    const callArgs = mockUpdateSession.mock.calls[mockUpdateSession.mock.calls.length - 1];
    const payload = callArgs[1] as Partial<SessionData>;
    expect(payload.parsedCargos).toHaveLength(expectedCount);
    // Every laycan in the payload must be absolute (no +Nd offsets).
    for (const c of payload.parsedCargos!) {
      if (c.laycan !== null && c.laycan !== undefined) {
        expect(c.laycan).not.toMatch(/\+\d+d/);
      }
    }
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
    expect(json.count).toBe(cargoes.length);
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

// ── Cycle 4b: /api/sample seeds all 4 session fields ──────────

describe('Cycle 4b: /api/sample — full cache seed (classifications + parsedVessels + processedEmails)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdateSession.mockReturnValue(true);
  });

  async function callSampleRoute(): Promise<Partial<SessionData>> {
    const { POST } = await import('@/app/api/sample/route');
    const req = new NextRequest('http://localhost/api/sample', {
      method: 'POST',
      headers: { cookie: 'csrf_token=mock-csrf', 'x-csrf-token': 'mock-csrf' },
    });
    await POST(req);
    const callArgs = mockUpdateSession.mock.calls[mockUpdateSession.mock.calls.length - 1];
    return callArgs[1] as Partial<SessionData>;
  }

  it('classifications length matches the resolver output', async () => {
    const payload = await callSampleRoute();
    const { resolveDemoClassifications } = await import('@/lib/sample-data/demo-parsed-cargoes');
    expect(payload.classifications).toHaveLength(resolveDemoClassifications().length);
  });

  it('parsedVessels length matches the resolver output (corpus + synthetic)', async () => {
    const payload = await callSampleRoute();
    const { resolveDemoParsedVessels } = await import('@/lib/sample-data/demo-parsed-cargoes');
    expect(payload.parsedVessels).toHaveLength(resolveDemoParsedVessels(new Date()).length);
  });

  it('processedEmails length matches the classifications length', async () => {
    const payload = await callSampleRoute();
    const { resolveDemoClassifications } = await import('@/lib/sample-data/demo-parsed-cargoes');
    expect(payload.processedEmails).toHaveLength(resolveDemoClassifications().length);
  });

  it('classifications include the first cargo-inquiry email as CARGO_INQUIRY', async () => {
    const payload = await callSampleRoute();
    const cls = payload.classifications!.find((c) => c.emailId === FIRST_CARGO_EMAIL_ID);
    expect(cls).toBeDefined();
    expect(cls!.category).toBe('CARGO_INQUIRY');
  });
});

// ── Cycle 5: regression — non-demo session bypasses guard ─────────────────

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
