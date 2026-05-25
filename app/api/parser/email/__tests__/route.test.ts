import { NextRequest } from 'next/server';

jest.mock('@/lib/session', () => {
  const { NextResponse } = jest.requireActual('next/server');
  const getSession = jest.fn();
  return {
    requireSession: (req: { cookies: { get: (n: string) => { value: string } | undefined } }) => {
      const sessionId = req.cookies.get('session_id')?.value;
      if (!sessionId) return NextResponse.json({ error: 'No session' }, { status: 401 });
      const session = getSession(sessionId);
      if (!session) return NextResponse.json({ error: 'Session expired' }, { status: 401 });
      return { session, sessionId };
    },
    getSession,
  };
});

jest.mock('@/lib/ai-provider', () => ({
  callAiJson: jest.fn(),
}));

import { POST } from '@/app/api/parser/email/route';
import { callAiJson } from '@/lib/ai-provider';
import { getSession } from '@/lib/session';

const mockCallAiJson = callAiJson as jest.MockedFunction<typeof callAiJson>;
const mockGetSession = getSession as jest.MockedFunction<typeof getSession>;

function makeRequest(body: unknown, sessionId?: string): NextRequest {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (sessionId) headers['Cookie'] = `session_id=${sessionId}`;
  return new NextRequest('http://localhost/api/parser/email', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SAMPLE_SESSION: any = {
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
};

beforeEach(() => jest.clearAllMocks());

describe('POST /api/parser/email', () => {
  it('returns 401 when no session cookie', async () => {
    const res = await POST(makeRequest({ text: 'hello world' }));
    expect(res.status).toBe(401);
  });

  it('returns 400 when text is too short', async () => {
    mockGetSession.mockReturnValue(SAMPLE_SESSION);
    const res = await POST(makeRequest({ text: 'hi' }, 'sess-1'));
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/≥20/);
  });

  it('returns 400 when text field is missing', async () => {
    mockGetSession.mockReturnValue(SAMPLE_SESSION);
    const res = await POST(makeRequest({}, 'sess-1'));
    expect(res.status).toBe(400);
  });

  // PI2 behavioral test: real parse chain (mocked AI call, real parseCargoAIResponse)
  it('returns parsed cargo fields from AI response', async () => {
    mockGetSession.mockReturnValue(SAMPLE_SESSION);
    mockCallAiJson.mockResolvedValue({
      cargo_type: 'GRAIN',
      origin_port: 'Odessa',
      destination_port: 'Rotterdam',
      laycan: '15-30 Jun 2026',
      weight_mt: 55000,
    });

    const longText = 'Dear Sir,\nWe have grain cargo available from Odessa to Rotterdam.\n' +
      'Laycan 15-30 Jun 2026. Quantity 55000 mt.';
    const res = await POST(makeRequest({ text: longText }, 'sess-1'));
    expect(res.status).toBe(200);

    const body = await res.json() as { parsed: { cargo_type: string | null; load_port: string | null; discharge_port: string | null; laycan: string | null } | null };
    expect(body.parsed).not.toBeNull();
    expect(body.parsed!.cargo_type).toBe('grain');
    expect(body.parsed!.load_port).toBe('Odessa');
    expect(body.parsed!.discharge_port).toBe('Rotterdam');
    expect(body.parsed!.laycan).toBe('15-30 Jun 2026');
  });

  it('returns parsed: null when AI returns null', async () => {
    mockGetSession.mockReturnValue(SAMPLE_SESSION);
    mockCallAiJson.mockResolvedValue(null);

    const longText = 'Some broker email text that is long enough\nwith newlines\nand cargo details';
    const res = await POST(makeRequest({ text: longText }, 'sess-1'));
    expect(res.status).toBe(200);
    const body = await res.json() as { parsed: null };
    expect(body.parsed).toBeNull();
  });

  it('returns 500 when AI call throws', async () => {
    mockGetSession.mockReturnValue(SAMPLE_SESSION);
    mockCallAiJson.mockRejectedValue(new Error('LLM unavailable'));

    const longText = 'Some broker email\nwith cargo inquiry details\nand enough characters here';
    const res = await POST(makeRequest({ text: longText }, 'sess-1'));
    expect(res.status).toBe(500);
  });
});
