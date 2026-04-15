import { POST } from '../classify/route';
import { getSession, updateSession } from '@/lib/session';
import { callAiJson } from '@/lib/openai';

jest.mock('@/lib/session', () => ({
  getSession: jest.fn(),
  updateSession: jest.fn(),
}));

jest.mock('@/lib/openai', () => ({
  callAiJson: jest.fn(),
}));

jest.mock('next/server', () => ({
  NextResponse: {
    json: jest.fn((data: unknown, init?: { status?: number }) => ({
      _data: data,
      _status: init?.status ?? 200,
    })),
  },
  NextRequest: class {},
}));

const mockGetSession = getSession as jest.Mock;
const mockUpdateSession = updateSession as jest.Mock;
const mockCallAiJson = callAiJson as jest.Mock;

// Import after mocking so we get the mocked version
import { NextResponse } from 'next/server';
const mockJsonResponse = NextResponse.json as jest.Mock;

function makeRequest(sessionId?: string) {
  return {
    cookies: {
      get: (name: string) =>
        name === 'session_id' && sessionId ? { value: sessionId } : undefined,
    },
  };
}

function makeEmail(overrides: Record<string, unknown> = {}) {
  return {
    id: 'email-1',
    threadId: 'thread-1',
    from: 'sender@example.com',
    fromName: 'Sender',
    fromEmail: 'sender@example.com',
    to: 'me@mine.com',
    subject: 'Test Email',
    date: new Date().toISOString(),
    body: 'Email body content',
    snippet: 'Email body',
    labelIds: ['INBOX'],
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('classify route — auth & session guards', () => {
  it('returns 401 when no session cookie', async () => {
    await POST(makeRequest() as never);
    expect(mockJsonResponse).toHaveBeenCalledWith({ error: 'No session' }, { status: 401 });
  });

  it('returns 401 when session not found', async () => {
    mockGetSession.mockReturnValue(null);
    await POST(makeRequest('sess-123') as never);
    expect(mockJsonResponse).toHaveBeenCalledWith(
      { error: 'Session expired' },
      { status: 401 },
    );
  });

  it('returns 400 when session has no emails', async () => {
    mockGetSession.mockReturnValue({ emails: [] });
    await POST(makeRequest('sess-123') as never);
    expect(mockJsonResponse).toHaveBeenCalledWith(
      { error: 'No emails to classify' },
      { status: 400 },
    );
  });
});

describe('classify route — status derivation', () => {
  it('derives INFO_ONLY for non-reply-requiring category (VESSEL_POSITION)', async () => {
    const email = makeEmail();
    mockGetSession.mockReturnValue({ emails: [email] });
    mockCallAiJson.mockResolvedValue({
      classifications: [
        { id: 'email-1', category: 'VESSEL_POSITION', urgency: 'low', confidence: 0.9 },
      ],
    });

    await POST(makeRequest('sess-123') as never);

    const [, update] = mockUpdateSession.mock.calls[0];
    expect(update.processedEmails[0].status).toBe('INFO_ONLY');
  });

  it('derives RESPONDED for answered CARGO_INQUIRY', async () => {
    const emailDate = new Date('2024-01-10T10:00:00.000Z');
    const replyDate = new Date('2024-01-10T12:00:00.000Z');
    const email = makeEmail({ date: emailDate.toISOString(), labelIds: ['INBOX'] });
    const sentEmail = {
      ...makeEmail({ id: 'reply-1', date: replyDate.toISOString(), labelIds: ['SENT'] }),
    };
    const session = { emails: [email, sentEmail] };
    mockGetSession.mockReturnValue(session);
    mockCallAiJson.mockResolvedValue({
      classifications: [
        { id: 'email-1', category: 'CARGO_INQUIRY', urgency: 'medium', confidence: 0.85 },
      ],
    });

    await POST(makeRequest('sess-123') as never);

    const [, update] = mockUpdateSession.mock.calls[0];
    expect(update.processedEmails[0].status).toBe('RESPONDED');
  });

  it('derives NEEDS_ACTION for old unanswered CARGO_INQUIRY', async () => {
    const oldDate = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const email = makeEmail({ date: oldDate, labelIds: ['INBOX'] });
    mockGetSession.mockReturnValue({ emails: [email] });
    mockCallAiJson.mockResolvedValue({
      classifications: [
        { id: 'email-1', category: 'CARGO_INQUIRY', urgency: 'high', confidence: 0.9 },
      ],
    });

    await POST(makeRequest('sess-123') as never);

    const [, update] = mockUpdateSession.mock.calls[0];
    expect(update.processedEmails[0].status).toBe('NEEDS_ACTION');
  });

  it('derives PENDING for same-day unanswered CARGO_INQUIRY', async () => {
    const email = makeEmail({ date: new Date().toISOString(), labelIds: ['INBOX'] });
    mockGetSession.mockReturnValue({ emails: [email] });
    mockCallAiJson.mockResolvedValue({
      classifications: [
        { id: 'email-1', category: 'CARGO_INQUIRY', urgency: 'low', confidence: 0.7 },
      ],
    });

    await POST(makeRequest('sess-123') as never);

    const [, update] = mockUpdateSession.mock.calls[0];
    expect(update.processedEmails[0].status).toBe('PENDING');
  });

  it('marks stale freshness for old VESSEL_POSITION email', async () => {
    const oldDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    const email = makeEmail({ date: oldDate });
    mockGetSession.mockReturnValue({ emails: [email] });
    mockCallAiJson.mockResolvedValue({
      classifications: [
        { id: 'email-1', category: 'VESSEL_POSITION', urgency: 'low', confidence: 0.8 },
      ],
    });

    await POST(makeRequest('sess-123') as never);

    const [, update] = mockUpdateSession.mock.calls[0];
    expect(update.processedEmails[0].freshness).toBe('stale');
  });

  it('returns count of processed classifications', async () => {
    const email = makeEmail();
    mockGetSession.mockReturnValue({ emails: [email] });
    mockCallAiJson.mockResolvedValue({
      classifications: [
        { id: 'email-1', category: 'DOCUMENT', urgency: 'low', confidence: 0.95 },
      ],
    });

    await POST(makeRequest('sess-123') as never);

    expect(mockJsonResponse).toHaveBeenCalledWith({ count: 1 });
  });
});
