// ── Mocks (must be before imports) ───────────────────────────────────────────

jest.mock('@/lib/ai-provider', () => ({
  callAiText: jest.fn(),
}));

jest.mock('@/lib/openai', () => ({
  // LLMTimeoutError is still imported by route.ts for instanceof checks
  LLMTimeoutError: class LLMTimeoutError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'LLMTimeoutError';
    }
  },
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

jest.mock('@/lib/validation/equasis-client', () => ({
  lookupVesselByImo: jest.fn().mockResolvedValue(null),
  compareVesselRecord: jest.fn().mockReturnValue(null),
}));

jest.mock('@/lib/classification-service', () => ({
  buildProcessedEmails: jest.fn().mockReturnValue([]),
}));

// ── Imports ───────────────────────────────────────────────────────────────────

import { NextRequest } from 'next/dist/server/web/spec-extension/request';
import { POST } from '@/app/api/ai/parse-vessel/route';
import { callAiText } from '@/lib/ai-provider';
import { getSession, updateSession } from '@/lib/session';
import type { SessionData } from '@/lib/types';
import {
  buildVesselPrompt,
  parseVesselAIResponse,
} from '@/lib/parsing/parse-vessel-helpers';
import type { Email } from '@/lib/types';

// ── Type helpers ──────────────────────────────────────────────────────────────

const mockCallAiText = callAiText as jest.MockedFunction<typeof callAiText>;
const mockGetSession = getSession as jest.MockedFunction<typeof getSession>;
const mockUpdateSession = updateSession as jest.MockedFunction<typeof updateSession>;

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeEmail(overrides: Partial<Email> = {}): Email {
  return {
    id: 'email-1',
    threadId: 'thread-1',
    from: 'test@example.com',
    fromName: 'Test User',
    fromEmail: 'test@example.com',
    to: 'broker@example.com',
    subject: 'MV OCEAN STAR - Open Position',
    date: '2024-01-15T10:00:00Z',
    body: 'Vessel MV OCEAN STAR open Gibraltar Jan 20.',
    snippet: 'Vessel MV OCEAN STAR open Gibraltar Jan 20.',
    labelIds: ['INBOX'],
    ...overrides,
  };
}

function makeSession(overrides: Partial<SessionData> = {}): SessionData {
  return {
    id: 'sess-1',
    accessToken: 'token',
    createdAt: new Date(),
    emails: [],
    classifications: [],
    processedEmails: [],
    parsedCargos: [],
    parsedVessels: [],
    parsedFixtureRecaps: [],
    matches: [],
    recaps: [],
    commissionSummary: null,
    counterparties: [],
    ...overrides,
  };
}

function makeRequest(sessionId?: string): NextRequest {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    origin: 'http://localhost:3000',
  };
  if (sessionId) {
    headers['Cookie'] = `session_id=${sessionId}`;
  }
  return new NextRequest('http://localhost/api/ai/parse-vessel', {
    method: 'POST',
    headers,
  });
}

// Minimal vessel JSON that parseVesselAIResponse can handle
const VESSEL_JSON = JSON.stringify({
  vessel_name: { value: 'OCEAN STAR', confidence: 'confirmed' },
  imo: '9074729',
  flag: 'Panama',
  dwt_summer: { value: 75000, confidence: 'confirmed' },
  open_position: { value: 'Gibraltar', confidence: 'confirmed' },
  open_date: { value: '2024-01-20', confidence: 'confirmed' },
  restrictions: [],
  special_features: [],
});

beforeEach(() => {
  jest.clearAllMocks();
});

// ── Route: auth guard ─────────────────────────────────────────────────────────

describe('POST /api/ai/parse-vessel — auth guard', () => {
  it('returns 401 when no session_id cookie', async () => {
    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'No session' });
  });

  it('returns 401 when session is expired', async () => {
    mockGetSession.mockReturnValue(null);
    const res = await POST(makeRequest('sess-1'));
    expect(res.status).toBe(401);
  });
});

// ── Route: empty vessel list ──────────────────────────────────────────────────

