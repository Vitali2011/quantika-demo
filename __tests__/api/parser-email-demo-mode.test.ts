/**
 * Task 21: parser/email is blocked in DEMO_MODE (no LLM calls).
 */
import { NextRequest } from 'next/server';

jest.mock('@/lib/session', () => {
  const { NextResponse } = jest.requireActual('next/server');
  return {
    requireSession: (req: { cookies: { get: (n: string) => { value: string } | undefined } }) => {
      const sessionId = req.cookies.get('session_id')?.value;
      if (!sessionId) return NextResponse.json({ error: 'No session' }, { status: 401 });
      return { session: { id: sessionId }, sessionId };
    },
  };
});

jest.mock('@/lib/ai-provider', () => ({
  callAiJson: jest.fn(),
}));

jest.mock('@/lib/rate-limit', () => ({
  parserEmailRateLimiter: { check: jest.fn().mockReturnValue({ allowed: true, retryAfterMs: 0 }) },
}));

import { POST } from '@/app/api/parser/email/route';
import { callAiJson } from '@/lib/ai-provider';

function makeRequest(body: unknown, sessionId = 's1'): NextRequest {
  return new NextRequest('http://localhost/api/parser/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: `session_id=${sessionId}` },
    body: JSON.stringify(body),
  });
}

describe('parser/email in DEMO_MODE', () => {
  const ORIG = process.env.DEMO_MODE;

  afterEach(() => {
    process.env.DEMO_MODE = ORIG;
    jest.clearAllMocks();
  });

  it('returns 403 and does NOT call LLM', async () => {
    process.env.DEMO_MODE = 'true';
    const res = await POST(makeRequest({ text: 'Cargo inquiry: 50,000 MT iron ore from Rotterdam to Shanghai laycan 01-15 June' }));
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json).toMatchObject({ error: 'demo_mode' });
    expect(callAiJson).not.toHaveBeenCalled();
  });

  it('proceeds normally when DEMO_MODE is not set', async () => {
    process.env.DEMO_MODE = 'false';
    (callAiJson as jest.Mock).mockResolvedValue({
      cargo_type: 'BULK',
      load_port: 'Rotterdam',
      discharge_port: 'Shanghai',
      laycan: null,
    });
    const res = await POST(makeRequest({ text: 'Cargo inquiry: 50,000 MT iron ore from Rotterdam to Shanghai laycan 01-15 June' }));
    // Should proceed (may fail on parse, but LLM was called)
    expect(callAiJson).toHaveBeenCalled();
  });
});
