/**
 * Task 20: emails/fetch early-return in DEMO_MODE
 * Gmail fetch is skipped entirely — no LLM, no Google API call.
 */
import { POST } from '@/app/api/emails/fetch/route';
import * as session from '@/lib/session';
import * as google from '@/lib/google';
import { NextRequest } from 'next/server';

jest.mock('@/lib/google');
jest.mock('@/lib/email-cache');
jest.mock('@/lib/session', () => ({
  getSession: jest.fn(),
  updateSession: jest.fn().mockReturnValue(true),
}));

function req(sessionId = 's1'): NextRequest {
  return new NextRequest('http://x/api/emails/fetch', {
    method: 'POST',
    headers: { cookie: `session_id=${sessionId}` },
  });
}

describe('emails/fetch in DEMO_MODE', () => {
  const ORIG = process.env.DEMO_MODE;

  afterEach(() => {
    process.env.DEMO_MODE = ORIG;
    jest.clearAllMocks();
  });

  it('returns 200 with {skipped: "demo_mode"} and does NOT call Gmail', async () => {
    process.env.DEMO_MODE = 'true';
    (session.getSession as jest.Mock).mockReturnValue({
      id: 's1',
      isSampleData: false,
      accessToken: 'tok',
      emails: [],
      accountId: 'acc1',
    });

    const res = await POST(req());

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ skipped: 'demo_mode' });
    expect(google.fetchGmailEmails).not.toHaveBeenCalled();
  });

  it('still works normally when DEMO_MODE is not set', async () => {
    process.env.DEMO_MODE = 'false';
    (session.getSession as jest.Mock).mockReturnValue({
      id: 's1',
      isSampleData: false,
      accessToken: 'tok',
      emails: [],
      accountId: 'acc1',
    });
    (google.fetchGmailEmails as jest.Mock).mockResolvedValue([]);

    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(google.fetchGmailEmails).toHaveBeenCalled();
  });
});
