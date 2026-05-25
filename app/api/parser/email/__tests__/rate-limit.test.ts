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
  callAiJson: jest.fn().mockResolvedValue(null),
}));

import { NextRequest } from 'next/server';
import { POST } from '@/app/api/parser/email/route';

const LONG_TEXT = 'A'.repeat(20);

function makeRequest(sessionId: string): NextRequest {
  return new NextRequest('http://localhost/api/parser/email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: `session_id=${sessionId}`,
    },
    body: JSON.stringify({ text: LONG_TEXT }),
  });
}

describe('rate-limiting: /api/parser/email', () => {
  it('allows 20 requests and returns 429 on the 21st', async () => {
    // Unique key per run so module-level singleton state never bleeds across test files
    const sessionId = `rl-test-${Date.now()}-${Math.random()}`;

    for (let i = 0; i < 20; i++) {
      const res = await POST(makeRequest(sessionId));
      expect(res.status).toBe(200);
    }

    const res21 = await POST(makeRequest(sessionId));
    expect(res21.status).toBe(429);
    const body = await res21.json() as { error: string };
    expect(body.error).toMatch(/too many requests/i);
    expect(res21.headers.get('Retry-After')).not.toBeNull();
  });
});