describe('POST /api/ai/parse-vessel — empty classifications', () => {
  it('returns count:0 when no VESSEL_POSITION emails', async () => {
    mockGetSession.mockReturnValue(makeSession());
    const res = await POST(makeRequest('sess-1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.count).toBe(0);
    expect(mockCallAiText).not.toHaveBeenCalled();
  });
});

// ── Route: shim routing ───────────────────────────────────────────────────────

describe('POST /api/ai/parse-vessel — shim routing', () => {
  const session = makeSession({
    emails: [makeEmail({ id: 'email-1' })],
    classifications: [
      { emailId: 'email-1', category: 'VESSEL_POSITION', confidence: 'confirmed' },
    ],
  });

  it('calls callAiText from @/lib/ai-provider with scope PARSE_VESSEL', async () => {
    mockGetSession.mockReturnValue(session);
    mockCallAiText.mockResolvedValue(VESSEL_JSON);

    await POST(makeRequest('sess-1'));

    expect(mockCallAiText).toHaveBeenCalledTimes(1);
    // First arg must be scope 'PARSE_VESSEL' — not a prompt string
    const [scope] = mockCallAiText.mock.calls[0];
    expect(scope).toBe('PARSE_VESSEL');
  });

  it('passes system prompt as second argument and user prompt as third', async () => {
    mockGetSession.mockReturnValue(session);
    mockCallAiText.mockResolvedValue(VESSEL_JSON);

    await POST(makeRequest('sess-1'));

    const [, system, user] = mockCallAiText.mock.calls[0];
    // system must be the vessel parser prompt (non-empty instruction string)
    expect(typeof system).toBe('string');
    expect(system.length).toBeGreaterThan(10);
    // user prompt must contain email body content
    expect(user).toContain('OCEAN STAR');
  });

  it('returns count matching parsed vessels', async () => {
    mockGetSession.mockReturnValue(session);
    mockCallAiText.mockResolvedValue(VESSEL_JSON);

    const res = await POST(makeRequest('sess-1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.count).toBe(1);
  });

  it('saves parsed vessels to session via updateSession', async () => {
    mockGetSession.mockReturnValue(session);
    mockCallAiText.mockResolvedValue(VESSEL_JSON);

    await POST(makeRequest('sess-1'));

    expect(mockUpdateSession).toHaveBeenCalledWith(
      'sess-1',
      expect.objectContaining({
        parsedVessels: expect.arrayContaining([
          expect.objectContaining({ emailId: 'email-1' }),
        ]),
      }),
    );
  });
});

// ── Route: timeout isolation ──────────────────────────────────────────────────

describe('POST /api/ai/parse-vessel — timeout isolation (γ-1)', () => {
  it('skips email on LLMTimeoutError and returns count:0 (not a throw)', async () => {
    const { LLMTimeoutError } = jest.requireMock('@/lib/openai') as {
      LLMTimeoutError: new (msg: string) => Error;
    };

    const session = makeSession({
      emails: [makeEmail({ id: 'email-timeout' })],
      classifications: [
        { emailId: 'email-timeout', category: 'VESSEL_POSITION', confidence: 'confirmed' },
      ],
    });

    mockGetSession.mockReturnValue(session);
    mockCallAiText.mockRejectedValue(new LLMTimeoutError('timed out'));

    const res = await POST(makeRequest('sess-1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    // email skipped → 0 parsed vessels
    expect(body.count).toBe(0);
  });
});

// ── Route: sample data fast-path ──────────────────────────────────────────────

describe('POST /api/ai/parse-vessel — sample data fast-path', () => {
  it('returns cached count and skips LLM when isSampleData=true and parsedVessels pre-seeded', async () => {
    const session = makeSession({
      isSampleData: true,
      parsedVessels: [
        // minimal ParsedVessel stub
        { emailId: 'sample-1' } as SessionData['parsedVessels'][0],
      ],
    });

    mockGetSession.mockReturnValue(session);

    const res = await POST(makeRequest('sess-1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.cached).toBe(true);
    expect(body.count).toBe(1);
    expect(mockCallAiText).not.toHaveBeenCalled();
  });
});

// ── buildVesselPrompt ─────────────────────────────────────────────────────────

describe('buildVesselPrompt', () => {
  it('includes From, Subject, Date and body in the prompt', () => {
    const email = makeEmail();
    const prompt = buildVesselPrompt(email);
    expect(prompt).toContain(`From: ${email.from}`);
    expect(prompt).toContain(`Subject: ${email.subject}`);
    expect(prompt).toContain(`Date: ${email.date}`);
    expect(prompt).toContain(email.body);
  });

  it('formats fields with correct newline separators', () => {
    const email = makeEmail({ from: 'a@b.com', subject: 'Test', date: '2024-01-01' });
    const prompt = buildVesselPrompt(email);
    expect(prompt.startsWith('From: a@b.com\nSubject: Test\nDate: 2024-01-01\n\n')).toBe(true);
  });
});

// ── parseVesselAIResponse ─────────────────────────────────────────────────────

describe('parseVesselAIResponse', () => {
  it('returns a ParsedVessel on happy-path single vessel JSON', () => {
    const raw = JSON.stringify({
      vessel_name: { value: 'OCEAN STAR', confidence: 'confirmed' },
      imo: '9074729',
      flag: 'Panama',
      dwt_summer: { value: 75000, confidence: 'confirmed' },
      open_position: { value: 'Gibraltar', confidence: 'confirmed' },
      open_date: { value: '2024-01-20', confidence: 'confirmed' },
      restrictions: [],
      special_features: [],
    });
    const results = parseVesselAIResponse(raw, 'email-1');
    expect(results).toHaveLength(1);
    expect(results[0].emailId).toBe('email-1');
    expect(results[0].vesselName?.value).toBe('OCEAN STAR');
    expect(results[0].imo).toBe('9074729');
  });

  it('parses multiple vessels from an items array', () => {
    const raw = JSON.stringify({
      items: [
        { vessel_name: { value: 'SHIP A', confidence: 'confirmed' }, restrictions: [], special_features: [] },
        { vessel_name: { value: 'SHIP B', confidence: 'uncertain' }, restrictions: [], special_features: [] },
      ],
    });
    const results = parseVesselAIResponse(raw, 'email-2');
    expect(results).toHaveLength(2);
    expect(results[0].itemIndex).toBe(0);
    expect(results[1].itemIndex).toBe(1);
  });

  it('returns [] for an empty items array', () => {
    const raw = JSON.stringify({ items: [] });
    const results = parseVesselAIResponse(raw, 'email-3');
    expect(results).toHaveLength(0);
  });

  it('returns [] on malformed JSON', () => {
    const results = parseVesselAIResponse('not valid json {{{', 'email-4');
    expect(results).toEqual([]);
  });

  it('returns [] on empty string', () => {
    const results = parseVesselAIResponse('', 'email-5');
    expect(results).toEqual([]);
  });

  it('strips markdown code fences before parsing', () => {
    const raw = '```json\n' + JSON.stringify({ vessel_name: { value: 'FENCED', confidence: 'confirmed' }, restrictions: [], special_features: [] }) + '\n```';
    const results = parseVesselAIResponse(raw, 'email-6');
    expect(results).toHaveLength(1);
    expect(results[0].vesselName?.value).toBe('FENCED');
  });

  it('handles missing optional fields gracefully (returns null)', () => {
    const raw = JSON.stringify({ vessel_name: null, restrictions: [], special_features: [] });
    const results = parseVesselAIResponse(raw, 'email-7');
    expect(results).toHaveLength(1);
    expect(results[0].vesselName).toBeNull();
    expect(results[0].imo).toBeNull();
    expect(results[0].dwtSummer).toBeNull();
  });

  it('rejects an invalid IMO and stores null', () => {
    // 1234560 has checksum digit 0 but correct value is 7 — fails mod-10 check
    const raw = JSON.stringify({ imo: '1234560', restrictions: [], special_features: [] });
    const results = parseVesselAIResponse(raw, 'email-8');
    expect(results[0].imo).toBeNull();
  });
});

// ── CII rating extraction (βf-12) ─────────────────────────────────────────────

describe('parseVesselAIResponse — CII rating from subject', () => {
  it('CARBON LADY (subject "MV CARBON LADY — CII Grade D") → cii_rating=D when LLM omits it', () => {
    const raw = JSON.stringify({
      vessel_name: { value: 'CARBON LADY', confidence: 'confirmed' },
      dwt_summer: { value: 32000, confidence: 'confirmed' },
      restrictions: [],
      special_features: [],
    });
    const subject = 'MV CARBON LADY — CII Grade D — open Lagos prompt';
    const results = parseVesselAIResponse(raw, 'email-c1', subject);
    expect(results).toHaveLength(1);
    expect(results[0].vesselName?.value).toMatch(/CARBON LADY/i);
    expect(results[0].ciiRating).toBe('D');
  });

  it('subject-only CII Grade extraction (no body match) — still extracted', () => {
    const raw = JSON.stringify({
      vessel_name: { value: 'TEST VESSEL', confidence: 'confirmed' },
      restrictions: [],
      special_features: [],
    });
    const subject = 'MV TEST VESSEL — CII Grade B — looking for next';
    const results = parseVesselAIResponse(raw, 'email-c2', subject);
    expect(results[0].ciiRating).toBe('B');
  });

  it('LLM-provided cii_rating wins (no override from subject)', () => {
    const raw = JSON.stringify({
      vessel_name: { value: 'CONFLICT', confidence: 'confirmed' },
      cii_rating: 'A',
      restrictions: [],
      special_features: [],
    });
    const subject = 'MV CONFLICT — CII Grade D — somewhere';
    const results = parseVesselAIResponse(raw, 'email-c3', subject);
    expect(results[0].ciiRating).toBe('A');
  });

  it('no CII in email — ciiRating is null (not "unknown")', () => {
    const raw = JSON.stringify({
      vessel_name: { value: 'PLAIN', confidence: 'confirmed' },
      restrictions: [],
      special_features: [],
    });
    const subject = 'MV PLAIN — open Antwerp';
    const results = parseVesselAIResponse(raw, 'email-c4', subject);
    expect(results[0].ciiRating).toBeNull();
  });

  it('matches "CII D" without "Grade" keyword', () => {
    const raw = JSON.stringify({ vessel_name: { value: 'X', confidence: 'confirmed' }, restrictions: [], special_features: [] });
    const results = parseVesselAIResponse(raw, 'e', 'MV X — CII D — Lagos');
    expect(results[0].ciiRating).toBe('D');
  });

  it('does not match invalid letter (CII F)', () => {
    const raw = JSON.stringify({ vessel_name: { value: 'X', confidence: 'confirmed' }, restrictions: [], special_features: [] });
    const results = parseVesselAIResponse(raw, 'e', 'MV X — CII F — Lagos');
    expect(results[0].ciiRating).toBeNull();
  });

  it('lowercase grade in subject normalises to uppercase', () => {
    const raw = JSON.stringify({ vessel_name: { value: 'X', confidence: 'confirmed' }, restrictions: [], special_features: [] });
    const results = parseVesselAIResponse(raw, 'e', 'MV X — cii grade c — open');
    expect(results[0].ciiRating).toBe('C');
  });
});
